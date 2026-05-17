// Floating dropdown anchored to the account button. Replaces the old
// confirm() → logout shortcut with a proper Settings + Sign out menu.

import { $ } from './dom.js';

export function initProfileMenu({ onSettings, onSignout }) {
  const menu = $('profileMenu');
  if (!menu) return { toggle: () => {}, close: () => {} };

  let open = false;

  function position(anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.top   = (r.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
  }

  function show(anchor) {
    position(anchor);
    menu.hidden = false;
    menu.classList.add('open');
    open = true;
  }
  function close() {
    menu.classList.remove('open');
    menu.hidden = true;
    open = false;
  }
  function toggle(anchor) {
    if (open) close(); else show(anchor);
  }

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    close();
    if (act === 'settings') onSettings && onSettings();
    if (act === 'signout')  onSignout  && onSignout();
  });

  document.addEventListener('click', (e) => {
    if (!open) return;
    if (e.target.closest('#profileMenu') || e.target.closest('#accountBtn')) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close();
  });

  return { toggle, close };
}
