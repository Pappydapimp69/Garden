// Growth tracking by heat, not by calendar days.
//
// Seed packet "days to maturity" assume warm, steady weather. Plants really
// grow on accumulated heat (growing degree days, GDD). We turn the packet
// days into a heat target, then count the heat this plant has actually had.
//
// Brain lesson (concrete maturity): the base temperature and the handling
// of missing weather days move the answer far more than fine detail, so
// both are explicit here, and filled-in days are counted and reported.
//
// Packet days are counted from transplant for crops normally set out as
// transplants, and from sowing for crops normally direct sown. If the user
// started a transplant crop from seed, the seedling weeks are added.

import { getPlant } from './plants.js';
import { today, daysBetween } from './store.js';

// Reference heat per day the packet numbers assume: a mild season, mean
// about 62F for cool crops and 72F for warm crops.
export const REF_GDD_PER_DAY = 22;

// base: temp in F below which the crop barely grows. opt: growth is fastest
// here. max: growth stops again; cool crops like broccoli stall in heat, so
// hot days count for less, not more. nursery: days a transplant spent as a seedling. phase: the
// name of the stage before harvest. ripe: how to tell, in spoken words.
const COOL = { base: 40, opt: 70, max: 90 };
const WARM = { base: 50, opt: 86, max: 104 };
export const GROWTH = {
  tomato:     { ...WARM, nursery: 42, phase: 'flowering and fruiting', ripe: 'Pick when fully colored and a little soft. In real heat, pick at first blush and let them finish indoors.' },
  pepper:     { ...WARM, nursery: 56, phase: 'flowering and fruiting', ripe: 'Pick green once firm and full size, or wait for color for sweeter peppers.' },
  jalapeno:   { ...WARM, nursery: 56, phase: 'flowering and fruiting', ripe: 'Pick at about three inches, firm and glossy. Little tan lines mean extra heat.' },
  squash:     { ...WARM, nursery: 21, phase: 'flowering and fruiting', ripe: 'Pick at six to eight inches while the skin is still shiny and soft.' },
  cucumber:   { ...WARM, nursery: 21, phase: 'flowering and fruiting', ripe: 'Pick firm and green, before any yellow shows.' },
  beans:      { ...WARM, nursery: 14, phase: 'flowering and setting pods', ripe: 'Pick when pods snap cleanly and the beans inside are still small.' },
  okra:       { ...WARM, nursery: 28, phase: 'flowering and setting pods', ripe: 'Pick pods at about three inches, before they go woody.' },
  corn:       { ...WARM, nursery: 14, phase: 'tasseling and silking', ripe: 'Ready about three weeks after silks show. Silks go brown and a kernel squirts milky juice.' },
  watermelon: { ...WARM, nursery: 21, phase: 'flowering and fruiting', ripe: 'The ground spot turns creamy yellow and the curl nearest the fruit dries brown.' },
  basil:      { ...WARM, nursery: 35, phase: 'leafing out', ripe: 'Start picking once it has six to eight sets of leaves. Pinch above a leaf pair.' },
  sunflower:  { ...WARM, nursery: 14, phase: 'budding', ripe: 'For seeds, wait until the back of the head turns yellow brown.' },
  zinnia:     { ...WARM, nursery: 28, phase: 'budding', ripe: 'Cut when the stem below the bloom is stiff, not wobbly.' },
  marigold:   { ...WARM, nursery: 42, phase: 'budding', ripe: 'Blooms are ready when fully open.' },
  lettuce:    { ...COOL, nursery: 28, phase: 'filling out', ripe: 'Pick outer leaves any time they are big enough. Harvest all before it bolts.' },
  spinach:    { ...COOL, nursery: 28, phase: 'filling out', ripe: 'Pick big outer leaves. Harvest all if it starts to stretch up.' },
  kale:       { ...COOL, nursery: 35, phase: 'filling out', ripe: 'Pick lower leaves once they are hand sized. A frost makes them sweeter.' },
  broccoli:   { ...COOL, nursery: 42, phase: 'heading', ripe: 'Cut when the head is tight and dark green, before any yellow flowers open. Side shoots follow.' },
  carrot:     { ...COOL, nursery: 0, phase: 'rooting', ripe: 'Brush soil off a shoulder. About as wide as your finger or more means ready.' },
  radish:     { ...COOL, nursery: 0, phase: 'rooting', ripe: 'Pick when the shoulder shows about an inch wide. Wait too long and they go pithy.' },
  onion:      { ...COOL, nursery: 56, phase: 'bulbing', ripe: 'Ready when most tops fall over on their own.' },
  potato:     { ...COOL, nursery: 0, phase: 'setting tubers', ripe: 'New potatoes after flowering. Full size once the vines die back.' },
  strawberry: { ...COOL, nursery: 0, phase: 'flowering and fruiting', ripe: 'Pick when fully red all the way to the cap.' },
  cilantro:   { ...COOL, nursery: 21, phase: 'leafing out', ripe: 'Cut outer stems at four to six inches. Heat makes it bolt.' },
  fennel:     { ...COOL, nursery: 28, phase: 'bulbing', ripe: 'Cut the bulb when it is about the size of a tennis ball.' },
  rosemary:   { ...WARM, nursery: 56, phase: 'establishing', ripe: 'Snip sprigs any time, never more than a third at once.' },
  thyme:      { ...WARM, nursery: 56, phase: 'establishing', ripe: 'Snip sprigs any time, before it flowers for best flavor.' },
  mint:       { ...WARM, nursery: 28, phase: 'leafing out', ripe: 'Snip stems any time once it is bushy.' },
  lavender:   { ...WARM, nursery: 70, phase: 'budding', ripe: 'Cut stems when about half the buds on a spike have opened.' },
};
const DEFAULT = { ...WARM, nursery: 28, phase: 'maturing', ripe: '' };

