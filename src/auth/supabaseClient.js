import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Current session access token — set by authManager after login/refresh.
let _token = null;

export function setToken(token) { _token = token; }
export function clearToken()    { _token = null; }

function _headers(extra) {
  const h = { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY };
  if (_token) h['Authorization'] = 'Bearer ' + _token;
  if (extra) Object.assign(h, extra);
  return h;
}

async function _throw(r) {
  let data = {};
  try { data = await r.json(); } catch (e) {}
  throw new Error(data.error_description || data.message || data.msg || data.hint || ('HTTP ' + r.status));
}

// ── Auth (GoTrue REST API) ──────────────────────────────────────────────────

export async function authSignUp(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/signup', {
    method: 'POST', headers: _headers(), body: JSON.stringify({ email, password }),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function authSignIn(email, password) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: _headers(), body: JSON.stringify({ email, password }),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function authRefresh(refreshTok) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', headers: _headers(), body: JSON.stringify({ refresh_token: refreshTok }),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function authSignOut() {
  await fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: _headers() });
}

// ── Database (PostgREST) ────────────────────────────────────────────────────
// params.filters: object like { 'user_id': 'eq.abc', 'zone_id': 'in.(a,b,c)' }
// params.order:   string like 'created_at.asc'
// params.select:  column list like 'id,name,type'

export async function dbSelect(table, params) {
  const q = new URLSearchParams();
  const p = params || {};
  if (p.select) q.set('select', p.select);
  if (p.order)  q.set('order',  p.order);
  const filters = p.filters || {};
  for (const [k, v] of Object.entries(filters)) q.set(k, v);
  const qs = q.toString();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${qs ? '?' + qs : ''}`, { headers: _headers() });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function dbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: _headers({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function dbUpsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: _headers({ 'Prefer': 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function dbUpdate(table, filters, patch) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) q.set(k, v);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
    method: 'PATCH',
    headers: _headers({ 'Prefer': 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) await _throw(r);
  return r.json();
}

export async function dbDelete(table, filters) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) q.set(k, v);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, {
    method: 'DELETE', headers: _headers(),
  });
  if (!r.ok) await _throw(r);
}
