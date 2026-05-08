import { $ } from './dom.js';
import { events, EV } from '../state/session.js';

let toastTimer = null;

export function showToast(msg, kind = '') {
  const el = $('toast');
  if (!el) return;
  el.className = 'toast' + (kind ? ' ' + kind : '');
  if (kind === 'xp') {
    el.innerHTML = `<div class="xp-label">⬢ XP</div>${msg}`;
  } else {
    el.textContent = msg;
  }
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

export function initToast() {
  events.on(EV.TOAST, ({ msg, kind }) => showToast(msg, kind));
}
