// Anthropic API key storage. See BLUEPRINT.md §6 (Storage strategy).
//
// Strategy: encrypt at rest with a user-chosen passphrase, decrypt once per
// session and keep the cleartext in a closure (never on `window`).
//
// Layout in localStorage (keyed by API_KEY_STORAGE):
//   { v: 1, salt: <b64>, iv: <b64>, ct: <b64>, hint: <last4> }
//
//   v     — format version, bump on schema change
//   salt  — 16 random bytes, PBKDF2 input
//   iv    — 12 random bytes, AES-GCM input
//   ct    — AES-GCM-encrypted UTF-8 of the API key
//   hint  — last 4 chars of the plaintext key, for UI ("ends in …xyz")
//
// PBKDF2-SHA256, 250k iterations. AES-GCM-256.

const API_KEY_STORAGE = 'garden_journal_api_key_v1';
const PBKDF2_ITERATIONS = 250000;

let cachedPlaintextKey = null;  // session-only; cleared on lock()

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function readEnvelope() {
  try {
    const raw = localStorage.getItem(API_KEY_STORAGE);
    if (!raw) return null;
    const env = JSON.parse(raw);
    if (env.v !== 1) return null;
    return env;
  } catch { return null; }
}

export function hasStoredKey() { return readEnvelope() !== null; }
export function getKeyHint()   { return readEnvelope()?.hint || null; }
export function isUnlocked()   { return cachedPlaintextKey !== null; }
export function lock()         { cachedPlaintextKey = null; }

export async function setApiKey(plaintextKey, passphrase) {
  if (!plaintextKey || !passphrase) throw new Error('setApiKey: key and passphrase required.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(passphrase, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintextKey));
  const env = {
    v: 1,
    salt: b64(salt),
    iv:   b64(iv),
    ct:   b64(ct),
    hint: plaintextKey.slice(-4),
  };
  localStorage.setItem(API_KEY_STORAGE, JSON.stringify(env));
  cachedPlaintextKey = plaintextKey;
  return env.hint;
}

export async function unlock(passphrase) {
  const env = readEnvelope();
  if (!env) throw new Error('No stored API key.');
  const key = await deriveKey(passphrase, unb64(env.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct));
    cachedPlaintextKey = new TextDecoder().decode(pt);
    return true;
  } catch {
    // AES-GCM throws on auth-tag mismatch — i.e. wrong passphrase.
    throw new Error('Wrong passphrase.');
  }
}

export function getApiKey() {
  return cachedPlaintextKey;
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE);
  cachedPlaintextKey = null;
}
