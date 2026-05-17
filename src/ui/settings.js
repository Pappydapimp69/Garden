// Settings screen — three tabs (API, Garden, Account).
//
// API tab     — vision quota meter + BYOK (bring your own key) input.
// Garden tab  — zip code + share-globally toggle (writes to user_profiles).
// Account tab — email, sign-out, delete account.
//
// Pattern mirrors the zone detail screen: a .screen with .tabs +
// .tab-content panes. show(tab) opens to the requested tab.

import { $, escapeHtml as esc } from './dom.js';
import { events, EV, session } from '../state/session.js';
import { dbSelect, dbUpdate, dbDelete } from '../auth/supabaseClient.js';
import { getSession, logout } from '../auth/authManager.js';
import { getQuotaSummary } from '../vision/quota.js';
import { hasApiKey, setApiKey, clearApiKey, getApiKeyHint, lockSession } from '../auth/apiKey.js';
import { promptApiPassword } from './apiPasswordPrompt.js';

const TABS = ['api', 'garden', 'account'];

export function initSettings() {
  const screen     = $('settingsScreen');
  const backBtn    = $('settingsBack');
  const tabBtns    = screen.querySelectorAll('.tab[data-stab]');
  const panes = {
    api:     $('settingsApi'),
    garden:  $('settingsGarden'),
    account: $('settingsAccount'),
  };

  let currentTab = 'api';

  // ── Tabs ─────────────────────────────────────────────────────────────
  function setTab(t) {
    if (!TABS.includes(t)) t = 'api';
    currentTab = t;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.stab === t));
    for (const k of TABS) {
      const p = panes[k];
      if (!p) continue;
      const active = (k === t);
      p.classList.toggle('active', active);
      p.style.display = active ? '' : 'none';
    }
    renderPane(t);
  }

  tabBtns.forEach(b => b.addEventListener('click', () => setTab(b.dataset.stab)));
  backBtn.addEventListener('click', close);

  // ── API pane ─────────────────────────────────────────────────────────
  async function renderApi() {
    const p = panes.api;
    p.innerHTML = `
      <div class="settings-section">
        <div class="settings-label">Vision usage</div>
        <div class="quota-row">
          <div class="quota-name">Today</div>
          <div class="quota-num" id="quotaTodayNum">— / —</div>
        </div>
        <div class="xp-bar quota-bar"><div class="xp-fill" id="quotaTodayBar" style="width:0%"></div></div>
        <div class="quota-row" style="margin-top:14px">
          <div class="quota-name">All time</div>
          <div class="quota-num" id="quotaTotalNum">— / —</div>
        </div>
        <div class="xp-bar quota-bar"><div class="xp-fill" id="quotaTotalBar" style="width:0%"></div></div>
        <div class="settings-hint" id="quotaResetHint">Resets daily at midnight UTC.</div>
      </div>

      <div class="settings-section">
        <div class="settings-label">Your Anthropic API key</div>
        <div class="settings-hint">
          Once your covered usage runs out you can bring your own key.
          We encrypt it on this device with a password you choose — it never
          touches our server unencrypted.
        </div>
        <div id="apiKeyArea"></div>
      </div>
    `;

    try {
      const q = await getQuotaSummary();
      $('quotaTodayNum').textContent = `${q.usedToday} / ${q.dailyLimit}`;
      $('quotaTotalNum').textContent = `${q.usedTotal} / ${q.lifetimeLimit}`;
      $('quotaTodayBar').style.width = Math.min(100, (q.usedToday / q.dailyLimit) * 100) + '%';
      $('quotaTotalBar').style.width = Math.min(100, (q.usedTotal / q.lifetimeLimit) * 100) + '%';
      const hrs = Math.max(1, Math.round((q.resetAt - Date.now()) / 3_600_000));
      $('quotaResetHint').textContent = `Daily quota resets in ~${hrs}h (midnight UTC).`;
    } catch (e) {
      $('quotaResetHint').textContent = 'Could not load usage: ' + (e.message || e);
    }

    renderApiKeyArea();
  }

  function renderApiKeyArea() {
    const area = $('apiKeyArea');
    if (!area) return;
    if (hasApiKey()) {
      const hint = getApiKeyHint();
      area.innerHTML = `
        <div class="key-status">
          <div class="key-status-text">
            <div class="settings-row-title">Key on file</div>
            <div class="settings-row-sub">${hint ? esc(hint) : 'Stored locally · encrypted'}</div>
          </div>
          <button class="btn btn-delete" id="removeKeyBtn" style="flex:0 0 auto; min-width:0; padding:8px 14px">Remove</button>
        </div>
      `;
      $('removeKeyBtn').addEventListener('click', async () => {
        if (!confirm('Remove the stored API key from this device?')) return;
        await clearApiKey();
        renderApiKeyArea();
        events.emit(EV.TOAST, { msg: 'API key removed.' });
      });
    } else {
      area.innerHTML = `
        <label>API key</label>
        <input type="password" id="newApiKey" placeholder="sk-ant-...">
        <label>Password (to encrypt it on this device)</label>
        <input type="password" id="newApiKeyPw" placeholder="Choose any password">
        <div class="settings-hint" style="margin-top:6px">You'll be asked for this password the next time you use the app on this device.</div>
        <div class="dialog-buttons" style="margin-top:14px">
          <button class="btn btn-confirm" id="saveApiKeyBtn">Save Key</button>
        </div>
        <div class="auth-error" id="apiKeyErr" style="display:none; margin-top:10px"></div>
      `;
      $('saveApiKeyBtn').addEventListener('click', async () => {
        const k = $('newApiKey').value.trim();
        const pw = $('newApiKeyPw').value;
        const err = $('apiKeyErr');
        err.style.display = 'none';
        if (!k || !pw) { err.textContent = 'Both fields required.'; err.style.display = ''; return; }
        if (!k.startsWith('sk-')) { err.textContent = "That doesn't look like an Anthropic key (should start with sk-)."; err.style.display = ''; return; }
        try {
          await setApiKey(k, pw);
          renderApiKeyArea();
          events.emit(EV.TOAST, { msg: 'API key saved on this device.' });
        } catch (e) {
          err.textContent = e.message || String(e);
          err.style.display = '';
        }
      });
    }
  }

  // ── Garden pane ──────────────────────────────────────────────────────
  async function renderGarden() {
    const p = panes.garden;
    p.innerHTML = `
      <div class="settings-section">
        <div class="settings-label">Garden preferences</div>
        <label>Zip code</label>
        <input type="text" id="prefZip" placeholder="e.g. 78704" maxlength="10" inputmode="numeric" autocomplete="postal-code">
        <div class="settings-hint">Used for climate-zone hints in plant ID prompts.</div>

        <label style="margin-top:18px">Share anonymized data</label>
        <label class="toggle">
          <input type="checkbox" id="prefShare">
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          <span class="toggle-label">Help improve plant ID by sharing anonymized counts (no photos, no names).</span>
        </label>

        <div class="dialog-buttons" style="margin-top:18px">
          <button class="btn btn-confirm" id="savePrefsBtn">Save</button>
        </div>
        <div class="auth-error" id="prefsErr" style="display:none; margin-top:10px"></div>
      </div>
    `;

    const s = getSession();
    if (!s) return;
    try {
      const rows = await dbSelect('user_profiles', { filters: { id: 'eq.' + s.user_id } });
      const profile = rows[0] || {};
      $('prefZip').value = profile.zip_code || '';
      $('prefShare').checked = profile.share_data_globally !== false;
    } catch (e) {
      const err = $('prefsErr');
      err.textContent = 'Could not load preferences: ' + (e.message || e);
      err.style.display = '';
    }

    $('savePrefsBtn').addEventListener('click', async () => {
      const err = $('prefsErr');
      err.style.display = 'none';
      const zip = $('prefZip').value.trim();
      const share = $('prefShare').checked;
      try {
        await dbUpdate('user_profiles', { id: 'eq.' + s.user_id }, {
          zip_code: zip || null,
          zip_source: zip ? 'manual' : 'none',
          share_data_globally: share,
        });
        events.emit(EV.TOAST, { msg: 'Preferences saved.' });
      } catch (e) {
        err.textContent = 'Save failed: ' + (e.message || e);
        err.style.display = '';
      }
    });
  }

  // ── Account pane ─────────────────────────────────────────────────────
  function renderAccount() {
    const p = panes.account;
    const email = session.currentUser?.email || '—';
    p.innerHTML = `
      <div class="settings-section">
        <div class="settings-label">Account</div>
        <div class="settings-row">
          <div class="settings-row-title">Email</div>
          <div class="settings-row-sub">${esc(email)}</div>
        </div>
        <div class="dialog-buttons" style="margin-top:18px">
          <button class="btn btn-cancel" id="signOutBtn">Sign out</button>
        </div>
      </div>

      <div class="settings-section danger-zone">
        <div class="settings-label danger">Danger zone</div>
        <div class="settings-hint">
          Permanently delete all your gardens, zones, plants, and journal entries.
          You'll be signed out. Your auth account stays — sign up again with the
          same email to start over.
        </div>
        <div class="dialog-buttons" style="margin-top:14px">
          <button class="btn btn-delete" id="deleteAcctBtn">Delete my data</button>
        </div>
        <div class="auth-error" id="deleteErr" style="display:none; margin-top:10px"></div>
      </div>
    `;

    $('signOutBtn').addEventListener('click', async () => {
      lockSession();
      await logout();
      window.location.reload();
    });

    $('deleteAcctBtn').addEventListener('click', async () => {
      const ok1 = confirm('This will delete all your gardens, zones, plants, and journal entries. Continue?');
      if (!ok1) return;
      const ok2 = prompt('Type DELETE to confirm.');
      if (ok2 !== 'DELETE') return;
      const s = getSession();
      if (!s) return;
      const err = $('deleteErr');
      err.style.display = 'none';
      try {
        // user_profiles and gardens both FK to auth.users, not to each other,
        // so we have to delete gardens (cascades to zones → plants/journal)
        // and the per-user log tables explicitly.
        await dbDelete('gardens',          { user_id: 'eq.' + s.user_id });
        await dbDelete('user_action_log',  { user_id: 'eq.' + s.user_id });
        await dbDelete('vision_api_calls', { user_id: 'eq.' + s.user_id });
        await dbDelete('user_profiles',    { id:      'eq.' + s.user_id });
        await clearApiKey();
        lockSession();
        await logout();
        window.location.reload();
      } catch (e) {
        err.textContent = 'Delete failed: ' + (e.message || e);
        err.style.display = '';
      }
    });
  }

  function renderPane(t) {
    if (t === 'api')     renderApi();
    if (t === 'garden')  renderGarden();
    if (t === 'account') renderAccount();
  }

  // ── Show / close ─────────────────────────────────────────────────────
  function show(tab) {
    setTab(tab || 'api');
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }
  function close() {
    screen.classList.remove('active');
    events.emit(EV.NAV_OVERVIEW);
  }

  // Re-render API tab if a vision call happened while Settings was open.
  events.on(EV.VISION_CALLED, () => {
    if (currentTab === 'api' && screen.classList.contains('active')) renderApi();
  });

  return { show, close };
}
