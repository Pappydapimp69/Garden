import { getSession } from '../auth/authManager.js';
import { dbInsert } from '../auth/supabaseClient.js';

// Fields allowed in the anonymized global log (no PII, no user-generated text).
const GLOBAL_SAFE_FIELDS = ['plant_count', 'zone_type', 'confidence', 'category', 'amount'];

function sanitizeForGlobal(payload) {
  const safe = {};
  for (const k of GLOBAL_SAFE_FIELDS) {
    if (payload[k] !== undefined) safe[k] = payload[k];
  }
  return safe;
}

// Fire-and-forget dual-write. Never throws.
// Writes to user_action_log (private, full payload) and
// global_action_log (anonymized, numeric/categorical fields only).
export function logAction(type, payload) {
  const s = getSession();
  if (!s) return;
  const now = new Date().toISOString();
  const p = payload || {};

  dbInsert('user_action_log', {
    user_id: s.user_id, action_type: type, payload: p, created_at: now,
  }).catch(e => console.warn('user_action_log write failed:', e));

  dbInsert('global_action_log', {
    action_type: type, payload: sanitizeForGlobal(p), created_at: now,
  }).catch(e => console.warn('global_action_log write failed:', e));
}
