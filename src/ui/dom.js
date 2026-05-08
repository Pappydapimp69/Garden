// Centralized DOM lookups. Imported by UI modules so we don't `getElementById`
// the same node from three different files.

export const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`#${id} not found`);
  return el;
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}
