// The pal's offline brain: plain intent rules over the plant base, the
// calculators, the schedule and the journal. Replies are short, spoken
// sentences. Anything it cannot place goes to the optional cloud brain.
//
// reply(text, ctx) -> { text, card? }   ctx = { state, weather, memo, cloud }

import { findPlant, GRADES } from './plants.js';
import { addPlant, log, today, uid } from './store.js';
import { waterStatus, sowNow, todayTasks, waterInterval, list } from './schedule.js';
import { diagnose } from './diagnose.js';
import { rainBarrel, rainGarden, mulch, drip, compost, bedFit } from './calc.js';
import { summarize } from './weather.js';
import { progress, sayProgress } from './growth.js';

const num = (re, t) => { const m = t.match(re); return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const SQFT = /(\d[\d,]*(?:\.\d+)?)\s*(?:square feet|square foot|sq\.? ?ft|sqft|sf)\b/i;
const FEET = /(\d[\d,]*(?:\.\d+)?)\s*(?:feet|foot|ft)\b(?!\s*squared)/i;
const INCH = /(\d+(?:\.\d+)?)\s*(?:inches|inch|in)\b/i;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "seed" or "transplant" from what the user said, or null.
function startFrom(t) {
  if (/\b(transplants?|starts?|seedlings?|nursery|bought|set out|transplanted)\b/i.test(t)) return 'transplant';
  if (/\b(seeds?|sowed|sown|direct)\b/i.test(t)) return 'seed';
  return null;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function myPlants(state, plant) {
  return plant ? state.plants.filter((p) => p.id === plant.id) : [];
}

function plantFrom(text, memo) {
  const p = findPlant(text);
  if (p) { memo.lastPlant = p.id; return p; }
  if (/\b(it|them|they|those|these)\b/i.test(text) && memo.lastPlant) return findPlant(memo.lastPlant);
  return null;
}

function plantCard(p) {
  return {
    title: p.name, kind: p.kind,
    rows: [
      ['Sun', p.sun], ['Water', p.waterHow], ['Spacing', `${p.spacing} inches`],
      ['Harvest', `${p.days[0]} to ${p.days[1]} days`], ['Start from', p.start],
      ['Watch for', p.pests.join(', ')],
    ],
    tip: p.tip,
  };
}

const RULES = [
  { test: /^\s*$/, run: () => ({ text: 'I am listening.' }) },

  // Follow-up to "seed or transplant?"
  { test: /\b(seeds?|sowed|sown|direct|transplants?|starts?|seedlings?|nursery|bought)\b/i, run: ({ state, memo }, t) => {
    const ask = memo.askStart;
    if (!ask || /\b(i planted|planted|add|put in|set out)\b/i.test(t)) return null;
    memo.askStart = null;
    const start = startFrom(t);
    if (!start) return null;
    state.plants.filter((e) => ask.uids.includes(e.uid)).forEach((e) => { e.start = start; });
    return { text: `Thanks. I will count your ${ask.name} from ${start === 'seed' ? 'seed' : 'transplant'}. If the seed packet lists days to maturity, tell me and I will use that.`, changed: true };
  } },

  // "the packet says 65 days"
  { test: /\b(packet|label|tag|variety)\b.*\b(\d+)\s*days?\b|\b(\d+)\s*days? to maturity\b/i, run: ({ state, memo }, t) => {
    const p = plantFrom(t, memo);
    const mine = p ? myPlants(state, p) : state.plants.slice(-1);
    const d = num(/(\d+)\s*days?/i, t);
    if (!mine.length || !d || d > 365) return null;
    mine.forEach((e) => { e.days = d; });
    return { text: `Got it. I will use ${d} days for your ${mine[0].label}, adjusted for the heat it actually gets.`, changed: true };
  } },

  { test: /\b(help|what can you do|how do you work)\b/i, run: ({ state }) => ({
    text: `I can track your plants, tell you when to water and pick, help figure out sick plants, and do garden math like rain barrels and mulch. Try saying, I planted tomatoes. Or, my squash leaves are yellow.`,
  }) },

  { test: /^(hi|hey|hello|howdy|good (morning|afternoon|evening)|yo)\b/i, run: ({ state, weather, temps }) => {
    const n = state.settings.name ? `, ${state.settings.name}` : '';
    const tasks = todayTasks(state, weather, temps);
    const lead = pick([`Hey${n}!`, `Hi${n}!`, `Good to see you${n}.`]);
    if (!state.plants.length) return { text: `${lead} Your garden is empty so far. Tell me what you planted and I will keep track.` };
    return { text: tasks.length ? `${lead} ${tasks[0].text}${tasks.length > 1 ? ` I have ${tasks.length - 1} more thing${tasks.length > 2 ? 's' : ''} for today.` : ''}` : `${lead} Nothing urgent today. The garden looks good.` };
  } },

  { test: /\b(thanks|thank you|appreciate)\b/i, run: () => ({ text: pick(['Any time.', 'Happy to help.', 'You got it.']) }) },

  { test: /\b(i fed|fertilized|i fertilised|added compost|side dressed)\b/i, run: ({ state, memo }, t) => {
    const p = plantFrom(t, memo);
    const targets = p ? myPlants(state, p) : state.plants;
    targets.forEach((e) => { e.lastFed = today(); });
    log(state, `Fed ${p ? p.name : 'the garden'}.`);
    return { text: 'Logged the feeding.', changed: true };
  } },

  { test: /\bremind me\b/i, run: ({ state }, t) => {
    const what = (t.match(/remind me (?:to )?(.+?)(?:\s+(?:tomorrow|in \d+ days?|next week|on \w+))?[.!?]?$/i) || [])[1] || t;
    let days = 1;
    const inN = t.match(/in (\d+) days?/i);
    if (inN) days = +inN[1]; else if (/next week/i.test(t)) days = 7; else if (/today|tonight/i.test(t)) days = 0;
    const due = today(new Date(Date.now() + days * 86400000));
    state.reminders.push({ uid: uid(), text: what.replace(/^to /i, ''), due, done: false });
    return { text: `Okay. I will remind you to ${what} ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}.`, changed: true };
  } },

  // I planted X (in the back bed)
  { test: /\b(i planted|i just planted|planted|add|i put in|i set out|i transplanted)\b/i, run: ({ state, memo }, t) => {
    const p = plantFrom(t, memo);
    if (!p) return /\badd\b/i.test(t) && !/planted|put in|set out/i.test(t) ? null : { text: 'What did you plant? I know most common vegetables, herbs, and flowers.' };
    const bed = (t.match(/\bin (?:the |my )?([a-z ]{2,30}?(?:bed|box|pot|planter|garden|row|yard))\b/i) || [])[1] || 'main bed';
    const count = num(/(\d+)\s+(?!days?\b)/, t) || 1;
    const start = startFrom(t);
    const added = [];
    for (let i = 0; i < Math.min(count, 50); i++) added.push(addPlant(state, p, { bed, start }));
    const head = `Got it. ${count > 1 ? count + ' ' + p.name : cap(p.name)} in the ${bed}.`;
    if (!start && p.days) {
      memo.askStart = { uids: added.map((e) => e.uid), name: p.name };
      return { text: `${head} Did you start it from seed or a transplant? It changes when it will be ready.`, changed: true };
    }
    return { text: `${head} I will track its growth by the heat it gets. ${p.tip}`, changed: true };
  } },

  { test: /\b(i pulled|remove|pulled up|died|dead|get rid of)\b/i, run: ({ state, memo }, t) => {
    const p = plantFrom(t, memo);
    const mine = myPlants(state, p);
    if (!mine.length) return { text: 'I do not see that one in your garden.' };
    state.plants = state.plants.filter((e) => e.uid !== mine[0].uid);
    log(state, `Removed ${mine[0].label}.`);
    return { text: `Okay, I took one ${mine[0].label} off the list.`, changed: true };
  } },

  { test: /\b(i watered|watered|just watered)\b/i, run: ({ state, memo }, t) => {
    const p = /\b(everything|all|garden|beds)\b/i.test(t) ? null : plantFrom(t, memo);
    const targets = p ? myPlants(state, p) : state.plants;
    if (!targets.length) return { text: 'Nice. Add some plants and I will track watering for you.' };
    targets.forEach((e) => { e.lastWatered = today(); });
    log(state, `Watered ${p ? p.name : 'everything'}.`);
    return { text: `Logged. ${p ? `Your ${p.name} is` : 'Everything is'} watered for today.`, changed: true };
  } },

  // Calculators, before plant lookup so "mulch for my tomato bed" is math.
  { test: /\brain ?barrel|\bcistern|\brain tank|\bharvest rain/i, run: (_, t) => {
    const roof = num(SQFT, t);
    if (!roof) return { text: 'How big is the roof that drains to it, in square feet? Use the footprint, not the slope.' };
    const rain = num(INCH, t) || 1;
    const r = rainBarrel({ roofSqft: roof, rainInches: rain });
    return { text: `${r.say} ${r.caveat}`, card: { title: 'Rain barrel', rows: [['Roof', `${roof} square feet`], ['Rain', `${rain} inches`], ['Gallons', r.gallons], ['Barrels per storm', r.barrels]] } };
  } },

  { test: /\brain ?garden|\bswale/i, run: (_, t) => {
    const roof = num(SQFT, t);
    if (!roof) return { text: 'How many square feet of roof or pavement drain into it?' };
    const soil = /clay/i.test(t) ? 'clay' : /sand/i.test(t) ? 'sand' : 'loam';
    const r = rainGarden({ roofSqft: roof, soil });
    return { text: `${r.say} ${r.caveat}`, card: { title: 'Rain garden', rows: [['Drains', `${roof} square feet`], ['Soil', soil], ['Size', `${r.sqft} square feet`]] } };
  } },

  { test: /\bmulch/i, run: (_, t) => {
    const area = num(SQFT, t);
    if (!area) return { text: 'Keep mulch two to four inches deep and a hand width away from stems. Tell me the bed size in square feet and I will figure how much to buy.' };
    const depth = num(INCH, t) || 3;
    const material = /leaves|leaf/i.test(t) ? 'leaves' : 'wood chips';
    const r = mulch({ sqft: area, depthIn: depth, material });
    return { text: `${r.say} ${r.caveat}`, card: { title: 'Mulch', rows: [['Area', `${area} square feet`], ['Depth', `${Math.min(4, Math.max(2, depth))} inches`], ['Cubic yards', r.cubicYards], ['Bags', r.bags]] } };
  } },

  { test: /\bdrip|\bemitter|\birrigation line/i, run: (_, t) => {
    const len = num(FEET, t);
    if (!len) return { text: 'How many feet of drip line? I will check emitters, flow, and zones.' };
    const r = drip({ lengthFt: len, spacingIn: num(/(\d+)\s*inch(?:es)? (?:apart|spacing)/i, t) || 12 });
    return { text: `${r.say} ${r.caveat}`, card: { title: 'Drip line', rows: [['Length', `${len} feet`], ['Emitters', r.emitters], ['Flow', `${r.gpm} gallons a minute`], ['Zones', r.zones]] } };
  } },

  { test: /\bcompost/i, run: (_, t) => {
    const g = num(/(\d+)\s*(?:buckets? of )?greens?/i, t), b = num(/(\d+)\s*(?:buckets? of )?browns?/i, t);
    const r = compost({ greens: g || 0, browns: b || 0 });
    if (!g && !b) return { text: `Aim for about three buckets of browns, like dry leaves, for each bucket of greens, like scraps. Keep it damp like a wrung out sponge. ${r.caveat}` };
    return { text: `${r.say} ${r.caveat}` };
  } },

  { test: /\bhow many\b.*\bfit\b|\bhow many .* (?:in|per) (?:a|my|the)? ?(?:bed|box)/i, run: ({ memo }, t) => {
    const p = plantFrom(t, memo);
    const dims = t.match(/(\d+)\s*(?:by|x)\s*(\d+)/i);
    if (!p || !dims) return { text: 'Tell me the plant and the bed size, like how many tomatoes fit in a four by eight bed.' };
    return { text: bedFit({ lengthFt: +dims[1], widthFt: +dims[2], spacingIn: p.spacing }).say + ` That is at ${p.spacing} inches apart.` };
  } },

  // Something looks wrong.
  { test: /\b(yellow|brown|spots?|wilt|droop|holes?|chewed|eaten|sticky|aphids?|web|powder|mildew|rot|dying|sick|leggy|curl|no fruit|flowers fall|blossoms? drop|not fruiting|bugs?)\b/i, run: ({ memo }, t) => {
    plantFrom(t, memo);
    const d = diagnose(t);
    if (!d) return null;
    return { text: d.say, card: { title: 'Plant check', rows: [['You said', d.observed], ['Best guess', d.guess], ['To be sure', d.check], ['Try', d.fix]] } };
  } },

  { test: /\b(should i water|need(s)? water|water (it|them|today)|watering|thirsty)\b/i, run: ({ state, weather, memo }, t) => {
    const p = plantFrom(t, memo);
    const ctx = { weather, mulched: state.settings.mulched };
    if (p && !myPlants(state, p).length) {
      return { text: `${p.name} likes water about every ${waterInterval(p, ctx)} days. ${p.waterHow}.` };
    }
    const targets = p ? myPlants(state, p) : state.plants;
    if (!targets.length) return { text: 'Stick a finger two inches into the soil. If it is dry there, water deeply at the base.' };
    const due = targets.filter((e) => waterStatus(e, ctx)?.due);
    const rain = targets.some((e) => waterStatus(e, ctx)?.skipForRain);
    if (rain && !due.length) return { text: 'Rain is on the way, so hold off.' };
    if (!due.length) return { text: 'Not yet. Everything got water recently enough.' };
    return { text: `Yes. Water ${list(due.map((e) => e.label))}. Go deep, at the base, in the morning.` };
  } },

  { test: /\b(today|to ?do|tasks|chores|what should i do|anything to do)\b/i, run: ({ state, weather, temps }) => {
    const tasks = todayTasks(state, weather, temps);
    if (!tasks.length) return { text: state.plants.length ? 'Nothing needs you today. Maybe just take a walk through the garden.' : 'Add a few plants first and I will build your daily list.' };
    return { text: tasks.slice(0, 4).map((x) => x.text).join(' ') };
  } },

  { test: /\b(weather|forecast|rain|frost|freeze|hot|heat)\b/i, run: ({ weather }) => ({
    text: summarize(weather) || 'I do not have your location yet. Tap settings and let me use it, and I will watch the weather for you.',
  }) },

  { test: /\b(harvest|pick|ripe|ready|how long|how far along|progress|stage)\b/i, run: ({ state, memo, temps }, t) => {
    const p = plantFrom(t, memo);
    const mine = p ? myPlants(state, p) : state.plants;
    if (!mine.length) return { text: p ? `${p.name} usually takes ${p.days[0]} to ${p.days[1]} days in mild weather. Heat and cold change that a lot.` : 'You have not told me about any plants yet.' };
    // One line per kind and bed, so ten tomatoes are not read out ten times.
    const seen = new Set(), lines = [];
    for (const e of mine) {
      const k = `${e.id}|${e.bed}|${e.planted}`;
      if (seen.has(k) || lines.length >= 4) continue;
      seen.add(k);
      const pr = progress(e, temps);
      if (pr) lines.push(sayProgress(e, pr));
    }
    if (temps == null || !Object.keys(temps).length) lines.push('This is from calendar days only. Turn on location for a better read.');
    return { text: lines.join(' ') };
  } },

  { test: /\b(what (can|should) i (plant|sow|grow)|plant now|sow now|in season|this month)\b/i, run: ({ state }) => {
    const now = sowNow(state.settings);
    if (!now.length) return { text: 'Not much to sow right now. It is a good time to plan beds and build compost.' };
    const names = now.slice(0, 8).map((x) => x.plant.name);
    return { text: `Good time to plant ${list(names)}.` };
  } },

  { test: /\b(companions?|grows? (with|next to|near)|plant (next to|near|with)|goes with|pair)\b/i, run: ({ memo }, t) => {
    const p = plantFrom(t, memo);
    if (!p) return { text: 'Which plant are you pairing?' };
    const good = p.companions.map((c) => `${c.with} is ${GRADES[c.grade]}. ${c.why}.`);
    const bad = p.avoid.map((a) => `Keep it away from ${a.with}, since ${a.why}.`);
    if (!good.length && !bad.length) return { text: `I do not know a tested pairing for ${p.name}. Most companion claims are folklore, so plant what you like to eat and give everything room.` };
    return { text: [...good, ...bad].join(' ') };
  } },

  { test: /\b(my garden|what do i have|what('s| is) growing|list my|my plants)\b/i, run: ({ state }) => {
    if (!state.plants.length) return { text: 'Your garden list is empty.' };
    const counts = {};
    for (const e of state.plants) counts[e.label] = (counts[e.label] || 0) + 1;
    return { text: `You have ${list(Object.entries(counts).map(([k, v]) => (v > 1 ? `${v} ${k}` : k)))}.` };
  } },

  // Plant info, last so action phrases win.
  { test: /.*/, run: ({ memo }, t) => {
    const p = plantFrom(t, memo);
    if (!p) return null;
    return { text: `${cap(p.name)}. ${cap(p.sun)}. Water ${p.waterHow}. Space them ${p.spacing} inches apart. ${p.tip}`, card: plantCard(p) };
  } },
];

function offline(text, ctx) {
  for (const r of RULES) {
    if (!r.test.test(text)) continue;
    const out = r.run(ctx, text);
    if (out) { out.text = cap(out.text); return out; }
  }
  return null;
}

// Cloud first when signed in. The offline engine runs on a copy of the
// garden to produce a hint (its Brain-backed numbers), so only the cloud's
// checked actions change anything. Offline answers for real on any failure.
export async function reply(text, ctx) {
  ctx.memo ||= {};
  if (ctx.cloud) {
    const dry = { ...ctx, state: structuredClone(ctx.state), memo: { ...ctx.memo } };
    const hint = offline(text, dry);
    try {
      const out = await ctx.cloud(text, { ...ctx, hint: hint?.text });
      if (out?.text) {
        const done = ctx.applyActions ? ctx.applyActions(ctx.state, out.actions) : [];
        // Keep the follow-up memory (last plant named) in step.
        plantFrom(text, ctx.memo);
        return { text: out.text, card: hint?.card, cloud: true, changed: done.length > 0 };
      }
    } catch {}
  }
  return offline(text, ctx) ||
    { text: 'I am not sure about that one yet. Ask me about a plant, watering, a problem you see, or garden math.' };
}
