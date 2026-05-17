// Per-user Anthropic API key vault.
//
// Storage layout (localStorage):
//   garden_apikey_v1_<user_id> = base64( salt(16) | iv(12) | ciphertext )
//
// Encryption: PBKDF2-SHA-256(password, salt, 200_000 iters) → AES-GCM-256 key.
// The plaintext key + the user-supplied password are cached in module memory
// after the first successful decrypt so we don't re-prompt on every call.
//
// We also persist a non-secret hint (last 4 chars of the key) to
// user_profiles.api_key_hint so the Settings UI can show "key set" status
// across devices without unlocking anything.

import { getSession } from './authManager.js';
import { dbUpdate } from './supabaseClient.js';

const ITERATIONS = 200_000;
const STORAGE_PREFIX = 'garden_apikey_v1_';

let _cachedKey      = null;   // decrypted plaintext, this page only
let _cachedPassword = null;   // so re-encrypting after rotation doesn't re-prompt
let _cachedForUser  = null;

function storageKey(uid) { return STORAGE_PREFIX + uid; }

function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function hintFor(key) {
  const k = String(key || '');
  if (k.length < 4) return null;
  return k.slice(0, 3) + '…' + k.slice(-4);
}

function currentUid() {
  const s = getSession();
  return s ? s.user_id : null;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function hasApiKey() {
  const uid = currentUid();
  if (!uid) return false;
  try { return !!localStorage.getItem(storageKey(uid)); } catch { return false; }
}

export function getApiKeyHint() {
  const uid = currentUid();
  if (!uid) return null;
  // Read whatever the seed/refresh wrote into user_profiles.api_key_hint.
  try {
    const raw = localStorage.getItem(storageKey(uid) + '_hint');
    return raw || null;
  } catch { return null; }
}

export async function setApiKey(apiKey, password) {
  const uid = currentUid();
  if (!uid) throw new Error('Not signed in');
  if (!apiKey || !password) throw new Error('Key and password required');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const ct   = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey),
  ));

  const blob = new Uint8Array(salt.length + iv.length + ct.length);
  blob.set(salt, 0);
  blob.set(iv,   salt.length);
  blob.set(ct,   salt.length + iv.length);
  localStorage.setItem(storageKey(uid), bytesToB64(blob));

  const hint = hintFor(apiKey);
  localStorage.setItem(storageKey(uid) + '_hint', hint || '');

  _cachedKey      = apiKey;
  _cachedPassword = password;
  _cachedForUser  = uid;

  // Sync the hint server-side, best-effort.
  dbUpdate('user_profiles', { id: 'eq.' + uid }, { api_key_hint: hint })
    .catch(e => console.warn('api_key_hint sync failed:', e.message || e));
}

// promptForPassword: () => Promise<string|null>
// Returns null if the user cancels the prompt.
export async function getApiKey({ promptForPassword } = {}) {
  const uid = currentUid();
  if (!uid) throw new Error('Not signed in');
  if (_cachedKey && _cachedForUser === uid) return _cachedKey;

  const raw = localStorage.getItem(storageKey(uid));
  if (!raw) throw new Error('No API key set');
  const blob = b64ToBytes(raw);
  const salt = blob.slice(0, 16);
  const iv   = blob.slice(16, 28);
  const ct   = blob.slice(28);

  // Try the cached password first (e.g. just-set in this session).
  if (_cachedPassword) {
    try {
      const key = await deriveKey(_cachedPassword, salt);
      const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      _cachedKey = new TextDecoder().decode(pt);
      _cachedForUser = uid;
      return _cachedKey;
    } catch { _cachedPassword = null; }
  }

  if (!promptForPassword) throw new Error('Password required to unlock API key');

  while (true) {
    const pw = await promptForPassword();
    if (pw == null) throw new Error('Cancelled');
    try {
      const key = await deriveKey(pw, salt);
      const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      _cachedKey      = new TextDecoder().decode(pt);
      _cachedPassword = pw;
      _cachedForUser  = uid;
      return _cachedKey;
    } catch {
      // loop; promptForPassword is expected to surface "wrong password" itself
      // on the next iteration if it wants to.
    }
  }
}

export async function clearApiKey() {
  const uid = currentUid();
  if (!uid) return;
  try { localStorage.removeItem(storageKey(uid)); } catch {}
  try { localStorage.removeItem(storageKey(uid) + '_hint'); } catch {}
  _cachedKey = null;
  _cachedPassword = null;
  _cachedForUser = null;
  dbUpdate('user_profiles', { id: 'eq.' + uid }, { api_key_hint: null })
    .catch(e => console.warn('api_key_hint clear failed:', e.message || e));
}

export function lockSession() {
  _cachedKey = null;
  _cachedPassword = null;
  _cachedForUser = null;
}
