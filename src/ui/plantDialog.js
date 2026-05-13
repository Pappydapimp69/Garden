import { $ } from './dom.js';
import { repo } from '../data/repo.js';
import { session, events, EV } from '../state/session.js';
import { awardXP } from '../state/xp.js';

export function initPlantDialog() {
  const dlg     = $('plantDialog');
  const title   = $('plantDialogTitle');
  const name    = $('plantName');
  const cat     = $('plantCategory');
  const notes   = $('plantNotes');
  const cancel  = $('plantCancel');
  const del     = $('plantDelete');
  const confirm = $('plantConfirm');

  function openNew() {
    session.editingPlantId = null;
    title.textContent = 'New Plant';
    name.value = ''; cat.value = 'unknown'; notes.value = '';
    del.style.display = 'none';
    confirm.textContent = 'Add';
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

  confirm.addEventListener('click', async () => {
    const nameVal = name.value.trim() || 'Unknown Plant';
    const catVal  = cat.value;
    const notesVal = notes.value.trim();

    if (session.editingPlantId) {
      await repo.plants.update(session.editingPlantId, {
        display_label: nameVal,
        species: nameVal,
        category: catVal,
        notes: notesVal,
      });
    } else if (session.pendingPos && session.currentZoneId) {
      await repo.plants.create({
        zone_id: session.currentZoneId,
        display_label: nameVal,
        species: nameVal,
        category: catVal,
        notes: notesVal,
        x: session.pendingPos.x,
        y: session.pendingPos.y,
        custom: true,
      });
      await awardXP(2, 'Manual tag added');
    }

    close();
    events.emit(EV.PLANTS_CHANGED, { zoneId: session.currentZoneId });
  });

  del.addEventListener('click', async () => {
    if (!session.editingPlantId) return;
    await repo.plants.softDelete(session.editingPlantId);
    close();
    events.emit(EV.PLANTS_CHANGED, { zoneId: session.currentZoneId });
  });

  [name, notes].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirm.click();
  }));

  return { openNew, open, close };
}
