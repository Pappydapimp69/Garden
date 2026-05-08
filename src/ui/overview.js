import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { events, EV } from '../state/session.js';
import { awardXP } from '../state/xp.js';
import { xpForLevel } from '../state/xp.js';

export function initOverview({ onZoneOpen, onUploadForNewZone, onDevCreateZone }) {
  const zoneList   = $('zoneList');
  const addZoneBtn = $('addZoneBtn');
  const levelValue = $('levelValue');
  const xpFill     = $('xpFill');
  const zoneCountLabel = $('zoneCountLabel');

  function renderLevel() {
    const { xp, level } = repo.progress.get();
    levelValue.textContent = `Lv ${level}`;
    const need = xpForLevel(level);
    xpFill.style.width = Math.min(100, (xp / need) * 100) + '%';
  }

  function plantCount(z) { return repo.plants.listByZone(z.id).length; }
  function journalCount(z) { return repo.journal.listByZone(z.id).length; }

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
  }

  // FAB: short tap → file picker for new zone; long-press → dev test image.
  let addZoneHoldTimer = null;
  let addZoneSuppressClick = false;

  function triggerNewZoneUpload(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (addZoneSuppressClick) { addZoneSuppressClick = false; return; }
    onUploadForNewZone();
  }

  addZoneBtn.addEventListener('click', triggerNewZoneUpload);
  addZoneBtn.addEventListener('touchend', triggerNewZoneUpload, { passive: false });

  addZoneBtn.addEventListener('pointerdown', () => {
    if (addZoneHoldTimer) clearTimeout(addZoneHoldTimer);
    addZoneHoldTimer = setTimeout(() => {
      addZoneHoldTimer = null;
      addZoneSuppressClick = true;
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
