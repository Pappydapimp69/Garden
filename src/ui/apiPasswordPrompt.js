// Modal prompt for the API-key unlock password. Promise-based so callers can
// `await promptApiPassword()` and get back the typed password (or null on cancel).
//
// The dialog markup lives inline in index.html (#apiPasswordDialog) so the
// existing .dialog-overlay CSS handles styling and the overlay click-to-close.

import { $ } from './dom.js';

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  _initialized = true;
}

export function promptApiPassword({ title = 'Unlock API Key', sub = 'Enter the password you used when saving the key.' } = {}) {
  ensureInit();
  return new Promise(resolve => {
    const dlg     = $('apiPasswordDialog');
    const titleEl = $('apiPwTitle');
    const subEl   = $('apiPwSub');
    const input   = $('apiPwInput');
    const cancel  = $('apiPwCancel');
    const confirm = $('apiPwConfirm');
    const errEl   = $('apiPwError');
    if (!dlg || !input) { resolve(null); return; }

    titleEl.textContent = title;
    subEl.textContent   = sub;
    input.value = '';
    errEl.style.display = 'none';

    function cleanup(val) {
      dlg.classList.remove('active');
      cancel.removeEventListener('click', onCancel);
      confirm.removeEventListener('click', onConfirm);
      input.removeEventListener('keydown', onKey);
      dlg.removeEventListener('click', onBackdrop);
      resolve(val);
    }
    function onCancel()  { cleanup(null); }
    function onConfirm() {
      const v = input.value;
      if (!v) { errEl.textContent = 'Password required.'; errEl.style.display = ''; return; }
      cleanup(v);
    }
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); }
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }
    function onBackdrop(e)   { if (e.target === dlg) onCancel(); }

    cancel.addEventListener('click', onCancel);
    confirm.addEventListener('click', onConfirm);
    input.addEventListener('keydown', onKey);
    dlg.addEventListener('click', onBackdrop);

    dlg.classList.add('active');
    setTimeout(() => input.focus(), 50);
  });
}
