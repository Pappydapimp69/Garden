// Care timing: watering, harvest windows, and what to sow now.
// Suggestions are offered, never assigned: the user ticks what they do.

import { getPlant, PLANTS } from './plants.js';
import { today, daysBetween } from './store.js';
import { progress, sayProgress } from './growth.js';

// Interval after weather and mulch. Brain: mulch stretches watering
// intervals (it does not replace deep watering); heat shortens them.
export function waterInterval(plant, { weather, mulched } = {}) {
  let d = plant.waterEvery;
  if (mulched) d *= 1.4;
  if (weather && weather.high >= 95) d *= 0.6;
  else if (weather && weather.high >= 88) d *= 0.8;
  return Math.max(1, Math.round(d));
}

export function waterStatus(entry, ctx = {}) {
  const plant = getPlant(entry.id);
  if (!plant) return null;
  const now = ctx.now || today();
  const every = waterInterval(plant, ctx);
  const since = daysBetween(entry.lastWatered, now);
  const rain = ctx.weather && (ctx.weather.rainToday >= 0.5 || ctx.weather.rainTomorrow >= 0.5);
  return { every, since, due: since >= every && !rain, skipForRain: since >= every && rain };
}

// Harvest status from accumulated heat (see growth.js).
export function harvestWindow(entry, temps, now = today()) {
  return progress(entry, temps, now);
}

function mmdd(year, md) { return new Date(`${year}-${md}T12:00`); }

// Which plants can be sown this week, from frost dates.
export function sowNow(settings, date = new Date()) {
  const y = date.getFullYear();
  const last = mmdd(y, settings.lastFrost);
  const first = mmdd(y, settings.firstFrost);
  const wkFromLast = (date - last) / (7 * 86400000);
  const wkFromFirst = (date - first) / (7 * 86400000);
  const out = [];
  for (const p of PLANTS) {
    const s = p.sow.spring, f = p.sow.fall;
    if (s.length && wkFromLast >= s[0] && wkFromLast <= s[1]) out.push({ plant: p, season: 'spring' });
    else if (f.length && wkFromFirst >= f[0] && wkFromFirst <= f[1]) out.push({ plant: p, season: 'fall' });
  }
  return out;
}

// One list for the Today screen.
export function todayTasks(state, weather, temps) {
  const ctx = { weather, mulched: state.settings.mulched };
  const tasks = [];
  const thirsty = [], skipped = [], ready = [];
  for (const e of state.plants) {
    const w = waterStatus(e, ctx);
    if (w?.due) thirsty.push(e);
    if (w?.skipForRain) skipped.push(e);
    const h = harvestWindow(e, temps);
    if (h && h.state !== 'growing') ready.push({ e, h });
  }
  if (thirsty.length) tasks.push({ kind: 'water', uids: thirsty.map((e) => e.uid),
    text: `Water ${list(thirsty.map((e) => e.label))}.` });
  if (skipped.length) tasks.push({ kind: 'info',
    text: `Rain is coming, so you can skip watering ${list(skipped.map((e) => e.label))}.` });
  for (const { e, h } of ready) tasks.push({ kind: 'harvest', uids: [e.uid],
    text: sayProgress(e, h) });
  if (weather?.minNext3 <= 34) tasks.push({ kind: 'frost', text: `Frost may hit ${weather.minNext3} degrees. Cover tender plants tonight.` });
  if (weather?.maxNext3 >= 95) tasks.push({ kind: 'heat', text: 'Big heat ahead. Water early and think about shade cloth.' });
  for (const r of state.reminders) if (!r.done && r.due <= today()) tasks.push({ kind: 'reminder', rid: r.uid, text: r.text });
  return tasks;
}

export function list(items) {
  const u = [...new Set(items)];
  if (u.length <= 1) return u.join('');
  return `${u.slice(0, -1).join(', ')} and ${u[u.length - 1]}`;
}
