// Longitudinal insight engine (honest-null by design).
//
// The retention thesis behind this (plant-network / longitudinal-insight
// kernel): a reflection log only earns continued logging if it occasionally
// returns a *weirdly specific* observation — so it must stay silent the rest of
// the time rather than manufacture filler. Every insight here therefore:
//   • cites a specific entity (a zone) + a specific time/number,
//   • draws on at least MIN_ENTRIES real entries for that zone,
//   • clears a confidence bar, and
//   • differs from the last insight shown (caller passes lastKey).
// generateInsight() returns at MOST one insight (highest confidence) or null.
//
// Pure and deterministic: `now` and `lastKey` are passed in, never read from
// the clock or storage here, so every branch is unit-testable.

export const MIN_ENTRIES = 3;
const CONF_MIN = 0.6;
const DAY = 86_400_000;

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
}
function fmtDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Group entries by zone, each sorted oldest→newest, keeping only zones with
// enough history to say anything honest.
function byZone(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (!e || !e.zone_id || !e.entry_date) continue;
    if (!groups.has(e.zone_id)) groups.set(e.zone_id, []);
    groups.get(e.zone_id).push(e);
  }
  for (const [, list] of groups) list.sort((a, b) => a.entry_date - b.entry_date);
  return [...groups.values()].filter(list => list.length >= MIN_ENTRIES);
}

// ── Generators — each returns { key, confidence, text } | null ──────────────

// temporal_pattern: the zone has a rhythm and this visit is overdue against it.
function cadenceBreak(list, now) {
  const dates = list.map(e => e.entry_date);
  const gaps = [];
  for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY);
  const med = median(gaps);
  if (med < 1) return null;                       // no meaningful cadence
  const sinceLast = (now - dates[dates.length - 1]) / DAY;
  const mult = sinceLast / med;
  if (mult < 1.75) return null;                   // not actually overdue
  // Regularity: low coefficient of variation → a real, trustworthy rhythm.
  const cv = stdev(gaps) / (mean(gaps) || 1);
  const regularity = clamp01(1 - cv);
  const confidence = clamp01(0.35 + 0.35 * regularity + 0.3 * clamp01((mult - 1.75) / 2));
  const zone = list[0].zone_name || 'a zone';
  return {
    key: `cadence:${list[0].zone_id}`,
    confidence,
    text: `It's been ${Math.round(sinceLast)} days since you logged ${zone} — `
        + `about ${mult.toFixed(1)}× your usual ~${Math.round(med)}-day rhythm.`,
  };
}

// health_shift: plant count moved steadily one direction across recent visits.
function countTrend(list, now) {
  const recent = list.slice(-Math.max(MIN_ENTRIES, Math.min(list.length, 5)));
  const counts = recent.map(e => Number(e.plant_count) || 0);
  let up = true, down = true;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] <= counts[i - 1]) up = false;
    if (counts[i] >= counts[i - 1]) down = false;
  }
  if (!up && !down) return null;                  // not monotonic
  const delta = Math.abs(counts[counts.length - 1] - counts[0]);
  if (delta < 2) return null;
  const confidence = clamp01(0.45 + 0.08 * (counts.length - MIN_ENTRIES) + 0.1 * Math.min(4, delta));
  const zone = recent[0].zone_name || 'a zone';
  const dir = up ? 'grown' : 'dropped';
  return {
    key: `trend:${recent[0].zone_id}:${up ? 'up' : 'down'}`,
    confidence,
    text: `${zone} has ${dir} from ${counts[0]} to ${counts[counts.length - 1]} tagged `
        + `plants across your last ${counts.length} check-ins.`,
  };
}

// contradiction: a rise then a fall (or vice-versa) — an interior extreme that
// both ends fall well short of.
function peakDip(list, now) {
  const counts = list.map(e => Number(e.plant_count) || 0);
  let peakIdx = 0;
  for (let i = 1; i < counts.length - 1; i++) if (counts[i] > counts[peakIdx]) peakIdx = i;
  // require the extreme to be interior and clearly above both ends
  const first = counts[0], last = counts[counts.length - 1], peak = counts[peakIdx];
  if (peakIdx === 0 || peakIdx === counts.length - 1) return null;
  if (peak - first < 2 || peak - last < 2) return null;
  const confidence = clamp01(0.5 + 0.1 * Math.min(4, Math.min(peak - first, peak - last)));
  const zone = list[0].zone_name || 'a zone';
  return {
    key: `peak:${list[0].zone_id}`,
    confidence,
    text: `${zone} peaked at ${peak} tagged plants around ${fmtDate(list[peakIdx].entry_date)}, `
        + `but you're back to ${last} now.`,
  };
}

const GENERATORS = [cadenceBreak, countTrend, peakDip];

// Return the single best insight across all zones, or null. `lastKey` is the
// key of the previously-shown insight; we never return the same one twice.
export function generateInsight(entries, { now, lastKey = null } = {}) {
  if (!Array.isArray(entries) || entries.length < MIN_ENTRIES) return null;
  if (now == null) return null;
  const candidates = [];
  for (const zone of byZone(entries)) {
    for (const gen of GENERATORS) {
      const ins = gen(zone, now);
      if (ins && ins.confidence >= CONF_MIN && ins.key !== lastKey) candidates.push(ins);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0];
}
