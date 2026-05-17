import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { getCare } from '../care/careService.js';

export function initCarePanel() {
  const panel = $('carePanel');
  const title = $('careTitle');
  const sub   = $('careSub');
  const body  = $('careBody');
  const close = $('careClose');

  async function openById(plantId) {
    const p = repo.plants.get(plantId);
    if (!p) return;
    const label = p.display_label || p.species || 'Plant';
    title.textContent = label;
    sub.textContent = p.category || '';
    panel.classList.add('open');
    body.innerHTML = '<div style="color:#aaa;font-size:0.65rem;padding:10px 0">Loading care info…</div>';
    const info = await getCare(p);
    if (!info) {
      body.innerHTML = `<div style="color:#e88;font-size:0.65rem;padding:10px 0">No care info available for "${esc(label)}".</div>`;
    } else {
      let html = '<div class="care-section"><div class="care-section-title">At a Glance</div>';
      if (info.sun)     html += `<span class="care-tag sun">☀️ ${esc(info.sun)}</span>`;
      if (info.spacing) html += `<span class="care-tag zone">↔ ${esc(info.spacing)}</span>`;
      html += '</div>';
      if (info.water)      html += `<div class="care-section"><div class="care-section-title">Watering</div><p>${esc(info.water)}</p></div>`;
      if (info.soil)       html += `<div class="care-section"><div class="care-section-title">Soil</div><p>${esc(info.soil)}</p></div>`;
      if (info.fertilizer) html += `<div class="care-section"><div class="care-section-title">Fertilizer</div><p>${esc(info.fertilizer)}</p></div>`;
      if (info.harvest)    html += `<div class="care-section"><div class="care-section-title">Harvest</div><p>${esc(info.harvest)}</p></div>`;
      if (info.pests?.length) {
        html += '<div class="care-section"><div class="care-section-title">Watch For</div><ul>';
        info.pests.forEach(x => html += `<li>${esc(x)}</li>`);
        html += '</ul></div>';
      }
      if (info.tips?.length) {
        html += '<div class="care-section"><div class="care-section-title">Texas Tips</div><ul>';
        info.tips.forEach(x => html += `<li>${esc(x)}</li>`);
        html += '</ul></div>';
      }
      body.innerHTML = html;
    }
  }

  function closePanel() { panel.classList.remove('open'); }
  close.addEventListener('click', closePanel);

  return { openById, close: closePanel };
}
