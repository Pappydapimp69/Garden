// node pal/test/run.mjs — offline checks for the pal brain, math and voice text.
import assert from 'node:assert/strict';
import { reply } from '../js/pal.js';
import { toSpeech, chunks } from '../js/speech.js';
import { rainBarrel, rainGarden, mulch, drip } from '../js/calc.js';
import { diagnose } from '../js/diagnose.js';
import { findPlant } from '../js/plants.js';
import { sowNow } from '../js/schedule.js';

const fresh = () => ({ settings: { name: 'Zane', palName: 'Pip', mulched: true, lastFrost: '03-15', firstFrost: '11-15' }, plants: [], journal: [], reminders: [], chat: [] });
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await t('plant lookup prefers longest match', () => {
  assert.equal(findPlant('my bell pepper').id, 'pepper');
  assert.equal(findPlant('zucchini').id, 'squash');
  assert.equal(findPlant('nothing here'), null);
});

await t('adds plants from speech', async () => {
  const s = fresh(), ctx = { state: s, memo: {} };
  const r = await reply('I planted 3 tomatoes in the back bed', ctx);
  assert.equal(s.plants.length, 3);
  assert.equal(s.plants[0].bed, 'back bed');
  assert.match(r.text, /tomato/);
});

await t('pronoun follows last plant', async () => {
  const s = fresh(), ctx = { state: s, memo: {} };
  await reply('I planted squash', ctx);
  const r = await reply('when can I harvest it', ctx);
  assert.match(r.text, /summer squash in about \d+ days/i);
});

await t('add compost is feeding, not planting', async () => {
  const s = fresh(), ctx = { state: s, memo: {} };
  await reply('I planted kale', ctx);
  await reply('I added compost', ctx);
  assert.equal(s.plants.length, 1);
  assert.match(s.journal[0].text, /Fed/);
});

await t('watering skips for rain', async () => {
  const s = fresh(), ctx = { state: s, memo: {}, weather: { high: 80, rainToday: 0.8, rainTomorrow: 0, minNext3: 60, maxNext3: 85 } };
  await reply('I planted lettuce', ctx);
  s.plants[0].lastWatered = '2020-01-01';
  const r = await reply('should I water?', ctx);
  assert.match(r.text, /hold off/);
});

await t('diagnosis splits guess and check', async () => {
  const d = diagnose('the new top leaves are yellow');
  assert.equal(d.id, 'yellow-new');
  assert.match(d.check, /pH/);
  const r = await reply('my squash is wilting', { state: fresh(), memo: {} });
  assert.match(r.text, /borer/);
});

await t('rain barrel uses fixed first flush', () => {
  const r = rainBarrel({ roofSqft: 1000, rainInches: 1 });
  assert.equal(r.gallons, Math.round(1000 * 0.92 * 0.623));
  const many = rainBarrel({ roofSqft: 1000, rainInches: 1, storms: 10 });
  assert.ok(many.gallons < r.gallons, 'many small storms lose more to first flush');
});

await t('rain garden and mulch caveats present', () => {
  assert.match(rainGarden({ roofSqft: 1200, soil: 'clay' }).say, /two days/);
  assert.equal(rainGarden({ roofSqft: 1200, soil: 'clay' }).sqft, 200);
  assert.match(mulch({ sqft: 100, depthIn: 8 }).say, /hand width/);
  assert.equal(drip({ lengthFt: 400 }).tooLong, true);
});

await t('chat calculators parse numbers', async () => {
  const r = await reply('rain barrel for 1,000 square feet', { state: fresh(), memo: {} });
  assert.match(r.text, /gallons/);
  const m = await reply('how much mulch for 200 sq ft', { state: fresh(), memo: {} });
  assert.match(m.text, /cubic yards/);
});

await t('companions carry evidence grades', async () => {
  const r = await reply('what grows with tomato', { state: fresh(), memo: {} });
  assert.match(r.text, /folklore/);
  assert.match(r.text, /fennel/);
});

await t('sow now for spring', () => {
  const names = sowNow(fresh().settings, new Date('2026-03-29T12:00')).map((x) => x.plant.id);
  assert.ok(names.includes('tomato'));
  assert.ok(!names.includes('spinach'));
});

await t('reminders', async () => {
  const s = fresh();
  const r = await reply('remind me to fertilize the peppers in 3 days', { state: s, memo: {} });
  assert.equal(s.reminders.length, 1);
  assert.match(r.text, /in 3 days/);
});

await t('speech text is clean', () => {
  assert.equal(toSpeech('**Water** 1-2" a week 🌱 at 95°F & 50%'), 'Water 1 to 2 inches a week at 95 degrees and 50 percent');
  assert.deepEqual(chunks('Use 1.5 cubic yards. Then rake.'), ['Use 1.5 cubic yards.', 'Then rake.']);
  assert.equal(toSpeech('3 in the bed'), '3 in the bed');
});

await t('every reply is speakable', async () => {
  const s = fresh(), ctx = { state: s, memo: {} };
  for (const q of ['hi', 'help', 'I planted basil', 'what should I do today', 'what can I plant now', 'tell me about okra', 'my garden', 'weather', 'compost', 'banana spaceship']) {
    const r = await reply(q, ctx);
    assert.ok(r.text && r.text.length < 400, q);
    assert.doesNotMatch(r.text, /[*#`]|undefined|NaN/, q);
  }
});

console.log(`${n} passed`);
