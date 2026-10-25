// Local storage with try/catch on every access: private windows and
// previews can throw. The app must still run with an empty store.

const KEY = 'gardenPal.v1';

const DEFAULTS = () => ({
  settings: {
    name: '', palName: 'Pip', voice: true, rate: 1, voiceName: '',
    lastFrost: '03-15', firstFrost: '11-15', lat: null, lon: null,
    mulched: true, cloudUrl: '', cloudToken: '', cloudRefresh: '', cloudExpires: 0, cloudEmail: '',
  },
  plants: [],   // { uid, id, label, bed, planted, lastWatered, lastFed, notes }
  journal: [],  // { at, text, plantUid? }
  reminders: [],// { uid, text, due, done }
  chat: [],     // { role: 'pal'|'me', text, at }
  memory: [],   // short facts the cloud pal chose to remember about this gardener
});

let mem = null;

export function load() {
  if (mem) return mem;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch {}
  const base = DEFAULTS();
  try { mem = raw ? { ...base, ...JSON.parse(raw) } : base; } catch { mem = base; }
  mem.settings = { ...base.settings, ...mem.settings };
  return mem;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {}
}

export function reset() { mem = DEFAULTS(); save(); return mem; }

export const uid = () => Math.random().toString(36).slice(2, 10);

export function addPlant(state, plant, { bed = 'main bed', planted = today(), label, start = null, days = null } = {}) {
  // start: 'seed' | 'transplant' | null (unknown, assume the usual way).
  // days: the seed packet's days to maturity, if the user gave it.
  const p = { uid: uid(), id: plant.id, label: label || plant.name, bed, planted, start, days, lastWatered: planted, lastFed: planted, notes: '' };
  state.plants.push(p);
  log(state, `Planted ${p.label} in the ${bed}.`, p.uid);
  return p;
}

export function log(state, text, plantUid) {
  state.journal.unshift({ at: new Date().toISOString(), text, plantUid });
  if (state.journal.length > 500) state.journal.length = 500;
}

export function today(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 86400000);
}
