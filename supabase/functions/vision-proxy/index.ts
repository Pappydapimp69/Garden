// Vision proxy edge function.
//
// Deploy:
//   supabase functions deploy vision-proxy --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-...
//
// We pass --no-verify-jwt because we verify the JWT manually (so we can return
// a structured 401 instead of the platform default) — auth is still mandatory.
//
// The function is the sole source of truth for the per-user quota that the app
// covers (10/day UTC, 100/lifetime). It checks the ledger, inserts a new row,
// then forwards the request body to api.anthropic.com.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DAILY_LIMIT    = 10;
const LIFETIME_LIMIT = 100;

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function utcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'method_not_allowed' });

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = req.headers.get('Authorization') || '';
  const jwt  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return json(401, { error: 'missing_token' });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: 'invalid_token' });
  const userId = userData.user.id;

  // ── Quota check ──────────────────────────────────────────────────────────
  const since = utcMidnightIso();
  const [{ count: todayCount, error: todayErr }, { count: lifetimeCount, error: lifeErr }] = await Promise.all([
    admin.from('vision_api_calls').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('called_at', since),
    admin.from('vision_api_calls').select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);
  if (todayErr || lifeErr) return json(500, { error: 'quota_lookup_failed', detail: (todayErr || lifeErr)?.message });

  const today    = todayCount    ?? 0;
  const lifetime = lifetimeCount ?? 0;
  if (today >= DAILY_LIMIT || lifetime >= LIFETIME_LIMIT) {
    return json(429, {
      error: 'quota_exhausted',
      today, lifetime,
      daily_limit: DAILY_LIMIT,
      lifetime_limit: LIFETIME_LIMIT,
    });
  }

  // ── Record + forward ─────────────────────────────────────────────────────
  // Insert first so a slow Anthropic response can't be cancelled to dodge the
  // counter. Best-effort: if the insert fails we still forward (we'd rather
  // serve the user than block on bookkeeping).
  admin.from('vision_api_calls').insert({ user_id: userId }).then(({ error }) => {
    if (error) console.warn('vision_api_calls insert failed:', error.message);
  });

  let body: string;
  try { body = await req.text(); }
  catch { return json(400, { error: 'invalid_body' }); }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'x-api-key':        ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      ...CORS,
    },
  });
});
