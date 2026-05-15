import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { fetchCareAdvice } from '../vision/careAdvice.js';
import * as careCache from '../care/careCache.js';
import { randomPhrase } from '../assets/loadingPhrases.js';
import { events, EV } from '../state/session.js';

export function initCarePanel() {
  const panel = $('carePanel');
  const title = $('careTitle');
  const sub   = $('careSub');
  const body  = $('careBody');
  const close = $('careClose');

  let currentPlantId = null;
  let phraseTimer = null;

  function renderAdvice(info) {
    if (!info) {
      body.innerHTML = `<div style="color:#bcd;font-size:0.65rem;padding:10px 0">No care info yet.</div>`;
      return;
    }
    let html = '';
    const hasGlance = info.sun || info.spacing;
    if (hasGlance) {
      html += '<div class="care-section"><div class="care-section-title">At a Glance</div>';
      if (info.sun)     html += `<span class="care-tag sun">☀️ ${esc(info.sun)}</span>`;
      if (info.spacing) html += `<span class="care-tag zone">↔ ${esc(info.spacing)}</span>`;
      html += '</div>';
    }
    if (info.water)      html += `<div class="care-section"><div class="care-section-title">Watering</div><p>${esc(info.water)}</p></div>`;
    if (info.soil)       html += `<div class="care-section"><div class="care-section-title">Soil</div><p>${esc(info.soil)}</p></div>`;
    if (info.fertilizer) html += `<div class="care-section"><div class="care-section-title">Fertilizer</div><p>${esc(info.fertilizer)}</p></div>`;
    if (info.harvest)    html += `<div class="care-section"><div class="care-section-title">Harvest</div><p>${esc(info.harvest)}</p></div>`;
    if (info.pests?.length) {
      html += '<div class="care-section"><div class="care-section-title">Watch For</div><ul>';
      info.pests.forEach(x => html += `<li>${esc(x)}</li>`);
      html += '</ul></div>';
    }
    if (info.concerns?.length) {
      html += '<div class="care-section"><div class="care-section-title">Concerns from your photos</div><ul>';
      info.concerns.forEach(x => html += `<li>${esc(x)}</li>`);
      html += '</ul></div>';
    }
    if (info.tips?.length) {
      html += '<div class="care-section"><div class="care-section-title">Tips</div><ul>';
      info.tips.forEach(x => html += `<li>${esc(x)}</li>`);
      html += '</ul></div>';
    }
    body.innerHTML = html;
  }

  function renderFooter({ hasAdvice }) {
    const wrap = document.createElement('div');
    wrap.className = 'care-actions';
    wrap.style.cssText = 'display:flex;gap:8px;margin-top:14px';
    const btn = document.createElement('button');
    btn.className = 'btn btn-confirm';
    btn.textContent = hasAdvice ? 'Refresh advice' : 'Get care advice';
    btn.addEventListener('click', () => fetchAndRender(true));
    wrap.appendChild(btn);
    body.appendChild(wrap);
  }

  function startPhraseCycle() {
    stopPhraseCycle();
    phraseTimer = setInterval(() => {
      const el = body.querySelector('.care-loading-text');
      if (el) el.textContent = randomPhrase();
    }, 1800);
  }
  function stopPhraseCycle() {
    if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null; }
  }

  function renderLoading() {
    body.innerHTML = `
      <div class="care-loading" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:30px 0;color:#9bb">
        <div class="review-processing-spinner"></div>
        <div class="care-loading-text" style="font-size:0.65rem;letter-spacing:0.05em">${esc(randomPhrase())}</div>
      </div>
    `;
    startPhraseCycle();
  }

  function renderError(msg) {
    body.innerHTML = `<div style="color:#f88;font-size:0.65rem;padding:10px 0">Care advice failed: ${esc(msg)}</div>`;
    renderFooter({ hasAdvice: false });
  }

  async function fetchAndRender(force) {
    const plantId = currentPlantId;
    if (!plantId) return;
    const plant = repo.plants.get(plantId);
    if (!plant) return;

    const zone = repo.zones.get(plant.zone_id);
    const refImage = zone?.reference_image_path || null;

    renderLoading();
    try {
      const advice = await fetchCareAdvice(plantId);
      stopPhraseCycle();
      if (plantId !== currentPlantId) return;  // panel switched out
      careCache.set(plantId, advice, refImage);
      renderAdvice(advice);
      renderFooter({ hasAdvice: true });
    } catch (err) {
      stopPhraseCycle();
      if (plantId !== currentPlantId) return;
      const msg = err?.message || String(err);
      console.error('Care advice failed:', err);
      events.emit(EV.TOAST, { msg: 'Care advice failed: ' + msg.slice(0, 80), kind: 'error' });
      renderError(msg);
    }
    void force;  // signature includes the flag for future "force-refresh" semantics
  }

  function openById(plantId) {
    const p = repo.plants.get(plantId);
    if (!p) return;
    currentPlantId = plantId;
    const label = p.display_label || p.species || 'Plant';
    title.textContent = label;
    sub.textContent = p.category || '';

    body.innerHTML = '';
    const notes = (p.notes || '').trim();
    if (notes) {
      const np = document.createElement('div');
      np.className = 'care-section';
      np.innerHTML = `<div class="care-section-title">Your notes</div><p>${esc(notes)}</p>`;
      body.appendChild(np);
    }

    const cached = careCache.get(plantId);
    if (cached?.advice) {
      renderAdvice(cached.advice);
      renderFooter({ hasAdvice: true });
    } else {
      const cta = document.createElement('div');
      cta.style.cssText = 'color:#bcd;font-size:0.65rem;padding:10px 0';
      cta.textContent = 'No care advice yet. Tap below to ask the assistant.';
      body.appendChild(cta);
      renderFooter({ hasAdvice: false });
    }

    panel.classList.add('open');
  }

  function closePanel() {
    panel.classList.remove('open');
    stopPhraseCycle();
    currentPlantId = null;
  }
  close.addEventListener('click', closePanel);

  return { openById, close: closePanel };
}
