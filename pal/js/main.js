import { load, save, reset, addPlant, log, today } from './store.js';
import { PLANTS, findPlant, GRADES } from './plants.js';
import { reply } from './pal.js';
import { createVoice, createEars } from './speech.js';
import { getWeather, summarize } from './weather.js';
import { todayTasks, sowNow, waterStatus, harvestWindow } from './schedule.js';
import { rainBarrel, rainGarden, mulch, drip, compost } from './calc.js';
import { makeCloud } from './cloud.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const state = load();
const memo = {};
let weather = null;

// ── Voice ─────────────────────────────────────────────────────────────
const face = $('palFace');
const voice = createVoice({
  onStart: () => face.classList.add('talking'),
  onEnd: () => face.classList.remove('talking'),
});
voice.configure({ rate: state.settings.rate, voiceName: state.settings.voiceName });
const ears = createEars({
  onText: (t) => { $('askInput').value = t; ask(t); },
  onState: (on) => { $('micBtn').classList.toggle('live', on); face.classList.toggle('listening', on); },
});
if (!ears.supported) $('micBtn').hidden = true;

function paintMute() { $('muteBtn').textContent = state.settings.voice ? '🔊' : '🔇'; }
$('muteBtn').onclick = () => { state.settings.voice = !state.settings.voice; if (!state.settings.voice) voice.stop(); save(); paintMute(); };

// ── Chat ──────────────────────────────────────────────────────────────
function bubble(role, text, card) {
  const b = el('div', `msg ${role}`);
  b.append(el('div', 'text', text));
  if (card) {
    const c = el('div', 'card');
    c.append(el('div', 'card-title', card.title));
    for (const [k, v] of card.rows) { const r = el('div', 'card-row'); r.append(el('span', 'k', k), el('span', 'v', String(v))); c.append(r); }
    if (card.tip) c.append(el('div', 'card-tip', card.tip));
    b.append(c);
  }
  $('chat').append(b);
  $('chat').scrollTop = $('chat').scrollHeight;
}

async function ask(text) {
  text = text.trim();
  if (!text) return;
  bubble('me', text);
  state.chat.push({ role: 'me', text, at: Date.now() });
  $('askInput').value = '';
  const out = await reply(text, { state, weather, memo, cloud: makeCloud(state.settings) });
  bubble('bot', out.text, out.card);
  state.chat.push({ role: 'pal', text: out.text, at: Date.now() });
  if (state.chat.length > 200) state.chat.splice(0, state.chat.length - 200);
  if (state.settings.voice) voice.speak(out.text);
  save();
  if (out.changed) renderAll();
}

$('askForm').onsubmit = (e) => { e.preventDefault(); ask($('askInput').value); };
$('micBtn').onclick = () => { voice.stop(); ears.start(); };

const CHIPS = ['What should I do today?', 'Should I water?', 'What can I plant now?', 'My leaves are turning yellow', 'Rain barrel for 1000 square feet'];
for (const c of CHIPS) { const b = el('button', 'chip', c); b.onclick = () => ask(c); $('chips').append(b); }

