// Garden calculators. Numbers come from Brain canon; each result says how
// sure it is, because two of these rules are open red tensions in Brain
// (rain garden divisor across soils and storms, mulch depth across rain
// regimes). Results return { say, facts, caveat } so the UI can show facts
// and the voice can read `say`.

const GAL_PER_SQFT_INCH = 0.623;

// Rain barrel. Brain: first flush is a fixed depth per storm, not a percent
// haircut, and capture is capped by how much you use between storms.
export function rainBarrel({ roofSqft, rainInches, storms = 1, flushInches = 0.08, barrelGal = 55 }) {
  const perStorm = Math.max(0, rainInches / storms - flushInches);
  const runoff = roofSqft * perStorm * storms * GAL_PER_SQFT_INCH;
  const oneStorm = roofSqft * perStorm * GAL_PER_SQFT_INCH;
  const barrels = Math.ceil(oneStorm / barrelGal);
  return {
    gallons: Math.round(runoff),
    oneStorm: Math.round(oneStorm),
    barrels,
    say: `That roof sheds about ${Math.round(runoff)} gallons. One storm fills about ${barrels} barrel${barrels === 1 ? '' : 's'}. ` +
         `A barrel only catches more if you empty it between storms.`,
    caveat: 'Assumes a small first flush is dumped each storm. Real catch depends on how fast you use the water.',
  };
}

// Rain garden. Roof area over six to eight is a one inch storm rule.
export function rainGarden({ roofSqft, soil = 'loam' }) {
  const div = soil === 'sand' ? 8 : soil === 'clay' ? 6 : 7;
  const sqft = Math.round(roofSqft / div);
  const clay = soil === 'clay';
  return {
    sqft,
    say: `Make it about ${sqft} square feet.` + (clay ? ' On clay, make sure it drains within two days, or keep it shallow, about three inches.' : ''),
    caveat: 'Rule of thumb for a one inch storm. Bigger storms will overflow it, so give the overflow somewhere to go. This rule is still being tested across soils.',
  };
}

// Mulch. Two to four inches, kept clear of stems. Volume in cubic yards.
export function mulch({ sqft, depthIn = 3, material = 'wood chips' }) {
  const d = Math.min(4, Math.max(2, depthIn));
  const cuYd = (sqft * (d / 12)) / 27;
  const yearlyLoss = material === 'leaves' ? 3 : 1.5;
  const months = Math.max(1, Math.round(((d - 2) / yearlyLoss) * 12));
  return {
    cubicYards: +cuYd.toFixed(2),
    bags: Math.ceil((sqft * (d / 12)) / 2),
    say: `You need about ${cuYd.toFixed(1)} cubic yards, or ${Math.ceil((sqft * (d / 12)) / 2)} two cubic foot bags. ` +
         `Keep it a hand width away from stems. Top it up in about ${months} months.`,
    caveat: 'Two to four inches is the usual rule. Whether it holds in very rainy places is still an open question.',
  };
}

// Drip. Half inch tube, one gallon per hour emitters at twelve inches.
// Brain: keep runs near three hundred feet, zone by water need.
export function drip({ lengthFt, spacingIn = 12, gph = 1, supplyGpm = 4 }) {
  const emitters = Math.floor((lengthFt * 12) / spacingIn);
  const gpm = (emitters * gph) / 60;
  const tooLong = lengthFt > 300;
  const overSupply = gpm > supplyGpm;
  const zones = Math.max(1, Math.ceil(gpm / supplyGpm), tooLong ? Math.ceil(lengthFt / 300) : 1);
  let say = `That is ${emitters} emitters using about ${gpm.toFixed(1)} gallons a minute.`;
  if (zones > 1) say += ` Split it into ${zones} zones.`;
  else say += ' One zone is fine.';
  if (tooLong) say += ' Runs past three hundred feet water the far end weakly.';
  return { emitters, gpm: +gpm.toFixed(2), zones, tooLong, overSupply, say,
    caveat: 'Group plants that drink alike on the same zone. A rain barrel on a stand gives under one psi, too weak for most drip without a pump.' };
}

// Compost. Browns to greens by volume, roughly three to one.
export function compost({ greens = 0, browns = 0 }) {
  const ratio = greens ? browns / greens : Infinity;
  let say;
  if (!greens && !browns) say = 'Tell me how many buckets of greens and browns you have.';
  else if (ratio < 2) say = `Add about ${Math.ceil(greens * 3 - browns)} more buckets of browns, like dry leaves or cardboard. It will smell otherwise.`;
  else if (ratio > 4) say = 'Plenty of browns. Add greens, like kitchen scraps or grass, to heat it up.';
  else say = 'Nice mix. Keep it damp like a wrung out sponge and turn it every week or two.';
  return { ratio: isFinite(ratio) ? +ratio.toFixed(1) : null, say,
    caveat: 'Weedy or diseased stuff only goes in a hot pile that you turn. A cold pile keeps the seeds alive.' };
}

// Plants per bed from spacing.
export function bedFit({ lengthFt, widthFt, spacingIn }) {
  const per = Math.max(1, Math.floor((lengthFt * 12) / spacingIn)) * Math.max(1, Math.floor((widthFt * 12) / spacingIn));
  return { count: per, say: `About ${per} plants fit in that bed.` };
}
