import { repo } from '../data/repo.js';
import { events, EV } from './session.js';

export function xpForLevel(level) {
  return Math.round(50 * Math.pow(level, 1.4));
}

export async function awardXP(amount, reason) {
  let { xp, level } = repo.progress.get();
  xp += amount;
  let leveled = false;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    leveled = true;
  }
  await repo.progress.set({ xp, level });
  events.emit(EV.PROGRESS_CHANGED, { xp, level, leveled, amount, reason });
  if (leveled) {
    events.emit(EV.TOAST, { msg: `Level up! Vision is now Lv ${level}`, kind: 'xp' });
  } else if (reason) {
    events.emit(EV.TOAST, { msg: `+${amount} XP — ${reason}`, kind: 'xp' });
  }
}
