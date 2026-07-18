import { STORAGE_KEY, STORAGE_KEY_V1 } from '../config.js';
import { emptyDB, migrateFromV1, newId } from './schema.js';

export function createLocalRepo() {
  let db = load();

  function load() {
    // Prefer v2 if it exists; otherwise migrate from v1; otherwise start fresh.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('Could not load v2 DB', e); }

    try {
      const v1raw = localStorage.getItem(STORAGE_KEY_V1);
      if (v1raw) {
        const migrated = migrateFromV1(JSON.parse(v1raw));
        save(migrated);
        return migrated;
      }
    } catch (e) { console.warn('Could not migrate v1 DB', e); }

    return emptyDB();
  }

  function normalize(loaded) {
    const base = emptyDB();
    return { ...base, ...loaded,
      user: { ...base.user, ...(loaded.user || {}) },
      gardens: loaded.gardens || [],
      zones: loaded.zones || [],
      sub_zones: loaded.sub_zones || [],
      plants: loaded.plants || [],
      journal_entries: loaded.journal_entries || [],
      vision_feedback: loaded.vision_feedback || [],
    };
  }

  function save(next) {
    if (next) db = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
    catch (e) { console.warn('Could not save DB', e); throw e; }
  }

  function ensureDefaultGarden() {
    if (db.gardens.length > 0) return db.gardens[0];
    const g = { id: newId('g'), user_id: null, name: 'My Garden', created_at: Date.now() };
    db.gardens.push(g);
    save();
    return g;
  }

  return {
    raw: () => db,
    save,
    newId,

    user: {
      get: () => db.user,
      update: (patch) => { db.user = { ...db.user, ...patch }; save(); return db.user; },
    },

    gardens: {
      list:    () => db.gardens.slice(),
      get:     (id) => db.gardens.find(g => g.id === id),
      ensureDefault: ensureDefaultGarden,
    },

    zones: {
      list: () => db.zones.slice(),
      listByGarden: (gardenId) => db.zones.filter(z => z.garden_id === gardenId),
      get: (id) => db.zones.find(z => z.id === id),
      create: ({ name, type, reference_image_path = null }) => {
        const garden = ensureDefaultGarden();
        const z = {
          id: newId('z'),
          garden_id: garden.id,
          name, type,
          reference_image_path,
          fingerprint: null,
          created_at: Date.now(),
        };
        db.zones.push(z);
        save();
        return z;
      },
      update: (id, patch) => {
        const z = db.zones.find(zz => zz.id === id);
        if (!z) return null;
        Object.assign(z, patch);
        save();
        return z;
      },
      delete: (id) => {
        db.zones = db.zones.filter(z => z.id !== id);
        db.plants = db.plants.filter(p => p.zone_id !== id);
        db.journal_entries = db.journal_entries.filter(j => j.zone_id !== id);
        save();
      },
    },

    plants: {
      listByZone: (zoneId, { includeDeleted = false } = {}) => {
        const ps = db.plants.filter(p => p.zone_id === zoneId);
        return includeDeleted ? ps : ps.filter(p => !p.deleted);
      },
      get: (id) => db.plants.find(p => p.id === id),
      create: (plant) => {
        const p = {
          id: plant.id || newId('p'),
          zone_id: plant.zone_id,
          sub_zone_id: plant.sub_zone_id || null,
          display_label: plant.display_label || plant.species || 'Unknown',
          species: plant.species || null,
          species_canonical: (plant.species || '').toLowerCase() || null,
          species_locked: !!plant.species_locked,
          category: plant.category || 'unknown',
          container_description: plant.container_description || null,
          secondary_identifiers: plant.secondary_identifiers || null,
          x: plant.x, y: plant.y,
          pending: !!plant.pending,
          confidence: plant.confidence ?? null,
          custom: !!plant.custom,
          notes: plant.notes || '',
          deleted: false,
          created_at: plant.created_at || Date.now(),
        };
        db.plants.push(p);
        save();
        return p;
      },
      update: (id, patch) => {
        const p = db.plants.find(pp => pp.id === id);
        if (!p) return null;
        Object.assign(p, patch);
        if (patch.species !== undefined) p.species_canonical = (patch.species || '').toLowerCase() || null;
        save();
        return p;
      },
      softDelete: (id) => {
        const p = db.plants.find(pp => pp.id === id);
        if (p) { p.deleted = true; save(); }
      },
    },

    journal: {
      listByZone: (zoneId) => db.journal_entries.filter(j => j.zone_id === zoneId),
      append: (entry) => {
        const j = {
          id: entry.id || newId('j'),
          zone_id: entry.zone_id,
          entry_date: entry.entry_date || Date.now(),
          photo_path: entry.photo_path || null,
          vision_data: entry.vision_data || null,
          user_corrections: entry.user_corrections || null,
          overall_health_note: entry.overall_health_note || null,
          plant_count: entry.plant_count || 0,
          contributes_to_global: !!entry.contributes_to_global,
          created_at: Date.now(),
        };
        db.journal_entries.push(j);
        save();
        return j;
      },
    },

    progress: {
      get: () => ({ xp: db.xp, level: db.level }),
      set: ({ xp, level }) => { db.xp = xp; db.level = level; save(); },
    },

    // Local (signed-out) mode has no shared network — record is a no-op and
    // insight always reports "not enough data" so the UI simply stays quiet.
    community: {
      record: () => {},
      insight: () => Promise.resolve({ enough: false, sample: 0, local: true }),
    },
  };
}
