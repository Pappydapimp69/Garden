import { visionRequest, imageBlock, textBlock } from './client.js';
import { regionPhrase } from './regionPrompt.js';
import { repo } from '../data/repo.js';

// On-demand care advice for a single plant. Sends the zone's most recent
// reference photo (if any) plus a short summary of the plant's journal
// history so the model can spot problems instead of giving generic tips.
//
// Caller is responsible for caching (see src/care/careCache.js) — this
// function always makes a network call.

const RECENT_JOURNAL_LIMIT = 5;

export async function fetchCareAdvice(plantId) {
  const plant = repo.plants.get(plantId);
  if (!plant) throw new Error('Plant not found.');
  const zone = repo.zones.get(plant.zone_id);
  const journal = repo.journal.listByZone(plant.zone_id) || [];

  const recent = journal
    .slice()
    .sort((a, b) => (b.entry_date || 0) - (a.entry_date || 0))
    .slice(0, RECENT_JOURNAL_LIMIT)
    .map(j => {
      const date = j.entry_date ? new Date(j.entry_date).toISOString().slice(0, 10) : 'unknown date';
      const note = j.overall_health_note ? ` — ${j.overall_health_note}` : '';
      return `  - ${date}: ${j.plant_count || 0} plants tagged${note}`;
    })
    .join('\n');

  const region = regionPhrase();
  const regionPart = region ? ' ' + region : '';

  const species = plant.species || plant.display_label || 'unknown plant';
  const cat = plant.category || 'unknown';
  const notes = (plant.notes || '').trim();
  const notesLine = notes ? `User notes about this plant: ${notes}` : '';
  const historyLine = recent
    ? `Recent journal entries for the zone this plant is in (newest first):\n${recent}`
    : 'No journal history for this plant yet.';

  const content = [];
  const refImage = zone?.reference_image_path;
  if (refImage) content.push(imageBlock(refImage));

  content.push(textBlock(`You are a gardening assistant giving care advice for a specific plant${regionPart}.

Plant species: ${species}
Category: ${cat}
${notesLine}

${historyLine}

${refImage ? 'A photo of the zone is attached. Use it to spot visible problems (yellowing, pests, spacing, container condition, etc.) when listing concerns.' : 'No photo of the zone is available.'}

Return ONLY valid JSON, no preamble or markdown, with this shape:
{
  "sun": "...",
  "water": "...",
  "soil": "...",
  "spacing": "...",
  "fertilizer": "...",
  "harvest": "...",
  "pests": ["..."],
  "tips": ["..."],
  "concerns": ["..."]
}

- Keep each text field under 200 characters.
- "tips" are general best practices tailored to the species and region.
- "concerns" are issues spotted in the photo OR implied by the journal trend; empty array if nothing notable.
- Omit fields that don't apply (e.g. "harvest" for a non-edible flowering plant).`));

  return visionRequest([{ role: 'user', content }]);
}
