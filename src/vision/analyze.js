import { visionRequest, imageBlock, textBlock } from './client.js';

// Full-photo analysis. Returns:
//   { plants: [{ name, category, confidence, x, y, notes }], overall_confidence }
export async function analyzeFullPhoto(dataUrl, zoneType, existingPlants = []) {
  const existingNote = existingPlants.length
    ? `Previously confirmed plants in this zone: ${existingPlants.map(p => p.species || p.display_label || p.name).join(', ')}.`
    : '';

  const prompt = `You are a plant identification assistant analyzing a top-down photo of a ${zoneType.replace('_',' ')} in a backyard garden in Texas (zone 7b/8a). ${existingNote}

Identify each plant visible in the image. For each plant, provide:
- name (common species name)
- category: "fruiting" | "herb" | "flowering" | "unknown"
- confidence: 0-1
- x, y: position in image as percentage (0-100, where 0,0 is top-left)
- notes: brief description (max 50 chars)

Return ONLY valid JSON, no preamble or markdown:
{"plants":[{"name":"...","category":"...","confidence":0.X,"x":NN,"y":NN,"notes":"..."}], "overall_confidence": 0-1}

The "overall_confidence" represents how confident you are in the identification overall, considering image quality, plant visibility, and growth stage clarity.`;

  return visionRequest([{
    role: 'user',
    content: [imageBlock(dataUrl), textBlock(prompt)],
  }]);
}
