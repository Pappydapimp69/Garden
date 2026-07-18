import { dbSelect, dbInsert, dbUpsert, dbUpdate, dbDelete, dbRpc } from '../auth/supabaseClient.js';
import { emptyDB, newId } from './schema.js';

// Write-through in-memory repo backed by Supabase.
// Reads are synchronous (from in-memory cache seeded on login).
// Writes update the cache immediately and push to Supabase fire-and-forget.
export async function createSupabaseRepo(session) {
  const uid = session.user_id;
  const db  = emptyDB();

  // ── Seed from Supabase ──────────────────────────────────────────────────
  async function seed() {
    const [profiles, gardens] = await Promise.all([
      dbSelect('user_profiles', { filters: { 'id': 'eq.' + uid } }),
      dbSelect('gardens', { filters: { 'user_id': 'eq.' + uid }, order: 'created_at.asc' }),
    ]);

    const profile = profiles[0] || null;
    if (profile) {
      db.user  = { ...db.user, ...profile };
      db.xp    = profile.xp    ?? 0;
      db.level = profile.level ?? 1;
    } else {
      const np = { id: uid, email: session.email || null, xp: 0, level: 1, share_data_globally: true, created_at: Date.now() };
      db.user  = { ...db.user, ...np };
      dbInsert('user_profiles', np).catch(e => console.warn('init user_profiles:', e));
    }
    db.user.id = uid;
    db.gardens = gardens || [];

    if (db.gardens.length === 0) {
      const g = { id: newId('g'), user_id: uid, name: 'My Garden', created_at: Date.now() };
      db.gardens.push(g);
      dbInsert('gardens', g).catch(e => console.warn('init garden:', e));
    }

    const gardenIds = db.gardens.map(g => g.id);
    const inG = 'in.(' + gardenIds.join(',') + ')';
    const zones = await dbSelect('zones', { filters: { 'garden_id': inG }, order: 'created_at.asc' });
    db.zones = zones || [];

    if (db.zones.length === 0) {
      db.plants = [];
      db.journal_entries = [];
      return;
    }

    const zoneIds = db.zones.map(z => z.id);
    const inZ = 'in.(' + zoneIds.join(',') + ')';
    const [plants, journal] = await Promise.all([
      dbSelect('plants', { filters: { 'zone_id': inZ }, order: 'created_at.asc' }),
      dbSelect('journal_entries', { filters: { 'zone_id': inZ }, order: 'created_at.asc' }),
    ]);
    db.plants          = plants  || [];
    db.journal_entries = journal || [];
  }

  await seed();

  // ── Helpers ─────────────────────────────────────────────────────────────
  function push(fn) { fn().catch(e => console.warn('Supabase sync error:', e)); }

  function ensureDefaultGarden() {
    if (db.gardens.length > 0) return db.gardens[0];
    const g = { id: newId('g'), user_id: uid, name: 'My Garden', created_at: Date.now() };
    db.gardens.push(g);
    push(() => dbInsert('gardens', g));
    return g;
  }

  // ── Repo interface (mirrors localRepo) ───────────────────────────────────
  return {
    raw:   () => db,
    save:  () => {},
    newId,

    user: {
      get: () => db.user,
      update: (patch) => {
        db.user = { ...db.user, ...patch };
        push(() => dbUpsert('user_profiles', { ...db.user, id: uid }));
        return db.user;
      },
    },

    gardens: {
      list:         () => db.gardens.slice(),
      get:          (id) => db.gardens.find(g => g.id === id),
      ensureDefault: ensureDefaultGarden,
    },

    zones: {
      list:        () => db.zones.slice(),
      listByGarden: (gardenId) => db.zones.filter(z => z.garden_id === gardenId),
      get:         (id) => db.zones.find(z => z.id === id),
      create: ({ name, type, reference_image_path = null }) => {
        const garden = ensureDefaultGarden();
        const z = { id: newId('z'), garden_id: garden.id, name, type, reference_image_path, fingerprint: null, created_at: Date.now() };
        db.zones.push(z);
        push(() => dbInsert('zones', z));
        return z;
      },
      update: (id, patch) => {
        const z = db.zones.find(zz => zz.id === id);
        if (!z) return null;
        Object.assign(z, patch);
        push(() => dbUpdate('zones', { 'id': 'eq.' + id }, patch));
        return z;
      },
      delete: (id) => {
        db.zones          = db.zones.filter(z => z.id !== id);
        db.plants         = db.plants.filter(p => p.zone_id !== id);
        db.journal_entries = db.journal_entries.filter(j => j.zone_id !== id);
        push(() => dbDelete('zones', { 'id': 'eq.' + id }));
      },
    },

    plants: {
      listByZone: (zoneId, opts) => {
        const incDel = (opts || {}).includeDeleted;
        const ps = db.plants.filter(p => p.zone_id === zoneId);
        return incDel ? ps : ps.filter(p => !p.deleted);
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
        push(() => dbInsert('plants', p));
        return p;
      },
      update: (id, patch) => {
        const p = db.plants.find(pp => pp.id === id);
        if (!p) return null;
        Object.assign(p, patch);
        if (patch.species !== undefined) p.species_canonical = (patch.species || '').toLowerCase() || null;
        const dbPatch = { ...patch, species_canonical: p.species_canonical };
        push(() => dbUpdate('plants', { 'id': 'eq.' + id }, dbPatch));
        return p;
      },
      softDelete: (id) => {
        const p = db.plants.find(pp => pp.id === id);
        if (p) {
          p.deleted = true;
          push(() => dbUpdate('plants', { 'id': 'eq.' + id }, { deleted: true }));
        }
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
        push(() => dbInsert('journal_entries', j));
        return j;
      },
    },

    progress: {
      get: () => ({ xp: db.xp, level: db.level }),
      set: ({ xp, level }) => {
        db.xp    = xp;
        db.level = level;
        db.user.xp    = xp;
        db.user.level = level;
        push(() => dbUpdate('user_profiles', { 'id': 'eq.' + uid }, { xp, level }));
      },
    },

    // Crowdsourced plant-network. record() contributes one anonymized
    // observation (the RPC sources the zip + opt-in server-side, so opted-out
    // users contribute nothing). insight() returns an honestly-framed aggregate
    // for the caller's own area, or { enough:false } below the publish threshold.
    community: {
      record: (species, category, confidence) => {
        if (!species) return;
        push(() => dbRpc('record_species_observation', {
          p_species: species, p_category: category || null,
          p_confidence: confidence ?? null,
        }));
      },
      insight: (species) => species
        ? dbRpc('species_insight', { p_species: species })
            .catch(() => ({ enough: false, sample: 0 }))
        : Promise.resolve({ enough: false, sample: 0 }),
    },
  };
}