// ── Tabs ──────────────────────────────────────────────────────────────
$('tabs').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${b.dataset.v}`));
  try { localStorage.setItem('gardenPal.tab', b.dataset.v); } catch {}
};

// ── Today ─────────────────────────────────────────────────────────────
function renderToday() {
  $('weatherBox').textContent = summarize(weather) || 'No weather yet. Add your location in settings.';
  const ul = $('taskList'); ul.replaceChildren();
  const tasks = todayTasks(state, weather);
  if (!tasks.length) ul.append(el('li', 'empty', state.plants.length ? 'Nothing needs you today.' : 'Add plants to get a daily list.'));
  for (const t of tasks) {
    const li = el('li', `task ${t.kind}`);
    const cb = el('input'); cb.type = 'checkbox';
    cb.onchange = () => {
      if (t.kind === 'water') { state.plants.filter((p) => t.uids.includes(p.uid)).forEach((p) => { p.lastWatered = today(); }); log(state, t.text.replace(/^Water/, 'Watered')); }
      else if (t.kind === 'reminder') { const r = state.reminders.find((r) => r.uid === t.rid); if (r) r.done = true; log(state, `Done: ${t.text}`); }
      else if (t.kind === 'harvest') log(state, `Harvested ${state.plants.find((p) => p.uid === t.uids[0])?.label}.`);
      save(); renderAll();
    };
    li.append(cb, el('span', null, t.text)); ul.append(li);
  }
  const sow = $('sowList'); sow.replaceChildren();
  const now = sowNow(state.settings);
  if (!now.length) sow.append(el('span', 'empty', 'Not much to sow right now.'));
  for (const s of now) sow.append(el('span', 'tag', s.plant.name));
}

// ── Garden ────────────────────────────────────────────────────────────
for (const p of PLANTS) { const o = el('option'); o.value = p.name; $('plantNames').append(o); }
$('addDate').value = today();
$('addForm').onsubmit = (e) => {
  e.preventDefault();
  const p = findPlant($('addPlant').value);
  if (!p) { $('addPlant').setCustomValidity('Pick a plant from the list'); $('addPlant').reportValidity(); return; }
  addPlant(state, p, { bed: $('addBed').value.trim() || 'main bed', planted: $('addDate').value || today() });
  $('addPlant').value = ''; save(); renderAll();
};
$('addPlant').oninput = () => $('addPlant').setCustomValidity('');

function renderGarden() {
  const box = $('bedList'); box.replaceChildren();
  const beds = {};
  for (const p of state.plants) (beds[p.bed] ||= []).push(p);
  if (!state.plants.length) box.append(el('p', 'empty', 'No plants yet. Add one above, or just tell me in Talk.'));
  const ctx = { weather, mulched: state.settings.mulched };
  for (const [bed, list] of Object.entries(beds)) {
    const card = el('div', 'bed'); card.append(el('h4', null, bed));
    for (const p of list) {
      const row = el('div', 'plant');
      const w = waterStatus(p, ctx), h = harvestWindow(p);
      const info = [`planted ${p.planted}`];
      if (w) info.push(w.due ? 'needs water' : `water in ${Math.max(0, w.every - w.since)} days`);
      if (h) info.push(h.state === 'growing' ? `harvest in ${h.inDays} days` : h.state === 'ready' ? 'ready to pick' : 'past harvest');
      row.append(el('span', 'pname', p.label), el('span', 'pinfo', info.join(' · ')));
      const water = el('button', 'mini', '💧'); water.title = 'Watered';
      water.onclick = () => { p.lastWatered = today(); log(state, `Watered ${p.label}.`, p.uid); save(); renderAll(); };
      const del = el('button', 'mini', '✕'); del.title = 'Remove';
      del.onclick = () => { state.plants = state.plants.filter((x) => x !== p); log(state, `Removed ${p.label}.`); save(); renderAll(); };
      row.append(water, del); card.append(row);
    }
    box.append(card);
  }
  const j = $('journal'); j.replaceChildren();
  for (const e of state.journal.slice(0, 40)) j.append(el('li', null, `${e.at.slice(0, 10)}  ${e.text}`));
}

// ── Tools ─────────────────────────────────────────────────────────────
const TOOLS = [
  { title: 'Rain barrel', fields: [['roofSqft', 'Roof footprint, square feet', 1000], ['rainInches', 'Rain, inches', 1], ['storms', 'Number of storms', 1]], run: rainBarrel },
  { title: 'Rain garden', fields: [['roofSqft', 'Area draining in, square feet', 1000]], select: ['soil', ['loam', 'clay', 'sand']], run: rainGarden },
  { title: 'Mulch', fields: [['sqft', 'Bed area, square feet', 100], ['depthIn', 'Depth, inches', 3]], select: ['material', ['wood chips', 'leaves']], run: mulch },
  { title: 'Drip line', fields: [['lengthFt', 'Line length, feet', 100], ['spacingIn', 'Emitter spacing, inches', 12], ['supplyGpm', 'Supply, gallons a minute', 4]], run: drip },
  { title: 'Compost mix', fields: [['greens', 'Buckets of greens', 2], ['browns', 'Buckets of browns', 3]], run: compost },
];
for (const t of TOOLS) {
  const f = el('form', 'tool'); f.append(el('h4', null, t.title));
  for (const [k, label, v] of t.fields) { const l = el('label', null, label); const i = el('input'); i.type = 'number'; i.step = 'any'; i.name = k; i.value = v; l.append(i); f.append(l); }
  if (t.select) { const l = el('label', null, t.select[0]); const s = el('select'); s.name = t.select[0]; for (const o of t.select[1]) s.append(new Option(o, o)); l.append(s); f.append(l); }
  const out = el('div', 'out'); const btn = el('button', null, 'Figure it out');
  f.append(btn, out);
  f.onsubmit = (e) => {
    e.preventDefault();
    const args = {}; for (const [k, v] of new FormData(f)) args[k] = isNaN(+v) ? v : +v;
    const r = t.run(args);
    out.replaceChildren(el('p', null, r.say), ...(r.caveat ? [el('p', 'caveat', r.caveat)] : []));
    if (state.settings.voice) voice.speak(r.say);
  };
  $('tools').append(f);
}

// ── Library ───────────────────────────────────────────────────────────
function renderLib(q = '') {
  const box = $('lib'); box.replaceChildren();
  for (const p of PLANTS.filter((p) => !q || p.name.includes(q) || p.aliases.some((a) => a.includes(q)))) {
    const d = el('details', 'plantcard');
    d.append(el('summary', null, `${p.name} · ${p.kind}`));
    const rows = [['Sun', p.sun], ['Water', p.waterHow], ['Spacing', `${p.spacing} inches`], ['Days to harvest', `${p.days[0]} to ${p.days[1]}`], ['Watch for', p.pests.join(', ')]];
    for (const c of p.companions) rows.push([`With ${c.with}`, `${GRADES[c.grade]}. ${c.why}`]);
    for (const a of p.avoid) rows.push([`Not near ${a.with}`, a.why]);
    for (const [k, v] of rows) { const r = el('div', 'card-row'); r.append(el('span', 'k', k), el('span', 'v', v)); d.append(r); }
    d.append(el('div', 'card-tip', p.tip));
    const say = el('button', 'mini', '🔊 Hear it');
    say.onclick = () => voice.speak(`${p.name}. ${p.sun}. Water ${p.waterHow}. ${p.tip}`);
    d.append(say);
    box.append(d);
  }
}
$('libSearch').oninput = (e) => renderLib(e.target.value.toLowerCase().trim());

// ── Settings ──────────────────────────────────────────────────────────
const S = state.settings;
const bind = (id, key, parse = (v) => v) => {
  const i = $(id);
  if (i.type === 'checkbox') i.checked = !!S[key]; else i.value = S[key] ?? '';
  i.onchange = () => { S[key] = i.type === 'checkbox' ? i.checked : parse(i.value); save(); applySettings(); renderAll(); };
};
bind('setName', 'name'); bind('setPal', 'palName'); bind('setLast', 'lastFrost'); bind('setFirst', 'firstFrost');
bind('setMulch', 'mulched'); bind('setRate', 'rate', Number); bind('setCloud', 'cloudUrl'); bind('setToken', 'cloudToken');
function fillVoices() {
  const sel = $('setVoice'); sel.replaceChildren(new Option('Default', ''));
  for (const v of voice.voices().filter((v) => /^en/i.test(v.lang))) sel.append(new Option(v.name, v.name));
  sel.value = S.voiceName || '';
}
fillVoices();
if (globalThis.speechSynthesis) speechSynthesis.onvoiceschanged = fillVoices;
$('setVoice').onchange = () => { S.voiceName = $('setVoice').value; save(); applySettings(); voice.speak('This is how I sound.'); };
$('locBtn').onclick = () => {
  navigator.geolocation?.getCurrentPosition(async (pos) => {
    S.lat = +pos.coords.latitude.toFixed(2); S.lon = +pos.coords.longitude.toFixed(2); save();
    await refreshWeather();
  }, () => alert('Could not get your location.'));
};
$('resetBtn').onclick = () => { if (confirm('Clear all plants, journal, and settings?')) { reset(); location.reload(); } };

function applySettings() {
  $('palName').textContent = S.palName || 'Pip';
  voice.configure({ rate: S.rate, voiceName: S.voiceName });
  paintMute();
}

async function refreshWeather() {
  weather = await getWeather(S.lat, S.lon);
  renderAll();
}

function renderAll() { renderToday(); renderGarden(); }

// ── Boot ──────────────────────────────────────────────────────────────
applySettings();
renderLib();
renderAll();
try { const tab = localStorage.getItem('gardenPal.tab'); if (tab) document.querySelector(`#tabs [data-v="${tab}"]`)?.click(); } catch {}
for (const m of state.chat.slice(-12)) bubble(m.role === 'pal' ? 'bot' : 'me', m.text);
if (!state.chat.length) {
  const hi = `Hi, I am ${S.palName || 'Pip'}. I help you keep your garden happy. Tell me what you are growing, or ask me anything.`;
  bubble('bot', hi);
}
refreshWeather();
