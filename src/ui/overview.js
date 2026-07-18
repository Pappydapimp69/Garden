import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { events, EV } from '../state/session.js';
import { awardXP } from '../state/xp.js';
import { xpForLevel } from '../state/xp.js';
import { generateInsight } from '../state/insights.js';

const INSIGHT_KEY = 'garden_last_insight';

export function initOverview({ onZoneOpen, onUploadForNewZone, onDevCreateZone }) {
  const zoneList   = $('zoneList');
  const addZoneBtn = $('addZoneBtn');
  const levelValue = $('levelValue');
  const xpFill     = $('xpFill');
  const zoneCountLabel = $('zoneCountLabel');
  const insightEl  = $('gardenInsight');

  function renderLevel() {
    const { xp, level } = repo.progress.get();
    levelValue.textContent = `Lv ${level}`;
    const need = xpForLevel(level);
    xpFill.style.width = Math.min(100, (xp / need) * 100) + '%';
  }

  function plantCount(z) { return repo.plants.listByZone(z.id).length; }
  function journalCount(z) { return repo.journal.listByZone(z.id).length; }

  // Longitudinal "we noticed…" card. The engine stays silent unless it finds a
  // specific, confidence-cleared pattern across a zone's history, and never
  // repeats the last insight (persisted key). Never throws — a bad read just
  // leaves the card hidden.
  function renderInsight() {
    try {
      const zoneName = new Map(repo.zones.list().map(z => [z.id, z.name]));
      const entries = [];
      for (const z of repo.zones.list()) {
        for (const j of repo.journal.listByZone(z.id)) {
          entries.push({ zone_id: z.id, zone_name: zoneName.get(z.id),
                         entry_date: j.entry_date, plant_count: j.plant_count });
        }
      }
      let lastKey = null;
      try { lastKey = localStorage.getItem(INSIGHT_KEY); } catch {}
      const ins = generateInsight(entries, { now: Date.now(), lastKey });
      if (!ins) { insightEl.style.display = 'none'; insightEl.innerHTML = ''; return; }
      insightEl.innerHTML =
        `<span class="gi-icon">💡</span>`
        + `<span class="gi-text">${esc(ins.text)}</span>`
        + `<button class="gi-dismiss" title="Dismiss" aria-label="Dismiss">✕</button>`;
      insightEl.style.display = '';
      insightEl.querySelector('.gi-dismiss').addEventListener('click', () => {
        // Dismiss = don't show THIS insight again; remember it as the last one.
        try { localStorage.setItem(INSIGHT_KEY, ins.key); } catch {}
        insightEl.style.display = 'none';
      });
    } catch { insightEl.style.display = 'none'; }
  }

  function renderZoneList() {
    const zones = repo.zones.list();
    zoneCountLabel.textContent = zones.length === 1 ? '1 zone' : `${zones.length} zones`;

    if (zones.length === 0) {
      zoneList.innerHTML = `<div class="zone-empty">
        <h2>Welcome to your garden journal</h2>
        <p>Tap the + button below to create your first zone — a garden bed, patio, single plant, or anything else you want to track.</p>
      </div>`;
      return;
    }

    zoneList.innerHTML = zones.map(z => `
      <div class="zone-card" data-id="${z.id}">
        <div class="zone-card-header">
          <div class="zone-card-name">${esc(z.name)}</div>
          <div class="zone-card-type">${z.type.replace('_',' ')}</div>
        </div>
        ${z.reference_image_path ? `<img class="zone-thumb" src="${z.reference_image_path}" alt="">` : ''}
        <div class="zone-card-stats">
          <span><strong>${plantCount(z)}</strong> plants</span>
          <span><strong>${journalCount(z)}</strong> entries</span>
        </div>
      </div>
    `).join('');

    zoneList.querySelectorAll('.zone-card').forEach(el => {
      el.addEventListener('click', () => onZoneOpen(el.dataset.id));
    });

    renderInsight();
  }

  // FAB is a <label for="photoInputNewZone">. The browser opens the file
  // picker via native HTML semantics on tap — we never call .click() on the
  // hidden input, which lets sandboxed iframes (Claude.ai preview) work too.
  // Long-press intercepts via preventDefault on the click so the picker
  // doesn't open before the dev-image flow runs.
  let addZoneHoldTimer = null;
  let addZoneIsLongPress = false;

  addZoneBtn.addEventListener('pointerdown', () => {
    addZoneIsLongPress = false;
    if (addZoneHoldTimer) clearTimeout(addZoneHoldTimer);
    addZoneHoldTimer = setTimeout(() => {
      addZoneHoldTimer = null;
      addZoneIsLongPress = true;
      if (navigator.vibrate) navigator.vibrate(30);
      events.emit(EV.TOAST, { msg: 'Dev: creating zone with test image…' });
      onDevCreateZone();
    }, 800);
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev => {
    addZoneBtn.addEventListener(ev, () => {
      if (addZoneHoldTimer) { clearTimeout(addZoneHoldTimer); addZoneHoldTimer = null; }
    });
  });
  addZoneBtn.addEventListener('click', (e) => {
    if (addZoneIsLongPress) {
      e.preventDefault();        // stop the native picker from opening
      addZoneIsLongPress = false;
      return;
    }
    onUploadForNewZone();        // tell main.js a new-zone upload is starting
  });

  // Listen for changes
  events.on(EV.ZONES_CHANGED,   renderZoneList);
  events.on(EV.PLANTS_CHANGED,  renderZoneList);  // affects plant counts
  events.on(EV.JOURNAL_CHANGED, renderZoneList);  // affects entry counts
  events.on(EV.PROGRESS_CHANGED, renderLevel);

  return { renderZoneList, renderLevel, awardXP };
}

export function showOverview() {
  $('zoneScreen').classList.remove('active');
  $('overviewScreen').classList.add('active');
}
