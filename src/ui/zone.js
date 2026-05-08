import { $, escapeHtml as esc } from './dom.js';
import { repo } from '../data/repo.js';
import { session, events, EV } from '../state/session.js';
import {
  ADD_HOLD_MS, TAG_HOLD_MS, BASE_DOT, BASE_FONT,
  MIN_ZOOM, MAX_ZOOM, MOVE_THRESH, TAG_MOVE_THRESH,
} from '../config.js';

// Wires up the zone-detail screen: tabs, map, markers, gestures.
// Callbacks are passed in so this module doesn't have to know about dialogs.
export function initZone({ onPlantTap, onPlantDoubleTap, onPlantLongPressDone, onAddPlantAtPct }) {
  const zoneScreen     = $('zoneScreen');
  const overviewScreen = $('overviewScreen');
  const zoneNameEl     = $('zoneName');
  const zoneTypeLabel  = $('zoneTypeLabel');
  const tabMap         = $('tabMap');
  const tabPlants      = $('tabPlants');
  const tabJournal     = $('tabJournal');
  const mapEmpty       = $('mapEmpty');
  const mapEl          = $('map');
  const stage          = $('stage');
  const zoneImg        = $('zoneImg');
  const zoomControls   = $('zoomControls');
  const zoomLabel      = $('zoomLabel');
  const plantsList     = $('plantsList');
  const journalList    = $('journalList');
  const pressRing      = $('pressRing');
  const pressRingFg    = pressRing.querySelector('.fg');
  const tagRing        = $('tagRing');
  const tagRingFg      = tagRing.querySelector('.fg');
  const backBtn        = $('backBtn');
  const zoneMenuBtn    = $('zoneMenuBtn');

  // ── Screen routing ────────────────────────────────────────────────
  function show(zoneId) {
    session.currentZoneId = zoneId;
    overviewScreen.classList.remove('active');
    zoneScreen.classList.add('active');
    const z = repo.zones.get(zoneId);
    if (!z) { events.emit(EV.NAV_OVERVIEW); return; }
    zoneNameEl.textContent = z.name;
    zoneTypeLabel.textContent = z.type.replace('_', ' ');
    switchTab('map');
    renderZoneMap();
    renderPlantsList();
    renderJournalList();
  }

  function switchTab(tab) {
    session.currentTab = tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    tabMap.style.display     = tab === 'map'     ? '' : 'none';
    tabPlants.style.display  = tab === 'plants'  ? '' : 'none';
    tabJournal.style.display = tab === 'journal' ? '' : 'none';
    if (tab === 'map') tabMap.classList.add('active'); else tabMap.classList.remove('active');
    const z = repo.zones.get(session.currentZoneId);
    if (tab === 'map' && z?.reference_image_path) setTimeout(fitImage, 50);
  }

  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );
  backBtn.addEventListener('click', () => events.emit(EV.NAV_OVERVIEW));
  zoneMenuBtn.addEventListener('click', () => events.emit('zone:edit', { zoneId: session.currentZoneId }));

  // ── Plants list ───────────────────────────────────────────────────
  function renderPlantsList() {
    if (!session.currentZoneId) return;
    const plants = repo.plants.listByZone(session.currentZoneId);
    if (plants.length === 0) {
      plantsList.innerHTML = `<div class="list-empty">No plants tagged yet.<br>Use the Map tab to upload a photo and start tagging.</div>`;
      return;
    }
    plantsList.innerHTML = plants.map((p, i) => {
      const displayName = p.pending ? '? Unidentified' : esc(p.display_label || p.species || 'Unknown');
      const meta = p.pending ? `<span style="color:#78c8e8">pending</span>` : esc(p.category);
      return `
        <div class="list-item" data-id="${p.id}">
          <div class="list-item-header">
            <div class="list-item-name">#${i+1} — ${displayName}</div>
            <div class="list-item-meta">${meta}</div>
          </div>
          ${p.notes ? `<div class="list-item-sub">${esc(p.notes)}</div>` : ''}
          ${p.pending ? `<div class="list-item-sub" style="color:#78c8e8">Saved for later — will identify when more photos are uploaded</div>` : ''}
        </div>
      `;
    }).join('');
    plantsList.querySelectorAll('.list-item').forEach(el => {
      el.addEventListener('click', () => onPlantDoubleTap && onPlantDoubleTap(el.dataset.id));
    });
  }

  // ── Journal list ──────────────────────────────────────────────────
  function renderJournalList() {
    if (!session.currentZoneId) return;
    const entries = repo.journal.listByZone(session.currentZoneId);
    if (entries.length === 0) {
      journalList.innerHTML = `<div class="list-empty">No journal entries yet.<br>Each photo upload creates a journal entry automatically.</div>`;
      return;
    }
    journalList.innerHTML = entries.slice().reverse().map(e => {
      const d = new Date(e.entry_date);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      return `
        <div class="list-item">
          <div class="list-item-header">
            <div class="list-item-name">${dateStr}</div>
            <div class="list-item-meta">${e.plant_count || 0} plants</div>
          </div>
          ${e.overall_health_note ? `<div class="list-item-sub">${esc(e.overall_health_note)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ── Map render ────────────────────────────────────────────────────
  function renderZoneMap() {
    const z = repo.zones.get(session.currentZoneId);
    if (!z) return;
    if (!z.reference_image_path) {
      mapEmpty.style.display = 'flex';
      mapEl.style.display = 'none';
      zoomControls.style.display = 'none';
      return;
    }
    mapEmpty.style.display = 'none';
    mapEl.style.display = '';
    zoomControls.style.display = '';
    zoneImg.onload = () => {
      session.imgRatio = zoneImg.naturalWidth / zoneImg.naturalHeight;
      fitImage();
      renderMarkers();
    };
    zoneImg.src = z.reference_image_path;
    if (zoneImg.complete && zoneImg.naturalWidth > 0) {
      session.imgRatio = zoneImg.naturalWidth / zoneImg.naturalHeight;
      fitImage();
      renderMarkers();
    }
  }

  function fitImage() {
    if (!mapEl || mapEl.style.display === 'none') return;
    const W = mapEl.clientWidth, H = mapEl.clientHeight;
    if (W <= 0 || H <= 0) return;
    if (W / H > session.imgRatio) {
      session.baseH = H * 0.94;
      session.baseW = session.baseH * session.imgRatio;
    } else {
      session.baseW = W * 0.96;
      session.baseH = session.baseW / session.imgRatio;
    }
    stage.style.width  = session.baseW + 'px';
    stage.style.height = session.baseH + 'px';
    session.zoom = 1;
    session.panX = (W - session.baseW) / 2;
    session.panY = (H - session.baseH) / 2;
    applyTransform();
  }

  function applyTransform() {
    stage.style.transform = `translate(${session.panX}px,${session.panY}px) scale(${session.zoom})`;
    zoomLabel.textContent = Math.round(session.zoom * 100) + '%';
    updateDotSizes();
  }

  function updateDotSizes() {
    const size = Math.max(14, Math.round(BASE_DOT / Math.sqrt(session.zoom)));
    const font = (BASE_FONT / Math.sqrt(session.zoom)).toFixed(2);
    const ttScale = (1 / session.zoom).toFixed(4);
    document.querySelectorAll('.marker-dot').forEach(d => {
      d.style.width = size + 'px';
      d.style.height = size + 'px';
      d.style.fontSize = font + 'rem';
    });
    document.querySelectorAll('.tooltip').forEach(t => {
      t.style.transform = `translateX(-50%) scale(${ttScale})`;
      t.style.transformOrigin = 'bottom center';
    });
  }

  function setZoomAt(nz, ax, ay) {
    nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nz));
    const ix = (ax - session.panX) / session.zoom;
    const iy = (ay - session.panY) / session.zoom;
    session.zoom = nz;
    session.panX = ax - ix * session.zoom;
    session.panY = ay - iy * session.zoom;
    applyTransform();
  }

  $('zoomIn').addEventListener('click',  () => setZoomAt(session.zoom * 1.25, mapEl.clientWidth/2, mapEl.clientHeight/2));
  $('zoomOut').addEventListener('click', () => setZoomAt(session.zoom / 1.25, mapEl.clientWidth/2, mapEl.clientHeight/2));
  $('zoomReset').addEventListener('click', fitImage);

  mapEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = mapEl.getBoundingClientRect();
    setZoomAt(session.zoom * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  function clientToImagePct(cx, cy) {
    const r = mapEl.getBoundingClientRect();
    const lx = cx - r.left, ly = cy - r.top;
    return {
      x: ((lx - session.panX) / session.zoom / session.baseW) * 100,
      y: ((ly - session.panY) / session.zoom / session.baseH) * 100,
    };
  }

  // ── Markers ───────────────────────────────────────────────────────
  function renderMarkers() {
    document.querySelectorAll('.marker').forEach(el => el.remove());
    if (!session.currentZoneId) return;
    const plants = repo.plants.listByZone(session.currentZoneId);
    const size = Math.max(14, Math.round(BASE_DOT / Math.sqrt(session.zoom)));
    const font = (BASE_FONT / Math.sqrt(session.zoom)).toFixed(2);
    const ttScale = (1 / session.zoom).toFixed(4);

    plants.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = `marker ${p.category}` + (p.pending ? ' pending' : '');
      el.dataset.id = p.id;
      el.style.left = p.x + '%';
      el.style.top  = p.y + '%';
      const displayName = p.pending ? '? Unidentified' : esc(p.display_label || p.species || 'Unknown');
      el.innerHTML = `
        <div class="marker-dot" style="width:${size}px;height:${size}px;font-size:${font}rem">${p.pending ? '?' : (i + 1)}</div>
        <div class="tooltip" style="transform:translateX(-50%) scale(${ttScale});transform-origin:bottom center">
          <strong>#${i+1} — ${displayName}</strong>${esc(p.notes || '')}${p.pending ? '<br><span style="color:#78c8e8">Pending — needs more photos</span>' : ''}
        </div>
      `;
      stage.appendChild(el);
    });
  }

  // ── Press rings ───────────────────────────────────────────────────
  function showAddRing(x, y) {
    pressRing.style.left = x + 'px'; pressRing.style.top = y + 'px';
    pressRingFg.style.transition = 'none';
    pressRingFg.style.strokeDashoffset = '138';
    pressRing.classList.add('active');
    void pressRingFg.getBoundingClientRect();
    pressRingFg.style.transition = `stroke-dashoffset ${ADD_HOLD_MS}ms linear`;
    pressRingFg.style.strokeDashoffset = '0';
  }
  function hideAddRing() {
    pressRing.classList.remove('active');
    pressRingFg.style.transition = 'none';
    pressRingFg.style.strokeDashoffset = '138';
  }
  function showTagRing(x, y) {
    tagRing.style.left = x + 'px'; tagRing.style.top = y + 'px';
    tagRingFg.style.transition = 'none';
    tagRingFg.style.strokeDashoffset = '339';
    tagRing.classList.add('active');
    void tagRingFg.getBoundingClientRect();
    tagRingFg.style.transition = `stroke-dashoffset ${TAG_HOLD_MS}ms linear`;
    tagRingFg.style.strokeDashoffset = '0';
  }
  function hideTagRing() {
    tagRing.classList.remove('active');
    tagRingFg.style.transition = 'none';
    tagRingFg.style.strokeDashoffset = '339';
  }

  // ── Gesture state machine ────────────────────────────────────────
  mapEl.addEventListener('contextmenu', e => e.preventDefault());

  mapEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-controls,.dialog-overlay,.care-panel,.toast')) return;
    session.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    mapEl.setPointerCapture(e.pointerId);

    if (session.activePointers.size === 2) { cancelAllTimers(); startPinch(); return; }
    if (e.button === 2) { cancelAllTimers(); startPan(e.clientX, e.clientY); e.preventDefault(); return; }

    const markerEl = e.target.closest('.marker');
    if (markerEl) { armTagPress(markerEl.dataset.id, markerEl, e.clientX, e.clientY); return; }
    if (e.button === 0 || e.pointerType === 'touch') armAddOrPan(e.clientX, e.clientY);
  });

  mapEl.addEventListener('pointermove', (e) => {
    if (session.activePointers.has(e.pointerId)) {
      session.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    }
    if (session.mode === 'pinch' && session.activePointers.size >= 2) { updatePinch(); return; }
    if (session.mode === 'pan') {
      session.panX = session.panStart.panX + (e.clientX - session.panStart.x);
      session.panY = session.panStart.panY + (e.clientY - session.panStart.y);
      applyTransform();
      return;
    }
    if (session.mode === 'tag-drag') {
      const pct = clientToImagePct(e.clientX, e.clientY);
      repo.plants.update(session.pressTagId, { x: pct.x, y: pct.y });
      const el = document.querySelector(`.marker[data-id="${session.pressTagId}"]`);
      if (el) { el.style.left = pct.x + '%'; el.style.top = pct.y + '%'; }
      return;
    }
    if (session.mode === 'add-press' && session.pressStart) {
      const dx = e.clientX - session.pressStart.x, dy = e.clientY - session.pressStart.y;
      if (Math.abs(dx) > MOVE_THRESH || Math.abs(dy) > MOVE_THRESH) {
        const sx = session.pressStart.x, sy = session.pressStart.y;
        cancelAllTimers();
        startPan(sx, sy);
        session.panX = session.panStart.panX + (e.clientX - session.panStart.x);
        session.panY = session.panStart.panY + (e.clientY - session.panStart.y);
        applyTransform();
      }
    } else if (session.mode === 'tag-press' && session.pressStart) {
      const dx = e.clientX - session.pressStart.x, dy = e.clientY - session.pressStart.y;
      if (Math.abs(dx) > TAG_MOVE_THRESH || Math.abs(dy) > TAG_MOVE_THRESH) {
        const sx = session.pressStart.x, sy = session.pressStart.y;
        session.pressTagId = null;
        cancelAllTimers();
        startPan(sx, sy);
        session.panX = session.panStart.panX + (e.clientX - session.panStart.x);
        session.panY = session.panStart.panY + (e.clientY - session.panStart.y);
        applyTransform();
      }
    }
  });

  mapEl.addEventListener('pointerup', (e) => {
    session.activePointers.delete(e.pointerId);
    if (session.mode === 'pinch') {
      if (session.activePointers.size < 2) {
        session.mode = 'idle'; session.pinchStart = null;
        if (session.activePointers.size === 1) {
          const [[, p]] = session.activePointers;
          startPan(p.x, p.y);
        }
      }
      return;
    }
    if (session.mode === 'pan') {
      if (session.activePointers.size === 0) finishPan();
      return;
    }
    if (session.mode === 'tag-drag') {
      finishTagDrag();
      // repo.plants.update already saved on each move; nothing else to persist here.
      return;
    }
    if (session.mode === 'tag-press') {
      const capturedId = session.pressTagId;
      cancelAllTimers();
      if (capturedId !== null) {
        const now = performance.now();
        const lastTap = session.lastTapTime[capturedId] || 0;
        if (now - lastTap < 400) {
          delete session.lastTapTime[capturedId];
          if (session.singleTapTimer) { clearTimeout(session.singleTapTimer); session.singleTapTimer = null; }
          onPlantDoubleTap && onPlantDoubleTap(capturedId);
        } else {
          session.lastTapTime[capturedId] = now;
          if (session.singleTapTimer) clearTimeout(session.singleTapTimer);
          session.singleTapTimer = setTimeout(() => {
            session.singleTapTimer = null;
            onPlantTap && onPlantTap(capturedId);
          }, 400);
        }
      }
      session.pressTagId = null;
      return;
    }
    if (session.mode === 'add-press') { cancelAllTimers(); return; }
  });

  mapEl.addEventListener('pointercancel', (e) => {
    session.activePointers.delete(e.pointerId);
    session.pressTagId = null;
    cancelAllTimers();
    if (session.mode === 'pan')   finishPan();
    if (session.mode === 'pinch') { session.mode = 'idle'; session.pinchStart = null; }
  });

  function startPinch() {
    const pts = Array.from(session.activePointers.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
    const r = mapEl.getBoundingClientRect();
    session.pinchStart = {
      dist,
      midX: midX - r.left,
      midY: midY - r.top,
      zoom: session.zoom, panX: session.panX, panY: session.panY,
      imgX: (midX - r.left - session.panX) / session.zoom,
      imgY: (midY - r.top  - session.panY) / session.zoom,
    };
    session.mode = 'pinch';
  }

  function updatePinch() {
    const pts = Array.from(session.activePointers.values());
    if (pts.length < 2 || !session.pinchStart) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const r = mapEl.getBoundingClientRect();
    const midX = (pts[0].x + pts[1].x) / 2 - r.left;
    const midY = (pts[0].y + pts[1].y) / 2 - r.top;
    session.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, session.pinchStart.zoom * (dist / session.pinchStart.dist)));
    session.panX = midX - session.pinchStart.imgX * session.zoom;
    session.panY = midY - session.pinchStart.imgY * session.zoom;
    applyTransform();
  }

  function startPan(cx, cy) {
    events.emit('care:close');
    session.mode = 'pan';
    mapEl.classList.add('panning');
    session.panStart = { x: cx, y: cy, panX: session.panX, panY: session.panY };
  }
  function finishPan() {
    session.mode = 'idle';
    mapEl.classList.remove('panning');
    session.panStart = null;
  }

  function armAddOrPan(cx, cy) {
    cancelAllTimers();
    session.mode = 'add-press';
    session.pressStart = { x: cx, y: cy };
    session.panStart   = { x: cx, y: cy, panX: session.panX, panY: session.panY };
    showAddRing(cx, cy);
    session.pressTimer = setTimeout(() => {
      if (session.mode !== 'add-press') return;
      const pct = clientToImagePct(session.pressStart.x, session.pressStart.y);
      session.pendingPos = pct;
      hideAddRing();
      session.mode = 'idle';
      session.pressStart = null;
      session.panStart = null;
      onAddPlantAtPct && onAddPlantAtPct(pct);
    }, ADD_HOLD_MS);
  }

  function armTagPress(id, markerEl, cx, cy) {
    cancelAllTimers();
    session.mode = 'tag-press';
    session.pressTagId = id;
    session.pressStart = { x: cx, y: cy, t: performance.now() };
    session.panStart   = { x: cx, y: cy, panX: session.panX, panY: session.panY };
    markerEl.classList.add('arming');
    showTagRing(cx, cy);
    const capturedId = id;
    session.pressTimer = setTimeout(() => {
      if (session.mode !== 'tag-press') return;
      const liveEl = document.querySelector(`.marker[data-id="${capturedId}"]`);
      if (liveEl) { liveEl.classList.remove('arming'); liveEl.classList.add('dragging'); }
      hideTagRing();
      session.mode = 'tag-drag';
      session.pressTagId = capturedId;
      onPlantLongPressDone && onPlantLongPressDone(capturedId);
      if (navigator.vibrate) navigator.vibrate(20);
    }, TAG_HOLD_MS);
  }

  function finishTagDrag() {
    if (session.pressTagId !== null) {
      const el = document.querySelector(`.marker[data-id="${session.pressTagId}"]`);
      if (el) el.classList.remove('dragging');
    }
    session.mode = 'idle';
    session.pressTagId = null;
    session.pressStart = null;
  }

  function cancelAllTimers() {
    if (session.pressTimer)     { clearTimeout(session.pressTimer);     session.pressTimer = null; }
    if (session.hintDelayTimer) { clearTimeout(session.hintDelayTimer); session.hintDelayTimer = null; }
    if (session.singleTapTimer) { clearTimeout(session.singleTapTimer); session.singleTapTimer = null; }
    hideAddRing(); hideTagRing();
    document.querySelectorAll('.marker.arming').forEach(el => el.classList.remove('arming'));
    if (session.mode === 'add-press' || session.mode === 'tag-press') {
      session.mode = 'idle';
      session.pressStart = null;
    }
  }

  // ── Event subscriptions ──────────────────────────────────────────
  events.on(EV.PLANTS_CHANGED, ({ zoneId } = {}) => {
    if (!zoneId || zoneId === session.currentZoneId) {
      renderMarkers();
      renderPlantsList();
    }
  });
  events.on(EV.JOURNAL_CHANGED, ({ zoneId } = {}) => {
    if (!zoneId || zoneId === session.currentZoneId) renderJournalList();
  });
  events.on(EV.ZONES_CHANGED, () => {
    if (session.currentZoneId) {
      const z = repo.zones.get(session.currentZoneId);
      if (!z) { events.emit(EV.NAV_OVERVIEW); return; }
      zoneNameEl.textContent = z.name;
      zoneTypeLabel.textContent = z.type.replace('_', ' ');
      renderZoneMap();
    }
  });

  window.addEventListener('resize', () => {
    if (session.currentZoneId && session.currentTab === 'map') {
      const z = repo.zones.get(session.currentZoneId);
      if (z?.reference_image_path) fitImage();
    }
  });

  return { show, switchTab, renderZoneMap, renderPlantsList, renderJournalList, renderMarkers, fitImage };
}
