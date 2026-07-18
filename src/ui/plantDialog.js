import { $ } from './dom.js';
import { repo } from '../data/repo.js';
import { session, events, EV } from '../state/session.js';
import { awardXP } from '../state/xp.js';
import { logAction } from '../data/actionsLog.js';

export function initPlantDialog() {
  const dlg     = $('plantDialog');
  const title   = $('plantDialogTitle');
  const name    = $('plantName');
  const cat     = $('plantCategory');
  const notes   = $('plantNotes');
  const cancel  = $('plantCancel');
  const del     = $('plantDelete');
  const confirm = $('plantConfirm');
  const community = $('plantCommunity');

  // Show an honestly-framed plant-network insight for this species in the
  // user's area. Sample size drives the framing (and the RPC stays quiet below
  // its publish threshold), so we never over-claim from thin data. Async +
  // race-guarded: a fast dialog reopen must not paint a stale species' insight.
  let communityReq = 0;
  async function showCommunity(species) {
    const my = ++communityReq;
    community.style.display = 'none';
    community.textContent = '';
    if (!species) return;
    let r;
    try { r = await repo.community.insight(species); }
    catch { return; }
    if (my !== communityReq) return;  // superseded by a newer open()
    if (r && r.enough) {
      const conf = Math.round((r.avg_confidence || 0) * 100);
      const cat  = r.top_category && r.top_category !== 'unknown'
        ? ` · mostly tagged ${r.top_category}` : '';
      community.textContent =
        `🌍 Based on ${r.sample} report${r.sample === 1 ? '' : 's'} of `
        + `${species} in your area${cat} · avg ${conf}% confidence`;
      community.classList.remove('caution');
      community.style.display = '';
    } else if (r && r.sample > 0) {
      community.textContent =
        `🌍 Only ${r.sample} nearby report${r.sample === 1 ? '' : 's'} of `
        + `${species} so far — take with caution`;
      community.classList.add('caution');
      community.style.display = '';
    }
    // enough:false with 0 samples (or local mode) → stay quiet.
  }

  function openNew() {
    session.editingPlantId = null;
    title.textContent = 'New Plant';
    name.value = ''; cat.value = 'unknown'; notes.value = '';
    del.style.display = 'none';
    confirm.textContent = 'Add';
    showCommunity(null);
    dlg.classList.add('active');
    setTimeout(() => name.focus(), 50);
  }

  function open(plantId) {
    const p = repo.plants.get(plantId);
    if (!p) return;
    session.editingPlantId = plantId;
    title.textContent = 'Edit Plant';
    name.value  = p.display_label || p.species || '';
    cat.value   = p.category || 'unknown';
    notes.value = p.notes || '';
    del.style.display = '';
    confirm.textContent = 'Save';
    showCommunity(p.species || p.display_label || null);
    dlg.classList.add('active');
    setTimeout(() => name.focus(), 50);
  }

  function close() {
    dlg.classList.remove('active');
    session.editingPlantId = null;
    session.pendingPos = null;
  }

  cancel.addEventListener('click', close);
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });

  confirm.addEventListener('click', () => {
    const nameVal = name.value.trim() || 'Unknown Plant';
    const catVal  = cat.value;
    const notesVal = notes.value.trim();

    if (session.editingPlantId) {
      const old = repo.plants.get(session.editingPlantId);
      repo.plants.update(session.editingPlantId, {
        display_label: nameVal,
        species: nameVal,
        category: catVal,
        notes: notesVal,
      });
      logAction('plant_edited', { species_canonical: nameVal.toLowerCase(), old_species: old ? (old.species || '').toLowerCase() : null, category: catVal });
    } else if (session.pendingPos && session.currentZoneId) {
      repo.plants.create({
        zone_id: session.currentZoneId,
        display_label: nameVal,
        species: nameVal,
        category: catVal,
        notes: notesVal,
        x: session.pendingPos.x,
        y: session.pendingPos.y,
        custom: true,
      });
      logAction('plant_added_custom', { species_canonical: nameVal.toLowerCase(), category: catVal });
      awardXP(2, 'Manual tag added');
    }

    close();
    events.emit(EV.PLANTS_CHANGED, { zoneId: session.currentZoneId });
  });

  del.addEventListener('click', () => {
    if (!session.editingPlantId) return;
    repo.plants.softDelete(session.editingPlantId);
    close();
    events.emit(EV.PLANTS_CHANGED, { zoneId: session.currentZoneId });
  });

  [name, notes].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm.click();
  }));

  return { openNew, open, close };
}
