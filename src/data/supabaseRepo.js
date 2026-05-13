import { emptyDB, newId } from './schema.js';

// Supabase repo. Implements the same interface as createLocalRepo by talking
// to the Supabase REST API (PostgREST) over fetch — no supabase-js dependency,
// to keep build.mjs zero-dep.
//
// Reads serve from an in-memory cache hydrated by init(); writes hit the
// network and mutate the cache on success. UI code is identical between
// local and remote: writes are awaited, reads are synchronous.
//
// Assumes:
//   1. Tables exist per supabase/migrations/0001_initial_schema.sql.
//   2. RLS allows the authenticated user to read/write their own rows.
//   3. accessToken is a Supabase auth JWT for an authenticated user.
//      With anon-only, every request is unauthenticated and RLS will reject
//      anything that requires auth.
//
// See BLUEPRINT.md §5 (migration plan) and §6 (storage strategy).

export function createSupabaseRepo({ url, anonKey, accessToken = null, userId = null } = {}) {
  if (!url || !anonKey) {
    throw new Error('createSupabaseRepo: { url, anonKey } are required.');
  }

  const REST = url.replace(/\/+$/, '') + '/rest/v1';
  let db = emptyDB();
  let initialized = false;
  let currentUserId = userId;

  function headers(extra = {}) {
    const h = {
      apikey: anonKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extra,
    };
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
    return h;
  }

  async function req(path, init = {}) {
    const resp = await fetch(REST + path, { ...init, headers: headers(init.headers) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Supabase ${init.method || 'GET'} ${path} → ${resp.status}: ${body.slice(0, 200)}`);
    }
    // 204 No Content for DELETE / unrepresented writes.
    if (resp.status === 204) return null;
    return resp.json();
  }

  function select(table, query = '') {
    return req(`/${table}?${query || 'select=*'}`);
  }
  function insert(table, row) {
    return req(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    }).then(rows => rows?.[0] ?? null);
  }
  function patch(table, idEq, body) {
    return req(`/${table}?id=eq.${encodeURIComponent(idEq)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    }).then(rows => rows?.[0] ?? null);
  }
  function del(table, idEq) {
    return req(`/${table}?id=eq.${encodeURIComponent(idEq)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  }

  return {
    async init() {
      if (initialized) return;
      // Pull every row the user can see. RLS scopes this to their own data.
      // Order matters only for predictable display; the cache is a Map-keyed lookup.
      const [user, gardens, zones, sub_zones, plants, journal_entries, vision_feedback] = await Promise.all([
        select('users',           'select=*&limit=1').then(rows => rows?.[0] ?? null),
        select('gardens',         'select=*'),
        select('zones',           'select=*'),
        select('sub_zones',       'select=*'),
        select('plants',          'select=*'),
        select('journal_entries', 'select=*'),
        select('vision_feedback', 'select=*'),
      ]);

      const base = emptyDB();
      db = {
        ...base,
        user: user ? { ...base.user, ...user } : base.user,
        gardens, zones, sub_zones, plants, journal_entries, vision_feedback,
        xp: user?.xp ?? 0,
        level: user?.level ?? 1,
      };
      if (user?.id) currentUserId = user.id;
      initialized = true;
    },

    raw: () => db,
    newId,

    user: {
      get: () => db.user,
      update: async (patchBody) => {
        if (!currentUserId) throw new Error('user.update requires an authenticated user.');
        const row = await patch('users', currentUserId, patchBody);
        db.user = { ...db.user, ...row };
        return db.user;
      },
    },

    gardens: {
      list:         () => db.gardens.slice(),
      get:          (id) => db.gardens.find(g => g.id === id),
      ensureDefault: async () => {
        if (db.gardens.length > 0) return db.gardens[0];
        const g = await insert('gardens', {
          id: newId('g'), user_id: currentUserId, name: 'My Garden', created_at: Date.now(),
        });
        db.gardens.push(g);
        return g;
      },
    },

    zones: {
      list:         () => db.zones.slice(),
      listByGarden: (gardenId) => db.zones.filter(z => z.garden_id === gardenId),
      get:          (id) => db.zones.find(z => z.id === id),
      create: async ({ name, type, reference_image_path = null }) => {
        if (db.gardens.length === 0) {
          await insert('gardens', { id: newId('g'), user_id: currentUserId, name: 'My Garden', created_at: Date.now() })
            .then(g => db.gardens.push(g));
        }
        const garden = db.gardens[0];
        const row = await insert('zones', {
          id: newId('z'),
          garden_id: garden.id,
          name, type,
          reference_image_path,
          fingerprint: null,
          created_at: Date.now(),
        });
        db.zones.push(row);
        return row;
      },
      update: async (id, body) => {
        const row = await patch('zones', id, body);
        const i = db.zones.findIndex(z => z.id === id);
        if (i >= 0) db.zones[i] = { ...db.zones[i], ...row };
        return row;
      },
      delete: async (id) => {
        // Postgres ON DELETE CASCADE handles plants + journal_entries server-side.
        await del('zones', id);
        db.zones = db.zones.filter(z => z.id !== id);
        db.plants = db.plants.filter(p => p.zone_id !== id);
        db.journal_entries = db.journal_entries.filter(j => j.zone_id !== id);
      },
    },

    plants: {
      listByZone: (zoneId, { includeDeleted = false } = {}) => {
        const ps = db.plants.filter(p => p.zone_id === zoneId);
        return includeDeleted ? ps : ps.filter(p => !p.deleted);
      },
      get: (id) => db.plants.find(p => p.id === id),
      create: async (plant) => {
        const row = await insert('plants', {
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
        });
        db.plants.push(row);
        return row;
      },
      update: async (id, body) => {
        if (body.species !== undefined) {
          body.species_canonical = (body.species || '').toLowerCase() || null;
        }
        const row = await patch('plants', id, body);
        const i = db.plants.findIndex(p => p.id === id);
        if (i >= 0) db.plants[i] = { ...db.plants[i], ...row };
        return row;
      },
      softDelete: async (id) => {
        const row = await patch('plants', id, { deleted: true });
        const i = db.plants.findIndex(p => p.id === id);
        if (i >= 0) db.plants[i] = { ...db.plants[i], ...row };
      },
    },

    journal: {
      listByZone: (zoneId) => db.journal_entries.filter(j => j.zone_id === zoneId),
      append: async (entry) => {
        const row = await insert('journal_entries', {
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
        });
        db.journal_entries.push(row);
        return row;
      },
    },

    progress: {
      get: () => ({ xp: db.xp, level: db.level }),
      set: async ({ xp, level }) => {
        if (!currentUserId) throw new Error('progress.set requires an authenticated user.');
        await patch('users', currentUserId, { xp, level });
        db.xp = xp; db.level = level;
      },
    },
  };
}
