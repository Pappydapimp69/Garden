import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { events, EV, session } from '../state/session.js';
import { awardXP } from '../state/xp.js';
import { CONF_HIGH, CONF_MED } from '../config.js';
import { processUpload, cropFromImage } from '../image/process.js';
import { analyzeFullPhoto } from '../vision/analyze.js';
import { reIdentifyBatch } from '../vision/reidentify.js';
import { QuotaError } from '../vision/client.js';
import { openApiKeyDialog } from './apiKeyDialog.js';
import { randomPhrase } from '../assets/loadingPhrases.js';
import { DEV_TEST_IMAGE } from '../assets/devTestImage.js';
import { extractCaptureDate } from '../image/exif.js';
import { logAction } from '../data/actionsLog.js';

export function initReview() {
  const screen     = $('reviewScreen');
  const titleEl    = $('reviewTitle');
  const subEl      = $('reviewSub');
  const confBadge  = $('reviewConfBadge');
  const imgEl      = $('reviewImg');
  const photoEl    = $('reviewPhoto');
  const statusEl   = $('reviewStatus');
  const listEl     = $('reviewList');
  const footerEl   = $('reviewFooter');
  const cancelBtn  = $('reviewCancel');
  const moreBtn    = $('reviewMoreAngles');
  const acceptBtn  = $('reviewAccept');

  let pendingTags      = [];
  let pendingDataUrl   = null;
  let pendingCaptureDate = null;
  let pendingFallbackDate = null;
  let selectedTagId    = null;
  let phraseInterval   = null;
  let reidContext      = null;

  function open() { screen.classList.add('active'); }
  function close() {
    screen.classList.remove('active');
    pendingTags = [];
    pendingDataUrl = null;
    pendingCaptureDate = null;
    pendingFallbackDate = null;
    selectedTagId = null;
    reidContext = null;
    imgEl.src = '';
  }

  function startPhraseCycle(elId) {
    if (phraseInterval) clearInterval(phraseInterval);
    phraseInterval = setInterval(() => {
      const t = document.getElementById(elId);
      if (t) t.textContent = randomPhrase();
    }, 1800);
  }
  function stopPhraseCycle() {
    if (phraseInterval) { clearInterval(phraseInterval); phraseInterval = null; }
  }

  function showProcessing() {
    titleEl.textContent = 'Analyzing Photo…';
    subEl.textContent = 'First scan';
    confBadge.style.display = 'none';
    statusEl.style.display = 'none';
    footerEl.style.display = 'none';
    photoEl.querySelectorAll('.review-marker').forEach(m => m.remove());
    listEl.innerHTML = `
      <div class="review-processing">
        <div class="review-processing-spinner"></div>
        <div class="review-processing-text" id="reviewProcessingText">${randomPhrase()}</div>
        <div class="review-processing-sub">Identifying plants in your photo</div>
      </div>
    `;
    startPhraseCycle('reviewProcessingText');
    open();
  }

  function showError(msg) {
    stopPhraseCycle();
    titleEl.textContent = 'Analysis Failed';
    subEl.textContent = 'Try again or cancel';
    listEl.innerHTML = `<div class="review-list-empty" style="color:#f88">Analysis failed:<br>${esc(msg)}</div>`;
    footerEl.style.display = '';
    acceptBtn.style.display = 'none';
    moreBtn.style.display = 'none';
    events.emit(EV.TOAST, { msg: 'Failed: ' + (typeof msg === 'string' ? msg : 'unknown error').slice(0, 80), kind: 'error' });
  }

  function avgConfidence(tags) {
    if (!tags.length) return 0;
    return tags.reduce((s, t) => s + (t.confidence || 0), 0) / tags.length;
  }

  function categoryEmoji(c) {
    return c === 'fruiting' ? '🍅' : c === 'herb' ? '🌿' : c === 'flowering' ? '🌸' : '❓';
  }

  // Run a vision call. If the free quota is exhausted, prompt the user for
  // their own API key and retry once. If they cancel, surface the quota error.
  async function withQuotaRetry(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof QuotaError) {
        stopPhraseCycle();
        const ok = await openApiKeyDialog(e.info);
        if (!ok) throw e;
        startPhraseCycle('reviewProcessingText');
        return await fn();
      }
      throw e;
    }
  }

  // ── Public entry: handle a photo (file or dev image) ──────────────
  async function handlePhoto(fileOrDataUrl) {
    if (!session.currentZoneId) {
      events.emit(EV.TOAST, { msg: 'No active zone', kind: 'error' });
      return;
    }
    const z = repo.zones.get(session.currentZoneId);
    showProcessing();
    try {
      pendingCaptureDate = null;
      pendingFallbackDate = null;

      // Extract EXIF date and lastModified fallback for real files.
      if (typeof fileOrDataUrl !== 'string') {
        pendingFallbackDate = fileOrDataUrl.lastModified || Date.now();
        pendingCaptureDate = await extractCaptureDate(fileOrDataUrl);
      }

      const dataUrl = (typeof fileOrDataUrl === 'string')
        ? fileOrDataUrl
        : await processUpload(fileOrDataUrl);
      imgEl.src = dataUrl;
      const existing = repo.plants.listByZone(z.id);
      const result = await withQuotaRetry(() => analyzeFullPhoto(dataUrl, z.type, existing));
      handleAnalysisResult(dataUrl, result);
    } catch (err) {
      console.error('Photo analysis failed:', err);
      showError(err.message || String(err));
    }
  }

  async function handleDevPhoto() {
    if (!DEV_TEST_IMAGE) {
      events.emit(EV.TOAST, { msg: 'Dev image not available in this build', kind: 'error' });
      return;
    }
    return handlePhoto(DEV_TEST_IMAGE);
  }

  function handleAnalysisResult(dataUrl, result) {
    stopPhraseCycle();
    pendingDataUrl = dataUrl;

    // Sort top→bottom, then left→right within rough rows.
    const sorted = (result.plants || []).slice().sort((a, b) => {
      if (Math.abs(a.y - b.y) > 15) return a.y - b.y;
      return a.x - b.x;
    });
    pendingTags = sorted.map((p, i) => ({
      ...p, accepted: true, id: repo.newId('t'), displayNum: i + 1,
    }));

    const overall = result.overall_confidence ?? avgConfidence(pendingTags);
    const overallPct = Math.round(overall * 100);

    titleEl.textContent = 'Review Tags';
    subEl.textContent = `${pendingTags.length} plant${pendingTags.length === 1 ? '' : 's'} identified`;

    confBadge.style.display = '';
    confBadge.textContent = `${overallPct}%`;
    confBadge.className = 'review-conf ' + (overall >= CONF_HIGH ? 'high' : overall >= CONF_MED ? 'med' : 'low');

    statusEl.style.display = '';
    const legend = `<div style="font-size:0.5rem; color:#7a8a6a; letter-spacing:0.05em; margin-top:5px; line-height:1.5">Tap 🍅/🌿/🌸/❓ to change category · Tap 👎 to flag for re-ID with closer crop · Tap name to rename</div>`;
    if (overall >= CONF_HIGH) {
      statusEl.className = 'review-status high';
      statusEl.innerHTML = `Looks good. Review and adjust if needed, then accept.${legend}`;
    } else if (overall >= CONF_MED) {
      statusEl.className = 'review-status med';
      statusEl.innerHTML = `Some uncertainty here. Review and adjust, or add another angle.${legend}`;
    } else {
      statusEl.className = 'review-status low';
      statusEl.innerHTML = `Low confidence overall. Recommend adding another angle, or accept and adjust manually.${legend}`;
    }

    photoEl.style.display = '';
    footerEl.style.display = '';
    acceptBtn.style.display = '';
    moreBtn.style.display = (overall >= CONF_HIGH) ? 'none' : '';

    // Populate the date input with EXIF or fallback.
    const dateInput = document.getElementById('reviewDateInput');
    const capturedMs = pendingCaptureDate ?? pendingFallbackDate ?? Date.now();
    dateInput.value = formatDatetimeLocal(capturedMs);
    dateInput.max = formatDatetimeLocal(Date.now());

    renderMarkers();
    renderList();
    updateAcceptLabel();

    const z = repo.zones.get(session.currentZoneId);
    logAction('photo_analyzed', { plant_count: pendingTags.length, zone_type: z ? z.type : null });
  }

  function renderMarkers() {
    photoEl.querySelectorAll('.review-marker').forEach(m => m.remove());
    pendingTags.forEach(t => {
      const m = document.createElement('div');
      m.className = `review-marker ${t.category || 'unknown'}`
        + (t.accepted ? '' : ' rejected')
        + (selectedTagId === t.id ? ' selected' : '');
      m.dataset.id = t.id;
      m.style.left = t.x + '%';
      m.style.top  = t.y + '%';
      m.innerHTML = `<div class="dot">${t.displayNum}</div>`;
      m.addEventListener('click', (e) => { e.stopPropagation(); selectTag(t.id); });
      photoEl.appendChild(m);
    });
  }

  function renderList() {
    if (pendingTags.length === 0) {
      listEl.innerHTML = `<div class="review-list-empty">No plants identified.<br>Try another angle or accept to manually tag.</div>`;
      return;
    }
    listEl.innerHTML = pendingTags.map(t => {
      const conf = Math.round((t.confidence || 0) * 100);
      const cls = conf >= 75 ? 'high' : conf >= 45 ? 'med' : 'low';
      return `
        <div class="review-item ${t.accepted ? '' : 'rejected'} ${selectedTagId === t.id ? 'selected' : ''}" data-id="${t.id}">
          <div class="review-item-head">
            <div class="ri-num ${t.category || 'unknown'}">${t.displayNum}</div>
            <div class="ri-info">
              <div class="ri-name" data-edit="name">${esc(t.name || 'Unknown')}</div>
              <div class="ri-meta">${esc(t.category || 'unknown')} · ${conf}% confidence${t.notes ? ' · ' + esc(t.notes) : ''}</div>
              <div class="ri-conf-bar"><div class="ri-conf-fill ${cls}" style="width:${conf}%"></div></div>
            </div>
            <div class="ri-actions">
              <button class="ri-act-btn" data-act="cycle" title="Change category">${categoryEmoji(t.category)}</button>
              <button class="ri-act-btn danger" data-act="reject" title="${t.accepted ? 'Reject — will retry with closer crop' : 'Restore'}">${t.accepted ? '👎' : '↩'}</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.review-item').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('click', (e) => {
        if (e.target.closest('.ri-act-btn') || e.target.closest('[data-edit]')) return;
        selectTag(id);
      });
      el.querySelector('[data-edit="name"]').addEventListener('click', (e) => {
        e.stopPropagation(); startNameEdit(id, el);
      });
      el.querySelector('[data-act="cycle"]').addEventListener('click', (e) => {
        e.stopPropagation(); cycleCategory(id);
      });
      el.querySelector('[data-act="reject"]').addEventListener('click', (e) => {
        e.stopPropagation(); toggleReject(id);
      });
    });
  }

  function selectTag(id) {
    selectedTagId = (selectedTagId === id) ? null : id;
    renderMarkers();
    renderList();
    if (selectedTagId) {
      const el = listEl.querySelector(`.review-item[data-id="${selectedTagId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function startNameEdit(id, itemEl) {
    const t = pendingTags.find(tt => tt.id === id);
    if (!t) return;
    const nameEl = itemEl.querySelector('.ri-name');
    const input = document.createElement('input');
    input.className = 'ri-name-edit';
    input.value = t.name || '';
    nameEl.replaceWith(input);
    input.focus(); input.select();
    const commit = () => { t.name = input.value.trim() || 'Unknown'; renderList(); };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape') renderList();
    });
  }

  function cycleCategory(id) {
    const t = pendingTags.find(tt => tt.id === id);
    if (!t) return;
    const order = ['fruiting','herb','flowering','unknown'];
    const idx = order.indexOf(t.category);
    const oldCat = t.category;
    t.category = order[(idx + 1) % order.length];

    // High-confidence species + user changing category = strong signal the
    // species was wrong. Auto-flag for re-ID.
    if (t.accepted && (t.confidence || 0) >= CONF_HIGH && t.category !== oldCat && !t._categoryEdited) {
      t.accepted = false;
      t._categoryEdited = true;
      events.emit(EV.TOAST, { msg: 'High-confidence species flagged for re-ID', kind: 'xp' });
    }

    renderMarkers();
    renderList();
    updateAcceptLabel();
  }

  function toggleReject(id) {
    const t = pendingTags.find(tt => tt.id === id);
    if (!t) return;
    t.accepted = !t.accepted;
    renderMarkers();
    renderList();
    updateAcceptLabel();
  }

  function updateAcceptLabel() {
    const accepted = pendingTags.filter(t => t.accepted).length;
    const rejected = pendingTags.filter(t => !t.accepted).length;
    if (rejected > 0) {
      acceptBtn.textContent = `Retry ${rejected} →`;
      acceptBtn.title = `${accepted} accepted, ${rejected} flagged for re-ID`;
    } else {
      acceptBtn.textContent = accepted === 0 ? 'Accept' : `Accept ${accepted}`;
      acceptBtn.title = '';
    }
  }

  // ── Commit accepted tags as plants + journal entry ───────────────
  function commitTagsToZone(zoneId, accepted) {
    const z = repo.zones.get(zoneId);
    if (!z) return;
    if (!z.reference_image_path) {
      repo.zones.update(z.id, { reference_image_path: pendingDataUrl });
    }
    accepted.forEach(t => {
      repo.plants.create({
        id: t.id,
        zone_id: z.id,
        display_label: t.name || 'Unknown',
        species: t.name || null,
        category: t.category || 'unknown',
        notes: t.notes || '',
        x: t.x, y: t.y,
        confidence: t.confidence ?? null,
        pending: !!t.pending,
        custom: !!t.custom,
      });
      logAction('plant_confirmed', {
        species_canonical: (t.name || '').toLowerCase() || null,
        confidence: t.confidence ?? null,
        category: t.category || 'unknown',
        zone_type: z.type,
      });
    });
    const dateInput = document.getElementById('reviewDateInput');
    const entryDate = parseDatetimeLocal(dateInput.value) ?? Date.now();
    repo.journal.append({
      zone_id: z.id,
      entry_date: entryDate,
      photo_path: null,            // intentionally not persisting photo on backend (cost)
      vision_data: null,
      plant_count: accepted.length,
      overall_health_note: `${accepted.length} plants tagged from photo`,
    });
    logAction('journal_entry_saved', { zone_id: z.id, plant_count: accepted.length });

    awardXP(10 + accepted.length * 2, `Photo analyzed (${accepted.length} plants)`);
    events.emit(EV.PLANTS_CHANGED,  { zoneId: z.id });
    events.emit(EV.JOURNAL_CHANGED, { zoneId: z.id });
    events.emit(EV.ZONES_CHANGED);  // thumb may have changed
    close();
  }

  // ── Re-ID flow ───────────────────────────────────────────────────
  async function startReIDFlow(zoneId, accepted, rejected) {
    const z = repo.zones.get(zoneId);
    reidContext = {
      zoneId,
      accepted,
      rejected: rejected.map(r => ({ ...r, choice: null })),
      suggestions: [],
      crops: [],
    };

    titleEl.textContent = 'Re-identifying…';
    subEl.textContent = `${rejected.length} crop${rejected.length === 1 ? '' : 's'} to re-analyze`;
    confBadge.style.display = 'none';
    statusEl.style.display = 'none';
    footerEl.style.display = 'none';
    photoEl.style.display = 'none';
    listEl.innerHTML = `
      <div class="review-processing">
        <div class="review-processing-spinner"></div>
        <div class="review-processing-text" id="reidProcText">${randomPhrase()}</div>
        <div class="review-processing-sub">Cropping and re-analyzing rejected plants</div>
      </div>
    `;
    startPhraseCycle('reidProcText');

    try {
      const crops = [];
      for (const r of reidContext.rejected) {
        const url = await cropFromImage(pendingDataUrl, r.x, r.y);
        crops.push({ url, wasName: r.name });
      }
      reidContext.crops = crops;

      const confirmedPlants = [...repo.plants.listByZone(z.id), ...accepted];
      const result = await withQuotaRetry(
        () => reIdentifyBatch(crops.map(c => c.url), reidContext.rejected, z.type, confirmedPlants),
      );
      reidContext.suggestions = result.crops || [];

      stopPhraseCycle();
      showReIDReviewScreen();
    } catch (err) {
      stopPhraseCycle();
      console.error('Re-ID failed:', err);
      showError('Re-ID failed: ' + (err.message || err));
    }
  }

  function showReIDReviewScreen() {
    if (!reidContext) return;
    titleEl.textContent = 'Re-identify Rejected';
    subEl.textContent = `${reidContext.rejected.length} plant${reidContext.rejected.length === 1 ? '' : 's'} to confirm`;
    confBadge.style.display = 'none';
    statusEl.style.display = '';
    statusEl.className = 'review-status med';
    statusEl.innerHTML = `Pick a suggestion, type the correct name, save for later, or skip to drop.<div style="font-size:0.5rem; color:#7a8a6a; letter-spacing:0.05em; margin-top:5px; line-height:1.5">Save for later keeps the plant on the map but waits for more photos to confirm species.</div>`;
    photoEl.style.display = 'none';
    footerEl.style.display = '';
    moreBtn.style.display = 'none';
    acceptBtn.disabled = false;

    listEl.innerHTML = `<div class="reid-list">${
      reidContext.rejected.map((r, i) => {
        const crop = reidContext.crops[i].url;
        const sugg = reidContext.suggestions.find(s => s.index === i + 1);
        const candidates = sugg?.candidates || [];
        return `
          <div class="reid-card" data-idx="${i}">
            <div class="reid-card-head">
              <div class="reid-num">${r.displayNum}</div>
              <div class="reid-card-title">
                <div class="was">Was identified as</div>
                <div class="was-name">${esc(r.name)}</div>
              </div>
            </div>
            <img class="reid-crop" src="${crop}" alt="">
            <div class="reid-suggestions">
              ${candidates.map((c, ci) => {
                const conf = Math.round((c.confidence || 0) * 100);
                const cls = conf >= 75 ? 'high' : conf >= 45 ? 'med' : 'low';
                return `
                  <div class="reid-sugg" data-idx="${i}" data-cand="${ci}">
                    <div class="reid-sugg-name">${esc(c.name)} <span style="color:#7a8a6a">· ${esc(c.category || 'unknown')}</span></div>
                    <div class="reid-sugg-conf ${cls}">${conf}%</div>
                  </div>
                `;
              }).join('')}
              <div class="reid-custom" data-idx="${i}">
                <span class="reid-custom-icon">✎</span>
                <input type="text" placeholder="Type the correct plant name…" data-idx="${i}">
              </div>
              <button class="reid-defer" data-idx="${i}" data-cand="defer">Save for later <span class="reid-defer-sub">Keep on map · confirm species after more photos</span></button>
              <button class="reid-skip" data-idx="${i}" data-cand="skip">Skip — drop this plant</button>
            </div>
          </div>
        `;
      }).join('')
    }</div>`;

    function clearSelection(idx) {
      listEl.querySelectorAll(`[data-idx="${idx}"].selected`).forEach(e => e.classList.remove('selected'));
    }

    listEl.querySelectorAll('.reid-sugg').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const cand = parseInt(el.dataset.cand);
        reidContext.rejected[idx].choice = reidContext.suggestions.find(s => s.index === idx + 1).candidates[cand];
        clearSelection(idx);
        el.classList.add('selected');
        const inp = listEl.querySelector(`.reid-custom input[data-idx="${idx}"]`);
        if (inp) inp.value = '';
        updateReIDFinishLabel();
      });
    });

    listEl.querySelectorAll('.reid-custom input').forEach(inp => {
      const idx = parseInt(inp.dataset.idx);
      const wrap = inp.closest('.reid-custom');
      const commit = () => {
        const v = inp.value.trim();
        if (v) {
          reidContext.rejected[idx].choice = { name: v, category: 'unknown', confidence: 1, _custom: true };
          clearSelection(idx);
          wrap.classList.add('selected');
        } else if (wrap.classList.contains('selected')) {
          reidContext.rejected[idx].choice = null;
          wrap.classList.remove('selected');
        }
        updateReIDFinishLabel();
      };
      inp.addEventListener('input', commit);
      inp.addEventListener('focus', () => clearSelection(idx));
    });

    listEl.querySelectorAll('.reid-defer').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        reidContext.rejected[idx].choice = 'defer';
        clearSelection(idx);
        el.classList.add('selected');
        const inp = listEl.querySelector(`.reid-custom input[data-idx="${idx}"]`);
        if (inp) inp.value = '';
        updateReIDFinishLabel();
      });
    });

    listEl.querySelectorAll('.reid-skip').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        reidContext.rejected[idx].choice = 'skip';
        clearSelection(idx);
        el.classList.add('selected');
        const inp = listEl.querySelector(`.reid-custom input[data-idx="${idx}"]`);
        if (inp) inp.value = '';
        updateReIDFinishLabel();
      });
    });

    updateReIDFinishLabel();
    acceptBtn.onclick = () => {
      const finalAccepted = [...reidContext.accepted];
      reidContext.rejected.forEach(r => {
        if (!r.choice || r.choice === 'skip') return;
        if (r.choice === 'defer') {
          finalAccepted.push({
            ...r,
            name: 'Unidentified',
            category: 'unknown',
            confidence: null,
            pending: true,
          });
          return;
        }
        finalAccepted.push({
          ...r,
          name: r.choice.name,
          category: r.choice.category,
          confidence: r.choice.confidence,
          custom: r.choice._custom || false,
          pending: false,
        });
      });
      commitTagsToZone(reidContext.zoneId, finalAccepted);
      acceptBtn.onclick = null;
      acceptBtn.textContent = 'Accept';
    };
  }

  function updateReIDFinishLabel() {
    if (!reidContext) return;
    const decided = reidContext.rejected.filter(r => r.choice).length;
    const total = reidContext.rejected.length;
    acceptBtn.textContent = decided < total ? `Finish (${decided}/${total})` : 'Finish';
  }

  // ── Date formatting helpers ──────────────────────────────────────
  function formatDatetimeLocal(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  function parseDatetimeLocal(str) {
    // Parse "YYYY-MM-DDTHH:MM" to local-time epoch ms.
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, y, mo, d, h, min] = match.map(Number);
    const date = new Date(y, mo - 1, d, h, min, 0);
    return date.getTime();
  }

  // ── Wire up footer buttons ───────────────────────────────────────
  cancelBtn.addEventListener('click', () => { stopPhraseCycle(); close(); });

  // moreBtn is a <label for="photoInput"> — the picker opens natively when
  // tapped. We just need to close the review screen; the file input's
  // change handler will reopen processing once a file is picked.
  moreBtn.addEventListener('click', () => { close(); });

  acceptBtn.addEventListener('click', async () => {
    // When in re-ID mode, acceptBtn.onclick is set above. This default handler
    // only runs for the first review pass.
    if (acceptBtn.onclick) return;
    if (!session.currentZoneId || !pendingDataUrl) return;

    const accepted = pendingTags.filter(t => t.accepted);
    const rejected = pendingTags.filter(t => !t.accepted);

    rejected.forEach(() => logAction('plant_rejected', { zone_id: session.currentZoneId }));

    if (rejected.length > 0) {
      await startReIDFlow(session.currentZoneId, accepted, rejected);
    } else {
      commitTagsToZone(session.currentZoneId, accepted);
    }
  });

  return {
    handlePhoto,
    handleDevPhoto,
    open, close,
    showProcessing, showError,
  };
}
