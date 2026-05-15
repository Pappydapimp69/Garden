// Flat-table data shape, designed to map 1:1 onto Supabase tables.
// localRepo serializes/deserializes this object as a single JSON blob;
// supabaseRepo will replace each table with an actual table in Postgres.
//
// Field names match BLUEPRINT.md so migration is a column-rename exercise, not a redesign.
// Fields not yet used by v1 UI are kept nullable so we can add them incrementally.

export function emptyDB() {
  return {
    schema_version: 2,
    user: {
      id: null,
      email: null,
      created_at: null,
      zip_code: null,
      zip_source: 'none',
      region_label: null,
      share_data_globally: true,
      api_key_hint: null,
      trust_score: null,
    },
    gardens: [],          // { id, user_id, name, created_at }
    zones: [],            // { id, garden_id, name, type, reference_image_path, fingerprint, created_at }
    sub_zones: [],        // { id, zone_id, name, bbox }
    plants: [],           // see plant shape below
    journal_entries: [],  // { id, zone_id, entry_date, photo_path, vision_data, ... }
    vision_feedback: [],  // { id, plant_id, journal_entry_id, ai_suggestion, user_score, correction }
    xp: 0,
    level: 1,
  };
}

// Plant shape (kept here as documentation — not enforced):
//   id, zone_id, sub_zone_id, display_label, species, species_canonical, species_locked,
//   category, container_description, secondary_identifiers, x, y, pending, confidence,
//   custom, notes, deleted, created_at
//
// v1 mapping (see migrateFromV1 below):
//   v1.name        → species, species_canonical, display_label
//   v1.confirmed   → species_locked: false (kept conservative — user can lock explicitly later)
//   v1.deleted     → deleted (carried over)

export function newId(prefix = 'p') {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// One-time migration from the v1 nested structure to the v2 flat tables.
// v1 shape: { zones: [{ id, name, type, plants: [...], journal: [...], referencePhoto, createdAt }], xp, level }
export function migrateFromV1(v1raw) {
  const db = emptyDB();
  if (!v1raw || typeof v1raw !== 'object') return db;

  db.xp    = v1raw.xp    ?? 0;
  db.level = v1raw.level ?? 1;

  const garden = {
    id: newId('g'),
    user_id: null,
    name: 'My Garden',
    created_at: Date.now(),
  };
  db.gardens.push(garden);

  for (const z of (v1raw.zones || [])) {
    db.zones.push({
      id: z.id,
      garden_id: garden.id,
      name: z.name,
      type: z.type,
      reference_image_path: z.referencePhoto || null,  // base64 data URL today; path on Supabase later
      fingerprint: null,
      created_at: z.createdAt || Date.now(),
    });

    for (const p of (z.plants || [])) {
      db.plants.push({
        id: p.id,
        zone_id: z.id,
        sub_zone_id: null,
        display_label: p.name || 'Unknown',
        species: p.name || null,
        species_canonical: p.name ? p.name.toLowerCase() : null,
        species_locked: false,            // intentional — let user lock explicitly
        category: p.category || 'unknown',
        container_description: null,
        secondary_identifiers: null,
        x: p.x,
        y: p.y,
        pending: !!p.pending,
        confidence: p.confidence ?? null,
        custom: !!p.custom,
        notes: p.notes || '',
        deleted: !!p.deleted,
        created_at: p.createdAt || Date.now(),
      });
    }

    for (const j of (z.journal || [])) {
      db.journal_entries.push({
        id: j.id,
        zone_id: z.id,
        entry_date: j.date,
        photo_path: null,
        vision_data: null,
        user_corrections: null,
        overall_health_note: j.summary || null,
        plant_count: j.plantCount || 0,
        contributes_to_global: false,
        created_at: j.date || Date.now(),
      });
    }
  }

  return db;
}
