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
// and awaited before anything is forwarded.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DAILY_LIMIT = 40;
const MAX_TEXT = 600;
const MAX_HISTORY = 8;
const MAX_GARDEN = 40;

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

function system(palName: string, garden: string[]) {
  return `You are ${palName}, a friendly garden helper. Every reply is read aloud by text to speech.
Rules for every reply:
- Two to four short sentences. Plain spoken words. No lists, markdown, emoji, symbols or links.
- Write numbers so they read well aloud, like "two to four inches".
- Keep what the person told you apart from your guess, and say what would prove the guess wrong.
- If a claim is folklore or untested, say so. Offer next steps, do not order the person around.
- Only garden, yard, plant, soil, water, compost and outdoor growing topics. Politely steer back otherwise.
The person's garden: ${garden.length ? garden.join('; ') : 'nothing logged yet'}.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json(401, { error: 'missing_token' });
  const { data: u, error: uErr } = await admin.auth.getUser(jwt);
  if (uErr || !u?.user) return json(401, { error: 'invalid_token' });

  // Atomic claim: counts and inserts under one advisory lock, refuses at cap.
  const { data: ok, error: qErr } = await admin.rpc('claim_pal_call', { p_user: u.user.id, p_daily: DAILY_LIMIT });
  if (qErr) return json(500, { error: 'quota_failed' });
  if (!ok) return json(429, { error: 'quota_exhausted', daily_limit: DAILY_LIMIT });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_body' }); }
  const text = clip(body?.text, MAX_TEXT).trim();
  if (!text) return json(400, { error: 'empty' });
  const palName = clip(body?.palName, 30) || 'Pip';
  const garden = (Array.isArray(body?.garden) ? body.garden : []).slice(0, MAX_GARDEN).map((g: unknown) => clip(g, 80));
  const history = (Array.isArray(body?.history) ? body.history : []).slice(-MAX_HISTORY)
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.text === 'string')
    .map((m: any) => ({ role: m.role, content: clip(m.text, MAX_TEXT) }));
  // The API needs the first turn to be the user and roles to alternate.
  while (history.length && history[0].role !== 'user') history.shift();
  const messages = [...history, { role: 'user' as const, content: text }];

  try {
    const res: any = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2048, // short spoken replies; a hard cost cap per call
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: system(palName, garden),
      messages,
    } as any);
    if (res.stop_reason === 'refusal') return json(200, { text: 'I cannot help with that one. Ask me something about your garden.' });
    const out = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').trim();
    return json(200, { text: out || null });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'busy' });
    if (e instanceof Anthropic.APIError) return json(502, { error: 'upstream', status: e.status });
    return json(502, { error: 'upstream' });
  }
});
