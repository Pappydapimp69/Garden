// Client-side read of the vision_api_calls ledger for the Settings meter.
// The edge function is the source of truth — this is purely for display.
// RLS guarantees we only see our own rows.

import { dbSelect } from '../auth/supabaseClient.js';
import { getSession } from '../auth/authManager.js';
import { events, EV } from '../state/session.js';
import { VISION_DAILY_LIMIT, VISION_LIFETIME_LIMIT } from '../config.js';

let _cache = null;     // { uid, summary, fetchedAt }
const CACHE_MS = 30_000;

events.on(EV.VISION_CALLED, () => { _cache = null; });

function utcMidnight() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function nextUtcMidnight() {
  return utcMidnight() + 86_400_000;
}

export async function getQuotaSummary({ force = false } = {}) {
  const s = getSession();
  if (!s) throw new Error('Not signed in');

  if (!force && _cache && _cache.uid === s.user_id && (Date.now() - _cache.fetchedAt) < CACHE_MS) {
    return _cache.summary;
  }

  const rows = await dbSelect('vision_api_calls', {
    select: 'called_at',
    filters: { user_id: 'eq.' + s.user_id },
  });

  const midnight = utcMidnight();
  let usedToday = 0;
  for (const r of rows) {
    if (Date.parse(r.called_at) >= midnight) usedToday += 1;
  }
  const usedTotal = rows.length;

  const summary = {
    usedToday,
    usedTotal,
    dailyLimit:     VISION_DAILY_LIMIT,
    lifetimeLimit:  VISION_LIFETIME_LIMIT,
    remainingToday: Math.max(0, VISION_DAILY_LIMIT - usedToday),
    remainingTotal: Math.max(0, VISION_LIFETIME_LIMIT - usedTotal),
    exhausted:      usedToday >= VISION_DAILY_LIMIT || usedTotal >= VISION_LIFETIME_LIMIT,
    resetAt:        nextUtcMidnight(),
  };

  _cache = { uid: s.user_id, summary, fetchedAt: Date.now() };
  return summary;
}

export function invalidateQuotaCache() { _cache = null; }
