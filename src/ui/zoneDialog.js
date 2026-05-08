import { $ } from './dom.js';
import { repo } from '../data/repo.js';
import { session, events, EV } from '../state/session.js';
import { awardXP } from '../state/xp.js';

export function initZoneDialog({ onAfterDelete }) {
  const dlg     = $('zoneDialog');
  const title   = $('zoneDialogTitle');
  const nameInp = $('zoneNameInput');
  const typeInp = $('zoneTypeInput');
  const cancel  = $('zoneCancel');
  const del     = $('zoneDelete');
  const confirm = $('zoneConfirm');

  function open(zoneId) {
    session.pendingZoneId = zoneId || null;
    if (zoneId) {
      const z = repo.zones.get(zoneId);
      title.textContent = 'Edit Zone';
      nameInp.value = z.name;
      typeInp.value = z.type;
      del.style.display = '';
      confirm.textContent = 'Save';
    } else {
      title.textContent = 'New Zone';
      nameInp.value = '';
      typeInp.value = 'bed';
      del.style.display = 'none';
      confirm.textContent = 'Create';
    }
    dlg.classList.add('active');
    setTimeout(() => nameInp.focus(), 50);
  }

  function close() {
    dlg.classList.remove('active');
    session.pendingZoneId = null;
    if (del.dataset.confirming) {
      delete del.dataset.confirming;
      del.textContent = 'Delete';
    }
  }

  cancel.addEventListener('click', close);
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });

  confirm.addEventListener('click', () => {
    const name = nameInp.value.trim();
    if (!name) { events.emit(EV.TOAST, { msg: 'Please enter a name' }); return; }
    if (session.pendingZoneId) {
      repo.zones.update(session.pendingZoneId, { name, type: typeInp.value });
    } else {
      repo.zones.create({ name, type: typeInp.value });
      awardXP(5, 'New zone created');
    }
    events.emit(EV.ZONES_CHANGED);
    close();
  });

  del.addEventListener('click', () => {
    if (!session.pendingZoneId) return;
    if (del.dataset.confirming === '1') {
      const id = session.pendingZoneId;
      repo.zones.delete(id);
      delete del.dataset.confirming;
      del.textContent = 'Delete';
      close();
      events.emit(EV.ZONES_CHANGED);
      events.emit(EV.TOAST, { msg: 'Zone deleted' });
      onAfterDelete && onAfterDelete(id);
    } else {
      del.dataset.confirming = '1';
      del.textContent = 'Tap again to confirm';
      setTimeout(() => {
        if (del.dataset.confirming === '1') {
          delete del.dataset.confirming;
          del.textContent = 'Delete';
        }
      }, 3000);
    }
  });

  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') confirm.click(); });

  return { open, close };
}
