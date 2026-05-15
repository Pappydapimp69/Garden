import { authSignIn, authSignUp, authRefresh, authSignOut, setToken, clearToken } from './supabaseClient.js';

const STORAGE_KEY = 'garden_auth_v1';

// { user_id, email, access_token, refresh_token, expires_at }
let _session = null;

export function getSession() { return _session; }

function _fromData(data) {
  const user = data.user || {};
  return {
    user_id:       user.id  || data.user_id  || null,
    email:         user.email || data.email  || null,
    access_token:  data.access_token         || null,
    refresh_token: data.refresh_token        || null,
    expires_at:    Date.now() + ((data.expires_in || 3600) * 1000),
  };
}

function _persist(s) {
  _session = s;
  if (s) {
    setToken(s.access_token);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  } else {
    clearToken();
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
}

// Try to restore a prior session from localStorage.
// Returns a session object on success, null if not authenticated.
export async function initAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (!stored.refresh_token) return null;
    const data = await authRefresh(stored.refresh_token);
    const s = _fromData(data);
    _persist(s);
    return s;
  } catch (e) {
    _persist(null);
    return null;
  }
}

export async function login(email, password) {
  const data = await authSignIn(email, password);
  const s = _fromData(data);
  _persist(s);
  return s;
}

export async function signup(email, password) {
  const data = await authSignUp(email, password);
  // If Supabase returned a session directly (email confirmation disabled), use it.
  if (data.access_token) {
    const s = _fromData(data);
    _persist(s);
    return s;
  }
  // Email confirmation required — caller should show "check your email" message.
  return null;
}

export async function logout() {
  const s = _session;
  _persist(null);
  if (s) await authSignOut().catch(() => {});
}
