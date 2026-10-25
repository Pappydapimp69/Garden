// Plant knowledge base. Every line here may be read aloud, so text is plain
// words: no symbols, no abbreviations, no ranges written with dashes.
//
// sow: weeks relative to frost dates. spring is relative to LAST frost
// (negative = before it), fall is relative to FIRST frost (negative = before).
// waterEvery: base days between deep waterings in mild weather, before mulch
// and heat adjustments.
//
// Companion claims carry a grade (see GRADES). Brain lesson: grade a
// companion claim by mechanism and dose, not by how often it is repeated.

export const GRADES = {
  tested:    'backed by real trials',
  plausible: 'has a sensible reason but thin proof',
  folklore:  'mostly garden folklore',
};

export const PLANTS = [
  { id: 'tomato', name: 'tomato', aliases: ['tomatoes', 'cherry tomato'], kind: 'vegetable',
    sun: 'full sun, at least eight hours', waterEvery: 3, waterHow: 'deep at the base, about an inch or two a week',
    spacing: 24, days: [60, 85], start: 'transplant', sow: { spring: [0, 6], fall: [-16, -12] },
    pests: ['hornworm', 'whitefly', 'blossom end rot'],
    companions: [
      { with: 'basil', grade: 'folklore', why: 'great on the plate, but the pest benefit is untested' },
      { with: 'marigold', grade: 'plausible', why: 'only cuts root knot nematodes when planted thick, like a cover crop' },
    ],
    avoid: [{ with: 'fennel', why: 'fennel can stunt neighbors up to about ten feet away' }],
    tip: 'Stake or cage early. Fruit set stalls above about ninety five degrees, so shade cloth helps in July.' },
  { id: 'pepper', name: 'bell pepper', aliases: ['pepper', 'peppers', 'bell peppers', 'sweet pepper'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'steady moisture, about an inch a week',
    spacing: 18, days: [60, 90], start: 'transplant', sow: { spring: [2, 8], fall: [-16, -12] },
    pests: ['aphids', 'spider mites', 'blossom end rot'], companions: [], avoid: [{ with: 'fennel', why: 'fennel stunts neighbors' }],
    tip: 'Even watering prevents blossom end rot. Stake before the branches load up.' },
  { id: 'jalapeno', name: 'jalapeno', aliases: ['jalapenos', 'jalapeño', 'hot pepper', 'serrano'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 4, waterHow: 'about an inch a week, a little drought makes them hotter',
    spacing: 16, days: [70, 85], start: 'transplant', sow: { spring: [2, 8], fall: [-16, -12] },
    pests: ['aphids', 'pepper weevil'], companions: [], avoid: [],
    tip: 'Loves heat. Pick often and it keeps making more.' },
  { id: 'squash', name: 'summer squash', aliases: ['squash', 'zucchini', 'yellow squash'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'deep, one or two times a week, keep it even',
    spacing: 30, days: [45, 60], start: 'seed', sow: { spring: [1, 8], fall: [-12, -8] },
    pests: ['squash vine borer', 'squash bugs', 'powdery mildew'], companions: [], avoid: [],
    tip: 'Pick at six to eight inches. A second planting in late July dodges the first wave of borers.' },
  { id: 'cucumber', name: 'cucumber', aliases: ['cucumbers', 'cukes'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 2, waterHow: 'keep evenly moist, dry spells make them bitter',
    spacing: 12, days: [50, 70], start: 'seed', sow: { spring: [1, 8], fall: [-12, -9] },
    pests: ['cucumber beetles', 'powdery mildew'], companions: [], avoid: [],
    tip: 'Trellis them. Pick young and pick often.' },
  { id: 'beans', name: 'green beans', aliases: ['bean', 'beans', 'bush beans', 'pole beans'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'about an inch a week, more when flowering',
    spacing: 4, days: [50, 65], start: 'seed', sow: { spring: [1, 10], fall: [-12, -8] },
    pests: ['bean beetles', 'aphids'], companions: [], avoid: [{ with: 'onion', why: 'onions are said to slow beans, mostly folklore' }],
    tip: 'Sow every three weeks for a steady supply.' },
  { id: 'okra', name: 'okra', aliases: [], kind: 'vegetable',
    sun: 'full sun', waterEvery: 5, waterHow: 'deep and infrequent, it handles heat well',
    spacing: 15, days: [50, 65], start: 'seed', sow: { spring: [4, 12], fall: [-14, -10] },
    pests: ['aphids', 'stink bugs'], companions: [], avoid: [],
    tip: 'Pick pods at about three inches or they turn woody fast.' },
  { id: 'lettuce', name: 'lettuce', aliases: ['salad', 'greens', 'mesclun'], kind: 'vegetable',
    sun: 'full sun in spring, afternoon shade when warm', waterEvery: 2, waterHow: 'light and frequent, shallow roots',
    spacing: 8, days: [30, 60], start: 'seed', sow: { spring: [-6, 2], fall: [-10, -2] },
    pests: ['slugs', 'aphids'], companions: [], avoid: [],
    tip: 'It bolts in heat. Grow it in cool months and pick outer leaves.' },
  { id: 'spinach', name: 'spinach', aliases: [], kind: 'vegetable',
    sun: 'full sun to part shade', waterEvery: 2, waterHow: 'keep moist',
    spacing: 4, days: [35, 45], start: 'seed', sow: { spring: [-6, -1], fall: [-8, -2] },
    pests: ['leaf miners', 'slugs'], companions: [], avoid: [],
    tip: 'A cool season crop. Sow in fall for the best leaves.' },
  { id: 'kale', name: 'kale', aliases: ['collards', 'collard greens'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'about an inch a week',
    spacing: 18, days: [50, 65], start: 'transplant', sow: { spring: [-6, 0], fall: [-12, -6] },
    pests: ['cabbage worms', 'aphids'], companions: [], avoid: [],
    tip: 'A light frost makes it sweeter. Pick lower leaves first.' },
  { id: 'broccoli', name: 'broccoli', aliases: [], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'steady moisture',
    spacing: 18, days: [60, 80], start: 'transplant', sow: { spring: [-4, 0], fall: [-12, -8] },
    pests: ['cabbage worms', 'aphids'], companions: [], avoid: [],
    tip: 'Cut the main head before the buds open. Side shoots follow.' },
  { id: 'carrot', name: 'carrot', aliases: ['carrots'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 2, waterHow: 'keep the top inch moist until they sprout',
    spacing: 3, days: [60, 80], start: 'seed', sow: { spring: [-4, 2], fall: [-12, -8] },
    pests: ['carrot rust fly'], companions: [], avoid: [],
    tip: 'Loose soil makes straight roots. Thin early.' },
  { id: 'radish', name: 'radish', aliases: ['radishes'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 2, waterHow: 'keep moist so they stay mild',
    spacing: 2, days: [25, 30], start: 'seed', sow: { spring: [-6, 2], fall: [-8, -2] },
    pests: ['flea beetles'], companions: [], avoid: [],
    tip: 'Fastest win in the garden. Great for kids.' },
  { id: 'onion', name: 'onion', aliases: ['onions', 'garlic', 'shallots'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 4, waterHow: 'about an inch a week, stop when tops fall over',
    spacing: 4, days: [90, 120], start: 'transplant', sow: { spring: [-6, -2], fall: [-8, -4] },
    pests: ['thrips'], companions: [], avoid: [],
    tip: 'In the south plant short day onions in late fall or winter.' },
  { id: 'potato', name: 'potato', aliases: ['potatoes', 'sweet potato'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 4, waterHow: 'even moisture once tubers form',
    spacing: 12, days: [70, 110], start: 'seed', sow: { spring: [-3, 1], fall: [-14, -10] },
    pests: ['potato beetles'], companions: [], avoid: [],
    tip: 'Hill soil up around the stems as they grow.' },
  { id: 'corn', name: 'sweet corn', aliases: ['corn'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'deep, critical when tassels show',
    spacing: 10, days: [70, 90], start: 'seed', sow: { spring: [1, 6], fall: [] },
    pests: ['corn earworm'], companions: [], avoid: [],
    tip: 'Plant in blocks, not one long row, so it pollinates.' },
  { id: 'watermelon', name: 'watermelon', aliases: ['melon', 'cantaloupe', 'melons'], kind: 'vegetable',
    sun: 'full sun', waterEvery: 3, waterHow: 'deep, then ease off as fruit ripens for sweetness',
    spacing: 36, days: [75, 95], start: 'seed', sow: { spring: [2, 8], fall: [] },
    pests: ['aphids', 'cucumber beetles'], companions: [], avoid: [],
    tip: 'Ripe when the spot on the ground turns creamy yellow and the curl by the stem dries.' },
  { id: 'strawberry', name: 'strawberry', aliases: ['strawberries'], kind: 'fruit',
    sun: 'full sun', waterEvery: 2, waterHow: 'about an inch a week, keep berries off wet soil',
    spacing: 12, days: [90, 120], start: 'transplant', sow: { spring: [-4, 0], fall: [-8, -4] },
    pests: ['slugs', 'birds'], companions: [], avoid: [],
    tip: 'Straw mulch keeps the fruit clean.' },
  { id: 'basil', name: 'basil', aliases: [], kind: 'herb',
    sun: 'full sun', waterEvery: 2, waterHow: 'keep moist, not soggy',
    spacing: 12, days: [30, 60], start: 'transplant', sow: { spring: [2, 10], fall: [] },
    pests: ['aphids', 'downy mildew'],
    companions: [{ with: 'tomato', grade: 'folklore', why: 'popular pairing, the pest benefit has almost no trials behind it' }], avoid: [],
    tip: 'Pinch off flowers and it keeps making leaves.' },
  { id: 'rosemary', name: 'rosemary', aliases: [], kind: 'herb',
    sun: 'full sun', waterEvery: 10, waterHow: 'let it dry out between waterings',
    spacing: 30, days: [80, 90], start: 'transplant', sow: { spring: [0, 8], fall: [-10, -6] },
    pests: ['spider mites', 'root rot'], companions: [], avoid: [],
    tip: 'Too much water kills it faster than drought.' },
  { id: 'thyme', name: 'thyme', aliases: ['oregano', 'sage'], kind: 'herb',
    sun: 'full sun', waterEvery: 8, waterHow: 'light, let it dry between',
    spacing: 12, days: [70, 90], start: 'transplant', sow: { spring: [0, 8], fall: [-10, -6] },
    pests: ['spider mites'], companions: [], avoid: [],
    tip: 'Trim after it flowers so it does not get woody.' },
  { id: 'mint', name: 'mint', aliases: [], kind: 'herb',
    sun: 'sun to part shade', waterEvery: 2, waterHow: 'keep moist',
    spacing: 18, days: [60, 90], start: 'transplant', sow: { spring: [0, 10], fall: [-10, -6] },
    pests: ['aphids'], companions: [], avoid: [],
    tip: 'Grow it in a pot. In a bed it takes over.' },
  { id: 'cilantro', name: 'cilantro', aliases: ['coriander', 'parsley', 'dill'], kind: 'herb',
    sun: 'sun, afternoon shade when warm', waterEvery: 2, waterHow: 'keep moist',
    spacing: 6, days: [45, 70], start: 'seed', sow: { spring: [-4, 2], fall: [-10, -4] },
    pests: ['aphids'], companions: [], avoid: [],
    tip: 'It bolts in heat. Sow every few weeks in cool months.' },
  { id: 'fennel', name: 'fennel', aliases: [], kind: 'herb',
    sun: 'full sun', waterEvery: 4, waterHow: 'about an inch a week',
    spacing: 12, days: [65, 90], start: 'seed', sow: { spring: [-2, 4], fall: [-12, -8] },
    pests: ['aphids'], companions: [],
    avoid: [{ with: 'most vegetables', why: 'it can stunt neighbors from three to ten feet out, so plan for ten' }],
    tip: 'Give it its own corner, at least ten feet from your vegetables.' },
  { id: 'marigold', name: 'marigold', aliases: ['marigolds'], kind: 'flower',
    sun: 'full sun', waterEvery: 4, waterHow: 'moderate, at the base',
    spacing: 10, days: [50, 60], start: 'transplant', sow: { spring: [0, 10], fall: [-10, -6] },
    pests: ['spider mites'],
    companions: [{ with: 'tomato', grade: 'plausible', why: 'nematode control needs dense planting, a few scattered plants do little' }], avoid: [],
    tip: 'Deadhead old blooms to keep it flowering.' },
  { id: 'sunflower', name: 'sunflower', aliases: ['sunflowers'], kind: 'flower',
    sun: 'full sun', waterEvery: 4, waterHow: 'deep, less often',
    spacing: 18, days: [70, 100], start: 'seed', sow: { spring: [1, 10], fall: [] },
    pests: ['birds'], companions: [], avoid: [],
    tip: 'Pollinators love them. Stake the tall ones.' },
  { id: 'zinnia', name: 'zinnia', aliases: ['zinnias', 'cosmos'], kind: 'flower',
    sun: 'full sun', waterEvery: 4, waterHow: 'at the base to avoid mildew',
    spacing: 12, days: [60, 75], start: 'seed', sow: { spring: [1, 10], fall: [] },
    pests: ['powdery mildew'], companions: [], avoid: [],
    tip: 'Cut flowers often and you get more.' },
  { id: 'lavender', name: 'lavender', aliases: [], kind: 'flower',
    sun: 'full sun', waterEvery: 10, waterHow: 'deep but rare, drainage is everything',
    spacing: 24, days: [90, 200], start: 'transplant', sow: { spring: [0, 6], fall: [-10, -6] },
    pests: ['root rot'], companions: [], avoid: [],
    tip: 'In hot humid places, Spanish or French lavender holds up better than English.' },
];

const INDEX = new Map();
for (const p of PLANTS) {
  INDEX.set(p.id, p);
  INDEX.set(p.name, p);
  for (const a of p.aliases) INDEX.set(a, p);
}

export function findPlant(text) {
  if (!text) return null;
  const t = text.toLowerCase().trim();
  if (INDEX.has(t)) return INDEX.get(t);
  // Longest key that appears as a whole word wins, so "bell pepper" beats "pepper".
  let best = null;
  for (const [k, p] of INDEX) {
    if (new RegExp(`\\b${k}\\b`).test(t) && (!best || k.length > best[0].length)) best = [k, p];
  }
  return best ? best[1] : null;
}

export function getPlant(id) { return INDEX.get(id) || null; }