export function growthOf(id) { return GROWTH[id] || DEFAULT; }

// Growth rate at one temperature: rises from base to opt, falls to zero at max.
export function rate(t, { base, opt, max }) {
  if (t <= base || t >= max) return 0;
  if (t <= opt) return t - base;
  return (opt - base) * (max - t) / (max - opt);
}

// Heat for one day: average of the day's high and low rates.
export function dayGdd(tmax, tmin, g) {
  return (rate(tmax, g) + rate(tmin, g)) / 2;
}

// Days to maturity for this entry, counted from its planting date.
export function maturityDays(entry, plant) {
  const g = growthOf(plant.id);
  const [lo, hi] = entry.days ? [entry.days, entry.days + 10] : plant.days;
  let shift = 0;
  const start = entry.start || plant.start;
  if (plant.start === 'transplant' && start === 'seed') shift = g.nursery;
  if (plant.start === 'seed' && start === 'transplant') shift = -Math.min(g.nursery, 14);
  return [Math.max(1, lo + shift), Math.max(2, hi + shift)];
}

// temps: { 'YYYY-MM-DD': [tmax, tmin] } covering planted..now and some
// forecast. Returns a progress report; works without temps (calendar only).
export function progress(entry, temps, now = today()) {
  const plant = getPlant(entry.id);
  if (!plant || !plant.days) return null;
  const g = growthOf(plant.id);
  const [lo, hi] = maturityDays(entry, plant);
  const age = Math.max(0, daysBetween(entry.planted, now));
  const loHeat = lo * REF_GDD_PER_DAY, hiHeat = hi * REF_GDD_PER_DAY;

  let heat = 0, filled = 0, recent = [];
  const haveTemps = temps && Object.keys(temps).length > 0;
  if (haveTemps) {
    const observed = [];
    for (let i = 0; i < age; i++) {
      const d = addDays(entry.planted, i);
      const t = temps[d];
      if (t) { const x = dayGdd(t[0], t[1], g); observed.push(x); heat += x; if (age - i <= 14) recent.push(x); }
      else filled++;
    }
    // Fill missing days with this plant's own observed average, never with
    // zero (that would read as a cold snap) or the packet rate (too warm).
    const avg = observed.length ? observed.reduce((a, b) => a + b, 0) / observed.length : REF_GDD_PER_DAY;
    heat += filled * avg;
    // Forecast days help project the pace forward.
    for (let i = 0; i < 7; i++) { const t = temps[addDays(now, i)]; if (t) recent.push(dayGdd(t[0], t[1], g)); }
  } else {
    heat = age * REF_GDD_PER_DAY;
  }

  const pace = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : REF_GDD_PER_DAY;
  const frac = heat / loHeat;
  let stage;
  if (frac < 0.15) stage = 'getting established';
  else if (frac < 0.6) stage = 'growing leaves and roots';
  else if (heat < loHeat) stage = g.phase;
  else if (heat <= hiHeat) stage = 'harvest window';
  else stage = 'past the usual window';

  const state = heat < loHeat ? 'growing' : heat <= hiHeat ? 'check' : 'late';
  const stalled = pace < 3;
  const inDays = state === 'growing' ? (stalled ? null : Math.ceil((loHeat - heat) / pace)) : 0;
  return {
    plant, state, stage, age, heat: Math.round(heat), target: [loHeat, hiHeat],
    percent: Math.min(100, Math.round((heat / loHeat) * 100)),
    inDays, stalled, pace: +pace.toFixed(1), calendarOnly: !haveTemps, filled, ripe: g.ripe,
    calendarWouldSay: age >= lo ? (age <= hi ? 'check' : 'late') : 'growing',
  };
}

// One spoken line about where a plant is.
export function sayProgress(entry, p) {
  if (!p) return '';
  const name = entry.label;
  if (p.state === 'growing') {
    const when = p.stalled ? 'Growth has nearly stopped in this cold, so it may sit a while.'
      : `Start checking in about ${p.inDays} days.`;
    if (p.percent < 5) return `Your ${name} is just getting started. ${when}`;
    return `Your ${name} is about ${p.percent} percent of the way, ${p.stage}. ${when}`;
  }
  if (p.state === 'check') return `Your ${name} is in its harvest window. Start checking. ${p.ripe}`;
  return `Your ${name} is past its usual window. ${p.ripe || 'Pick what is good.'}`;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
