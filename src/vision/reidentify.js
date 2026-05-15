import { visionRequest, imageBlock, textBlock } from './client.js';
import { regionPhrase } from './regionPrompt.js';

// Batched re-ID for rejected plants. One API call, multiple cropped close-ups.
// Returns: { crops: [{ index, candidates: [{ name, category, confidence }] }] }
export async function reIdentifyBatch(crops, rejectedItems, zoneType, confirmedPlants) {
  const userContent = [];
  crops.forEach((cropDataUrl, i) => {
    userContent.push(imageBlock(cropDataUrl));
    userContent.push(textBlock(`[Crop ${i + 1}] previously labeled as: ${rejectedItems[i].name}`));
  });

  const confirmedNote = confirmedPlants.length
    ? `Already-confirmed plants in this zone: ${[...new Set(confirmedPlants.map(p => p.species || p.display_label || p.name))].join(', ')}.`
    : '';
  const rejectedNames = [...new Set(rejectedItems.map(r => r.name))];
  const rejNote = `The user rejected these previous labels: ${rejectedNames.join(', ')}. For each crop, your new candidates MUST exclude the corresponding rejected label, and avoid all the user's rejected labels overall unless visually unmistakable.`;
  const region = regionPhrase();
  const regionPart = region ? ' ' + region : '';

  userContent.push(textBlock(`These are ${crops.length} cropped close-ups from a top-down photo of a ${zoneType.replace('_',' ')} backyard garden${regionPart}. The user rejected the previous identifications. Re-identify the plant in the center of each crop.

${confirmedNote}
${rejNote}

For each crop, return up to 3 alternative candidate names ranked by confidence. Return ONLY valid JSON, no preamble or markdown:
{"crops":[{"index":1,"candidates":[{"name":"...","category":"fruiting"|"herb"|"flowering"|"unknown","confidence":0-1}]}, ...]}`));

  return visionRequest([{ role: 'user', content: userContent }]);
}
