// Vision proxy: forwards Anthropic Messages API requests with either the
// master key (under a per-user free-tier quota stored in user_profiles) or
// the user's own key (passed in `x-user-api-key`).
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy vision
//
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const ANTHROPIC_VERSION = '2023-06-01';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-user-api-key, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') || '';
  const jwt  = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_authenticated' }, 401);

  let body: unknown;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const userKey = (req.headers.get('x-user-api-key') || '').trim();
  const useMaster = !userKey;

  if (useMaster) {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'server_misconfigured', detail: 'ANTHROPIC_API_KEY not set' }, 500);
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + jwt } },
      auth:   { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.rpc('try_use_vision_quota');
    if (error) return json({ error: 'quota_check_failed', detail: error.message }, 401);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.allowed) {
      return json({
        code: 'quota_exceeded',
        today_used:     row?.today_used     ?? 0,
        total_used:     row?.total_used     ?? 0,
        daily_limit:    row?.daily_limit    ?? 10,
        lifetime_limit: row?.lifetime_limit ?? 100,
      }, 402);
    }
  }

  const apiKey = useMaster ? ANTHROPIC_API_KEY : userKey;
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
    },
  });
});
