// Entry point. Imports every module and wires the cross-module callbacks
// here, so each UI module stays unaware of the others' internals.

import { repo } from './data/repo.js';
import { events, EV, session } from './state/session.js';
import { awardXP } from './state/xp.js';
import { $ } from './ui/dom.js';
import { initToast } from './ui/toast.js';
import { initCarePanel } from './ui/carePanel.js';
import { initPlantDialog } from './ui/plantDialog.js';
import { initZoneDialog } from './ui/zoneDialog.js';
import { initZone } from './ui/zone.js';
import { initOverview, showOverview as showOverviewScreen } from './ui/overview.js';
import { initReview } from './ui/review.js';

initToast();

const carePanel  = initCarePanel();
const plantDlg   = initPlantDialog();
const zoneDlg    = initZoneDialog({
  onAfterDelete: () => events.emit(EV.NAV_OVERVIEW),
});

const zoneScreen = initZone({
  onPlantTap:        (id) => plantDlg.open(id),
  onPlantDoubleTap:  (id) => carePanel.openById(id),
  onPlantLongPressDone: () => { /* drag has started — no-op */ },
  onAddPlantAtPct:   () => plantDlg.openNew(),
});

const review = initReview();

// Photo input drives both new-zone creation and additional uploads.
const photoInput = $('photoInput');
photoInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const isCreatingZone = photoInput.dataset.creatingZone === '1';
  delete photoInput.dataset.creatingZone;
  photoInput.value = '';
  if (!file) return;

  if (isCreatingZone) {
    const z = repo.zones.create({
      name: `Zone ${repo.zones.list().length + 1}`,
      type: 'bed',
    });
    awardXP(5, 'New zone created');
    events.emit(EV.ZONES_CHANGED);
    zoneScreen.show(z.id);
  }
  await review.handlePhoto(file);
});

const overview = initOverview({
  onZoneOpen: (zoneId) => zoneScreen.show(zoneId),
  onUploadForNewZone: () => {
    photoInput.dataset.creatingZone = '1';
    photoInput.click();
  },
  onDevCreateZone: async () => {
    const z = repo.zones.create({
      name: `Zone ${repo.zones.list().length + 1}`,
      type: 'patio',
    });
    awardXP(5, 'New zone created (dev test)');
    events.emit(EV.ZONES_CHANGED);
    zoneScreen.show(z.id);
    await review.handleDevPhoto();
  },
});

// Upload-photo button on a zone with no reference photo yet.
// Short tap → file picker; long-press → dev image fallback.
const uploadInitialBtn = $('uploadInitialBtn');
let uploadBtnHoldTimer = null;
let uploadBtnSuppressClick = false;
uploadInitialBtn.addEventListener('click', () => {
  if (uploadBtnSuppressClick) { uploadBtnSuppressClick = false; return; }
  photoInput.click();
});
uploadInitialBtn.addEventListener('pointerdown', () => {
  if (uploadBtnHoldTimer) clearTimeout(uploadBtnHoldTimer);
  uploadBtnHoldTimer = setTimeout(() => {
    uploadBtnHoldTimer = null;
    uploadBtnSuppressClick = true;
    if (navigator.vibrate) navigator.vibrate(30);
    events.emit(EV.TOAST, { msg: 'Dev: using test image…' });
    review.handleDevPhoto();
  }, 800);
});
['pointerup','pointerleave','pointercancel'].forEach(ev => {
  uploadInitialBtn.addEventListener(ev, () => {
    if (uploadBtnHoldTimer) { clearTimeout(uploadBtnHoldTimer); uploadBtnHoldTimer = null; }
  });
});

// Cross-module navigation
events.on(EV.NAV_OVERVIEW, () => {
  session.currentZoneId = null;
  showOverviewScreen();
  overview.renderZoneList();
  overview.renderLevel();
});

events.on(EV.NAV_ZONE, ({ zoneId }) => zoneScreen.show(zoneId));

// Zone edit dialog opens on zone menu tap.
events.on('zone:edit', ({ zoneId }) => zoneDlg.open(zoneId));

// Care panel close from gesture handler in zone.js.
events.on('care:close', () => carePanel.close());

// Initial render.
overview.renderZoneList();
overview.renderLevel();
