// Garden Pal cloud brain.
//
// Deploy:
//   psql < supabase/pal_chat.sql            (quota ledger + atomic claim)
//   supabase functions deploy pal-chat --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-...
//
// Brain lessons applied (security): the client never sends a raw API body.
// Model, effort and max_tokens are pinned here, input fields are allow-listed
// and length-clamped, and the per-user quota is claimed atomically in the DB
// and awaited before anything is forwarded. Actions the model returns are
// only suggestions; the client validates each one before applying it.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DAILY_LIMIT = 60;
const MAX_TEXT = 600;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const clipList = (v: unknown, count: number, n: number) =>
  (Array.isArray(v) ? v : []).slice(0, count).map((x) => clip(x, n)).filter(Boolean);

// Every field required, so the schema works with strict structured output.
const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'actions'],
  properties: {
    say: { type: 'string', description: 'What Pip says out loud.' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'plant', 'bed', 'count', 'start', 'date', 'text'],
        properties: {
          type: { type: 'string', enum: ['add_plant', 'set_start', 'set_days', 'log_water', 'log_feed', 'log_note', 'remind', 'remember', 'forget'] },
          plant: { type: 'string', description: 'Plant name, or empty.' },
          bed: { type: 'string', description: 'Bed name, or empty.' },
          count: { type: 'integer', description: 'Plant count, packet days for set_days, or days until a reminder. 0 if unused.' },
          start: { type: 'string', enum: ['seed', 'transplant', ''] },
          date: { type: 'string', description: 'YYYY-MM-DD planting date, or empty for today.' },
          text: { type: 'string', description: 'Reminder, note, or memory text. Empty if unused.' },
        },
      },
    },
  },
};

function system(b: Record<string, unknown>) {
  const pal = clip(b.palName, 30) || 'Pip';
  const user = clip(b.userName, 40);
  const list = (label: string, items: string[]) => `${label}:\n${items.length ? items.map((x) => `- ${x}`).join('\n') : '- none'}`;
  return `You are ${pal}, a warm, practical garden pal${user ? ` talking with ${user}` : ''}. What you "say" is read aloud by text to speech.

How to talk:
- Sound like a knowledgeable friend. Two to five short sentences. Plain spoken words.
- No lists, markdown, emoji, symbols or links. Write numbers so they read well aloud.
- Keep what the person told you apart from your guess, and say what would prove the guess wrong.
- Say plainly when something is folklore, untested, or an estimate. Offer next steps; never order the person around.
- Use the garden facts below. Their growth numbers come from heat units and are estimates; the plant itself is the real test.
- The offline hint is from ${pal}'s own rule engine and garden math. Trust its numbers, but fix its tone or fill gaps.
- If a question is outside gardening, yard, plants, soil, water, compost or growing food, steer back kindly.
- Ask one short question when you need a missing detail, like seed or transplant, or the packet's days to maturity.

Actions: only when the person clearly says they did something or asks you to. Use "remember" for lasting facts about their garden or preferences that are not already in memory (soil type, a pest they fight, what they like to grow). Use "forget" if they ask. Never invent actions.

Today: ${clip(b.today, 10)}. ${clip(b.frost, 80)}.
Weather: ${clip(b.weather, 300) || 'unknown'}

${list('Garden', clipList(b.garden, 40, 240))}

${list('Recent journal', clipList(b.journal, 10, 120))}

${list('What you remember about this gardener', clipList(b.memory, 30, 160))}

Offline hint for this message: ${clip(b.hint, 600) || 'none'}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json(401, { error: 'missing_token' });
  const { data: u, error: uErr } = await admin.auth.getUser(jwt);
  if (uErr || !u?.user) return json(401, { error: 'invalid_token' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_body' }); }
  const text = clip(body?.text, MAX_TEXT).trim();
  if (!text) return json(400, { error: 'empty' });

  // Atomic claim: counts and inserts under one advisory lock, refuses at cap.
  const { data: ok, error: qErr } = await admin.rpc('claim_pal_call', { p_user: u.user.id, p_daily: DAILY_LIMIT });
  if (qErr) return json(500, { error: 'quota_failed' });
  if (!ok) return json(429, { error: 'quota_exhausted', daily_limit: DAILY_LIMIT });

  const history = (Array.isArray(body.history) ? body.history : []).slice(-12)
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.text === 'string')
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: clip(m.text, MAX_TEXT) }));
  // The client logs the new message before sending; don't send it twice.
  const last = history[history.length - 1];
  if (last?.role === 'user' && last.content.trim() === text) history.pop();
  while (history.length && history[0].role !== 'user') history.shift();

  try {
    const res: any = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4096, // short spoken replies; a hard cost cap per call
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: system(body),
      messages: [...history, { role: 'user', content: text }],
    } as any);
    if (res.stop_reason === 'refusal') return json(200, { say: 'I cannot help with that one. Ask me something about your garden.', actions: [] });
    const raw = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    let out: any;
    try { out = JSON.parse(raw); } catch { return json(502, { error: 'bad_output' }); }
    return json(200, { say: clip(out.say, 1200), actions: Array.isArray(out.actions) ? out.actions.slice(0, 10) : [] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'busy' });
    if (e instanceof Anthropic.APIError) return json(502, { error: 'upstream', status: e.status });
    return json(502, { error: 'upstream' });
  }
});
