// Symptom triage. ZaneGPT rule: keep what you told me (observation) apart
// from my guess (interpretation), and always say what would prove the guess
// wrong. Brain rule: check drainage and soil pH before reading leaf colour,
// or you end up feeding a plant whose real problem is water or pH.

const RULES = [
  { id: 'yellow-old', match: /yellow/i, and: /(old|bottom|lower)/i,
    guess: 'a nitrogen shortage, or plain old age',
    check: 'If the soil is soggy or the pH is way off, feeding will not fix it. Check those first.',
    fix: 'Side dress with compost or a gentle nitrogen feed.' },
  { id: 'yellow-new', match: /yellow/i, and: /(new|top|young)/i,
    guess: 'iron trouble, usually from high pH soil',
    check: 'Test the pH. Above about seven point five, the plant cannot pull iron even if it is there.',
    fix: 'Lower the pH slowly with sulfur or use chelated iron.' },
  { id: 'yellow', match: /yellow/i,
    guess: 'too much water, or a nutrient gap',
    check: 'Push a finger two inches down. If it is wet, it is water. Then look at whether old or new leaves yellowed first.',
    fix: 'Let it dry out a bit before you feed anything.' },
  { id: 'wilt-wet', match: /(wilt|droop)/i, and: /(wet|soggy|muddy)/i,
    guess: 'root rot from too much water',
    check: 'Gently lift the plant. Brown mushy roots confirm it. White firm roots mean it is something else.',
    fix: 'Stop watering, improve drainage, and pull mulch back from the stem.' },
  { id: 'wilt-squash', match: /(wilt|droop|collaps)/i, and: /(squash|zucchini|pumpkin)/i,
    guess: 'squash vine borer',
    check: 'Look near the base for a hole with sawdust like mush. No hole points to plain heat stress.',
    fix: 'Slit the stem, pull the larva, and bury the cut in soil.' },
  { id: 'wilt-afternoon', match: /(wilt|droop)/i, and: /(afternoon|midday|heat|hot)/i,
    guess: 'normal heat wilt',
    check: 'If it perks back up by evening, it is fine. If it is still limp at dawn, it is thirsty or sick.',
    fix: 'Water deep in the morning and add mulch.' },
  { id: 'wilt', match: /(wilt|droop)/i,
    guess: 'thirst',
    check: 'Feel the soil two inches down. Dry means water it. Wet means the problem is roots.',
    fix: 'Water deeply at the base.' },
  { id: 'blossom-end', match: /(black|brown|rot)/i, and: /(bottom|end)/i,
    guess: 'blossom end rot, from uneven watering',
    check: 'If watering has been steady for weeks, ask whether the soil is short on calcium.',
    fix: 'Water evenly and mulch. Pick the damaged fruit.' },
  { id: 'white-powder', match: /(white|powder|dusty)/i,
    guess: 'powdery mildew',
    check: 'It wipes off with a finger. If it does not wipe off, it is something else.',
    fix: 'Cut the worst leaves, water at the base, and give it air flow.' },
  { id: 'holes', match: /(holes?|chewed|eaten)/i,
    guess: 'caterpillars, beetles, or slugs',
    check: 'Look under leaves in the evening. Slime trails mean slugs. Green droppings mean caterpillars.',
    fix: 'Hand pick, and use row cover on young plants.' },
  { id: 'sticky', match: /(sticky|tiny bugs|aphid|ants)/i,
    guess: 'aphids',
    check: 'Look under new leaves for little clusters.',
    fix: 'Blast them off with water. Ladybugs will follow.' },
  { id: 'webbing', match: /(web|speck|stippl)/i,
    guess: 'spider mites, common in hot dry weather',
    check: 'Tap a leaf over white paper. Moving dots confirm it.',
    fix: 'Spray the undersides with water and raise humidity.' },
  { id: 'no-fruit', match: /(no fruit|not fruiting|flowers fall|blossoms? drop|no tomatoes|no peppers)/i,
    guess: 'heat, or not enough pollination',
    check: 'Days above about ninety five or nights above seventy five stop fruit set. If it is cooler than that, think pollinators.',
    fix: 'Wait for cooler nights, add shade cloth, or gently shake the flowers.' },
  { id: 'leggy', match: /(leggy|stretch|spindly|tall and thin)/i,
    guess: 'not enough light',
    check: 'Count the hours of direct sun. Under six for a fruiting plant is the likely cause.',
    fix: 'Move it to more sun, or bring grow lights closer.' },
];

export function diagnose(text) {
  const hits = RULES.filter((r) => r.match.test(text) && (!r.and || r.and.test(text)));
  if (!hits.length) return null;
  const r = hits[0];
  return {
    id: r.id,
    observed: text.trim(),
    guess: r.guess,
    check: r.check,
    fix: r.fix,
    also: hits.slice(1, 2).map((h) => h.guess),
    say: `My best guess is ${r.guess}. ${r.check} ${r.fix}` +
         (hits[1] ? ` It could also be ${hits[1].guess}.` : ''),
  };
}
