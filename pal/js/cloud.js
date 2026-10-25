// Cloud brain: Claude behind the pal-chat edge function.
//
// The cloud answers every message once you are signed in. It gets the
// garden as computed facts (growth progress, watering, weather, memory) and
// the offline engine's own answer as a hint, so the deterministic Brain math
// stays the source of numbers. It may return actions (add a plant, log,
// remind, remember); the client checks every action before applying it.
// Offline rules take over whenever the cloud is unavailable.

import { findPlant } from './plants.js';
import { addPlant, log, today, uid } from './store.js';
import { progress, sayProgress } from './growth.js';
import { waterStatus } from './schedule.js';
import { summarize } from './weather.js';

// The Supabase project the Garden Journal app already uses.
export const SUPABASE_URL = 'https://czoaeombqqhgyqbsetlj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_LDKc3zPhBInG-DpInW0gLw_3GNt7MMP';
export const PAL_CHAT_URL = `${SUPABASE_URL}/functions/v1/pal-chat`;

// ── Auth (GoTrue REST, same as the Journal app) ───────────────────────
async function auth(path, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || `Sign in failed (${r.status})`);
  return j;
}

export async function signIn(settings, email, password) {
  const j = await auth('token?grant_type=password', { email, password });
  setSession(settings, j);
}

export async function signUp(email, password) { await auth('signup', { email, password }); }

function setSession(settings, j) {
  settings.cloudToken = j.access_token;
  settings.cloudRefresh = j.refresh_token;
  settings.cloudExpires = Date.now() + (j.expires_in || 3600) * 1000;
  settings.cloudEmail = j.user?.email || settings.cloudEmail;
}

export function signOut(settings) {
  settings.cloudToken = settings.cloudRefresh = '';
  settings.cloudExpires = 0;
}

async function token(settings) {
  if (!settings.cloudToken) return null;
  if (Date.now() < settings.cloudExpires - 60e3) return settings.cloudToken;
  if (!settings.cloudRefresh) return null;
  try { setSession(settings, await auth('token?grant_type=refresh_token', { refresh_token: settings.cloudRefresh })); }
  catch { signOut(settings); return null; }
  return settings.cloudToken;
}

// ── Context ───────────────────────────────────────────────────────────
// Facts, not raw records: one line per plant group with its real status.
export function gardenFacts(state, weather, temps) {
  const ctx = { weather, mulched: state.settings.mulched };
  const groups = new Map();
  for (const e of state.plants) {
    const k = `${e.id}|${e.bed}|${e.planted}|${e.start}`;
    if (!groups.has(k)) groups.set(k, { e, n: 0 });
    groups.get(k).n++;
  }
  const lines = [];
  for (const { e, n } of groups.values()) {
    const pr = progress(e, temps);
    const w = waterStatus(e, ctx);
    lines.push([
      `${n > 1 ? n + ' ' : ''}${e.label} in ${e.bed}`,
      `planted ${e.planted} from ${e.start || 'unknown start'}`,
      e.days ? `packet says ${e.days} days` : '',
      pr ? `${pr.stage}, ${pr.percent} percent by heat${pr.state === 'growing' && pr.inDays ? `, check in about ${pr.inDays} days` : ''}${pr.calendarOnly ? ' (calendar estimate)' : ''}` : '',
      w ? (w.due ? 'needs water' : w.skipForRain ? 'skip watering, rain coming' : `watered ${w.since} days ago`) : '',
    ].filter(Boolean).join(', '));
  }
  return lines.slice(0, 40);
}

// ── Actions the cloud may ask for ─────────────────────────────────────
const MAX_MEMORY = 30;

export function applyActions(state, actions) {
  const done = [];
  for (const a of (Array.isArray(actions) ? actions : []).slice(0, 10)) {
    const plant = a.plant ? findPlant(a.plant) : null;
    const text = String(a.text || '').slice(0, 160).trim();
    switch (a.type) {
      case 'add_plant': {
        if (!plant) break;
        const n = Math.min(Math.max(1, a.count | 0), 50);
        const start = a.start === 'seed' || a.start === 'transplant' ? a.start : null;
        const planted = /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date <= today() ? a.date : today();
        for (let i = 0; i < n; i++) addPlant(state, plant, { bed: String(a.bed || 'main bed').slice(0, 40), start, planted });
        done.push(a.type); break;
      }
      case 'set_start': case 'set_days': {
        const mine = state.plants.filter((e) => plant && e.id === plant.id);
        if (!mine.length) break;
        if (a.type === 'set_start' && (a.start === 'seed' || a.start === 'transplant')) mine.forEach((e) => { e.start = a.start; });
        if (a.type === 'set_days' && a.count > 0 && a.count <= 365) mine.forEach((e) => { e.days = a.count | 0; });
        done.push(a.type); break;
      }
      case 'log_water': case 'log_feed': {
        const mine = plant ? state.plants.filter((e) => e.id === plant.id) : state.plants;
        mine.forEach((e) => { if (a.type === 'log_water') e.lastWatered = today(); else e.lastFed = today(); });
        log(state, a.type === 'log_water' ? `Watered ${plant ? plant.name : 'everything'}.` : `Fed ${plant ? plant.name : 'the garden'}.`);
        done.push(a.type); break;
      }
      case 'log_note':
        if (text) { log(state, text); done.push(a.type); } break;
      case 'remind': {
        if (!text) break;
        const days = Math.min(Math.max(0, a.count | 0), 365);
        state.reminders.push({ uid: uid(), text, due: today(new Date(Date.now() + days * 86400000)), done: false });
        done.push(a.type); break;
      }
      case 'remember':
        if (text && !state.memory.includes(text)) {
          state.memory.push(text);
          if (state.memory.length > MAX_MEMORY) state.memory.shift();
          done.push(a.type);
        }
        break;
      case 'forget':
        state.memory = state.memory.filter((m) => !text || !m.toLowerCase().includes(text.toLowerCase()));
        done.push(a.type); break;
    }
  }
  return done;
}

// ── The call ──────────────────────────────────────────────────────────
export function makeCloud(settings) {
  if (!settings.cloudToken) return null;
  return async (text, { state, weather, temps, hint }) => {
    const tok = await token(settings);
    if (!tok) return null;
    const r = await fetch(settings.cloudUrl || PAL_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({
        text,
        palName: settings.palName,
        userName: settings.name,
        today: today(),
        frost: `last spring frost ${settings.lastFrost}, first fall frost ${settings.firstFrost}`,
        weather: summarize(weather) || '',
        garden: gardenFacts(state, weather, temps),
        journal: state.journal.slice(0, 10).map((j) => `${j.at.slice(0, 10)} ${j.text}`),
        memory: state.memory,
        hint: hint || '',
        history: state.chat.slice(-12).map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', text: m.text })),
      }),
    });
    if (r.status === 401) { signOut(settings); return null; }
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.say) return null;
    return { text: j.say, actions: j.actions || [] };
  };
}
