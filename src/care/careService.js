import { dbSelect, dbUpsert } from '../auth/supabaseClient.js';
import { visionRequest, textBlock } from '../vision/client.js';
import { getSession } from '../auth/authManager.js';

const _cache = new Map();

function _key(plant) {
  return (plant.species_canonical || plant.species || plant.display_label || '').toLowerCase().trim();
}

async function _careRequest(name, category) {
  const prompt = `Return JSON care info for "${name}"${category ? ' (' + category + ')' : ''}. ` +
    'Fields: sun (string), water (string), soil (string), spacing (string), ' +
    'harvest (string or null), fertilizer (string), pests (string[]), tips (string[]). ' +
    'Tips should be practical for home gardeners. JSON only, no markdown.';
  return visionRequest([{ role: 'user', content: [textBlock(prompt)] }]);
}

export async function getCare(plant) {
  const key = _key(plant);
  if (!key) return null;

  if (_cache.has(key)) return _cache.get(key);

  try {
    const rows = await dbSelect('plant_care', { filters: { 'species_canonical': 'eq.' + key } });
    if (rows && rows.length > 0) {
      _cache.set(key, rows[0].data);
      return rows[0].data;
    }
  } catch (_) {}

  const session = getSession();
  if (!session) return null;

  try {
    const name = plant.display_label || plant.species || key;
    const data = await _careRequest(name, plant.category);
    _cache.set(key, data);
    dbUpsert('plant_care', {
      species_canonical: key,
      display_name: name,
      category: plant.category || null,
      data,
      created_at: Date.now(),
    }).catch(() => {});
    return data;
  } catch (_) {
    return null;
  }
}
