// Runtime state and a tiny event bus. UI modules subscribe to events and
// re-render in response, instead of calling each other directly.

export const session = {
  currentZoneId: null,
  currentTab: 'map',

  // Map view
  zoom: 1, panX: 0, panY: 0, baseW: 0, baseH: 0, imgRatio: 16 / 9,

  // Pointer / gesture
  mode: 'idle',                      // 'idle' | 'add-press' | 'tag-press' | 'tag-drag' | 'pan' | 'pinch'
  pressTimer: null,
  hintDelayTimer: null,
  singleTapTimer: null,
  pressStart: null,
  pressTagId: null,
  dragPos: null,                     // latest pct during tag-drag; persisted once on drop
  panStart: null,
  activePointers: new Map(),
  pinchStart: null,
  lastTapTime: {},

  // Dialog/edit
  pendingPos: null,
  editingPlantId: null,
  pendingZoneId: null,
};

const subscribers = new Map();
export const events = {
  on(name, fn)   { if (!subscribers.has(name)) subscribers.set(name, new Set()); subscribers.get(name).add(fn); },
  off(name, fn)  { subscribers.get(name)?.delete(fn); },
  emit(name, payload) {
    const set = subscribers.get(name);
    if (set) for (const fn of set) { try { fn(payload); } catch (e) { console.error(`event ${name}:`, e); } }
  },
};

// Event names — listing them here so they're greppable and not strewn as bare strings.
export const EV = {
  ZONES_CHANGED:  'zones:changed',
  PLANTS_CHANGED: 'plants:changed',   // payload: { zoneId }
  JOURNAL_CHANGED:'journal:changed',  // payload: { zoneId }
  PROGRESS_CHANGED: 'progress:changed',
  TOAST: 'toast',                     // payload: { msg, kind? }
  NAV_OVERVIEW: 'nav:overview',
  NAV_ZONE: 'nav:zone',               // payload: { zoneId }
};
