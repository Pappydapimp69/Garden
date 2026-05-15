// LocalStorage cache for AI-generated plant care advice. One row per plant
// id (not species) — refreshing analyzes the current photo + journal again,
// so the advice can change over a plant's lifetime.
//
// Envelope shape:
//   { [plant_id]: { advice, fetched_at, image_used } }
//
//   advice      — the parsed JSON response from careAdvice.js
//   fetched_at  — epoch ms when the response was received
//   image_used  — reference photo dataUrl that was sent (or null); lets the
//                 UI show "advice was based on a different photo" if the
//                 zone's reference has since changed.

const STORAGE = 'garden_journal_care_cache_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeAll(obj) {
  try { localStorage.setItem(STORAGE, JSON.stringify(obj)); }
  catch (e) { console.warn('careCache write failed', e); }
}

export function get(plantId) {
  if (!plantId) return null;
  return readAll()[plantId] || null;
}

export function set(plantId, advice, imageUsed = null) {
  if (!plantId) return;
  const all = readAll();
  all[plantId] = { advice, fetched_at: Date.now(), image_used: imageUsed };
  writeAll(all);
}

export function clearOne(plantId) {
  const all = readAll();
  if (plantId in all) { delete all[plantId]; writeAll(all); }
}

export function clear() {
  try { localStorage.removeItem(STORAGE); }
  catch (e) { console.warn('careCache clear failed', e); }
}
