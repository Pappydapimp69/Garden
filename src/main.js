// Entry point. Wires all modules together behind an auth gate.
// Auth check happens first; the app does not init until a session exists.

import { repo, activateSupabase } from './data/repo.js';
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
import { initAuth, logout } from './auth/authManager.js';
import { initAuthUI } from './auth/authUI.js';
import { logAction } from './data/actionsLog.js';
import { initProfileMenu } from './ui/profileMenu.js';
import { initSettings } from './ui/settings.js';
import { lockSession } from './auth/apiKey.js';
import { ARTIFACT_MODE } from './config.js';

// Toast must be active before anything can emit EV.TOAST (including auth errors).
initToast();

(async () => {
  let authUI;

  async function startApp(authSession, { guest = false } = {}) {
    session.currentUser = { user_id: authSession.user_id, email: authSession.email };

    // Guest/demo mode (artifact builds) runs entirely on the local store — no
    // Supabase seed, no network — so the app is usable without a login. The
    // Supabase backend is only activated for a real authenticated session.
    if (!guest) {
      // Seed in-memory store from Supabase and swap the backend.
      try {
        await activateSupabase(authSession);
      } catch (e) {
        events.emit(EV.TOAST, { msg: 'Failed to load your data: ' + (e.message || e), kind: 'error' });
        console.error('activateSupabase failed:', e);
      }
    }

    // ── UI init ────────────────────────────────────────────────────────────
    const carePanel  = initCarePanel();
    const plantDlg   = initPlantDialog();
    const zoneDlg    = initZoneDialog({
      onAfterDelete: () => events.emit(EV.NAV_OVERVIEW),
    });

    const zoneScreen = initZone({
      onPlantTap:           (id) => plantDlg.open(id),
      onPlantDoubleTap:     (id) => carePanel.openById(id),
      onPlantLongPressDone: () => {},
      onAddPlantAtPct:      () => plantDlg.openNew(),
    });

    const review = initReview();

    // Two file inputs, one per flow. Labels open the native picker.
    const photoInput        = $('photoInput');
    const photoInputNewZone = $('photoInputNewZone');

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
        const z = repo.zones.create({ name: `Zone ${repo.zones.list().length + 1}`, type: 'bed' });
        awardXP(5, 'New zone created');
        logAction('zone_created', { zone_type: 'bed', zone_id: z.id });
        events.emit(EV.ZONES_CHANGED);
        zoneScreen.show(z.id);
        await review.handlePhoto(file);
      } catch (err) {
        events.emit(EV.TOAST, { msg: 'Upload failed: ' + (err.message || err), kind: 'error' });
        console.error('photoInputNewZone change error:', err);
      }
    });

    const overview = initOverview({
      onZoneOpen:          (zoneId) => zoneScreen.show(zoneId),
      onUploadForNewZone:  () => {},
      onDevCreateZone: async () => {
        const z = repo.zones.create({ name: `Zone ${repo.zones.list().length + 1}`, type: 'patio' });
        awardXP(5, 'New zone created (dev test)');
        logAction('zone_created', { zone_type: 'patio', zone_id: z.id });
        events.emit(EV.ZONES_CHANGED);
        zoneScreen.show(z.id);
        await review.handleDevPhoto();
      },
    });

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
      if (uploadBtnIsLongPress) { e.preventDefault(); uploadBtnIsLongPress = false; }
    });

    // Settings screen + profile dropdown.
    const settings = initSettings();
    const profileMenu = initProfileMenu({
      onSettings: () => events.emit(EV.NAV_SETTINGS, { tab: 'api' }),
      onSignout:  async () => { lockSession(); await logout(); window.location.reload(); },
    });

    const accountBtn = $('accountBtn');
    if (accountBtn) {
      accountBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.toggle(accountBtn);
      });
    }

    // Cross-module navigation
    events.on(EV.NAV_OVERVIEW, () => {
      session.currentZoneId = null;
      showOverviewScreen();
      overview.renderZoneList();
      overview.renderLevel();
    });
    events.on(EV.NAV_ZONE, ({ zoneId }) => zoneScreen.show(zoneId));
    events.on(EV.NAV_SETTINGS, ({ tab } = {}) => settings.show(tab));
    events.on('zone:edit', ({ zoneId }) => zoneDlg.open(zoneId));
    events.on('care:close', () => carePanel.close());

    // Initial render
    overview.renderZoneList();
    overview.renderLevel();
  }

  // ── Auth init ────────────────────────────────────────────────────────────
  authUI = initAuthUI({ onLogin: (s) => startApp(s) });

  // Artifact/demo builds skip the auth gate entirely and boot straight into a
  // local guest session — the whole point of an artifact build is to be tried
  // without a backend. Production (Pages) builds keep ARTIFACT_MODE=false and
  // require a real login below.
  if (ARTIFACT_MODE) {
    await startApp({ user_id: 'local-guest', email: 'guest@local' }, { guest: true });
  } else {
    const existingSession = await initAuth();
    if (existingSession) {
      await startApp(existingSession);
    } else {
      authUI.show();
    }
  }
})();
