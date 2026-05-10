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

// Two file inputs, one per flow. Each is wired to a <label for="..."> in
// the markup so the picker opens via native HTML semantics — no
// programmatic .click(), which sandboxed iframes block.
const photoInput        = $('photoInput');         // additional uploads on the current zone
const photoInputNewZone = $('photoInputNewZone');  // FAB → new zone, then upload

photoInput.addEventListener('change', async (e) => {
  try {
    const file = e.target.files[0];
    photoInput.value = '';
    if (!file) return;
    events.emit(EV.TOAST, { msg: `Picked: ${file.name}` });
    await review.handlePhoto(file);
  } catch (err) {
    events.emit(EV.TOAST, { msg: 'Upload failed: ' + (err.message || err), kind: 'error' });
    console.error('photoInput change error:', err);
  }
});

photoInputNewZone.addEventListener('change', async (e) => {
  try {
    const file = e.target.files[0];
    photoInputNewZone.value = '';
    if (!file) return;
    events.emit(EV.TOAST, { msg: `Picked: ${file.name}` });

    const z = repo.zones.create({
      name: `Zone ${repo.zones.list().length + 1}`,
      type: 'bed',
    });
    awardXP(5, 'New zone created');
    events.emit(EV.ZONES_CHANGED);
    zoneScreen.show(z.id);
    await review.handlePhoto(file);
  } catch (err) {
    events.emit(EV.TOAST, { msg: 'Upload failed: ' + (err.message || err), kind: 'error' });
    console.error('photoInputNewZone change error:', err);
  }
});

const overview = initOverview({
  onZoneOpen: (zoneId) => zoneScreen.show(zoneId),
  onUploadForNewZone: () => { /* label opens picker natively — nothing to do here */ },
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
// Same pattern: it's a <label for="photoInput">, and long-press calls
// preventDefault on the click to suppress the native picker so the dev
// image flow can take over.
const uploadInitialBtn = $('uploadInitialBtn');
let uploadBtnHoldTimer = null;
let uploadBtnIsLongPress = false;
uploadInitialBtn.addEventListener('pointerdown', () => {
  uploadBtnIsLongPress = false;
  if (uploadBtnHoldTimer) clearTimeout(uploadBtnHoldTimer);
  uploadBtnHoldTimer = setTimeout(() => {
    uploadBtnHoldTimer = null;
    uploadBtnIsLongPress = true;
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
uploadInitialBtn.addEventListener('click', (e) => {
  if (uploadBtnIsLongPress) {
    e.preventDefault();          // stop the native picker from opening
    uploadBtnIsLongPress = false;
  }
  // Otherwise: let the label do its thing → native picker opens.
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
