import { $ } from './dom.js';
import { LOCAL_API_KEY_STORAGE } from '../config.js';

// Modal shown when the free-tier vision quota is exhausted. Captures the
// user's own Anthropic key, persists it to localStorage, and resolves the
// open() promise so the caller can retry the failed request.
let _resolve = null;

export function initApiKeyDialog() {
  const dlg     = $('apiKeyDialog');
  const input   = $('apiKeyInput');
  const subEl   = $('apiKeyDialogSub');
  const errEl   = $('apiKeyError');
  const cancel  = $('apiKeyCancel');
  const confirm = $('apiKeyConfirm');

  function close(value) {
    dlg.classList.remove('active');
    errEl.style.display = 'none';
    errEl.textContent = '';
    input.value = '';
    const r = _resolve; _resolve = null;
    if (r) r(value);
  }

  cancel.addEventListener('click', () => close(false));
  dlg.addEventListener('click', e => { if (e.target === dlg) close(false); });

  confirm.addEventListener('click', () => {
    const v = input.value.trim();
    if (!v.startsWith('sk-ant-')) {
      errEl.textContent = 'Anthropic keys start with "sk-ant-".';
      errEl.style.display = '';
      return;
    }
    try { localStorage.setItem(LOCAL_API_KEY_STORAGE, v); }
    catch (e) {
      errEl.textContent = 'Could not save key to this browser.';
      errEl.style.display = '';
      return;
    }
    close(true);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm.click();
    else if (e.key === 'Escape') close(false);
  });
}

export function openApiKeyDialog(quotaInfo) {
  const dlg   = $('apiKeyDialog');
  const subEl = $('apiKeyDialogSub');
  const input = $('apiKeyInput');
  if (quotaInfo && (quotaInfo.total_used >= (quotaInfo.lifetime_limit ?? 100))) {
    subEl.textContent = `You've used all ${quotaInfo.lifetime_limit ?? 100} free vision calls on this account. Add your own Anthropic key to continue.`;
  } else if (quotaInfo) {
    const limit = quotaInfo.daily_limit ?? 10;
    subEl.textContent = `You've used your ${limit} free vision calls for today. Add your own Anthropic key to continue, or come back tomorrow.`;
  } else {
    subEl.textContent = 'Add your own Anthropic key to continue.';
  }
  dlg.classList.add('active');
  setTimeout(() => input.focus(), 50);
  return new Promise(r => { _resolve = r; });
}
