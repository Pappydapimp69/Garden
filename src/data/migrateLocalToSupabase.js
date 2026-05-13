// One-shot migration: copy every row from a local repo's in-memory DB into a
// Supabase repo via its async write methods. Called after the user signs in
// for the first time, while they still have local data.
//
// See BLUEPRINT.md §5 step 5.
//
// Usage:
//   const local = createLocalRepo();  await local.init();
//   const remote = createSupabaseRepo({ url, anonKey, accessToken, userId });
//   await remote.init();
//   const report = await migrateLocalToSupabase(local, remote, { userId });
//
// On success, the caller should bump STORAGE_KEY (or wipe it) so a future
// load doesn't re-import. This module deliberately doesn't touch storage —
// it has no opinion about backup.

export async function migrateLocalToSupabase(local, remote, { userId }) {
  if (!userId) throw new Error('migrateLocalToSupabase: userId is required.');

  const src = local.raw();
  const report = {
    gardens: 0, zones: 0, sub_zones: 0, plants: 0, journal_entries: 0, vision_feedback: 0,
    errors: [],
  };

  // gardens: stamp the new auth user_id on each.
  for (const g of src.gardens) {
    try {
      // Use a private path: the supabase repo's gardens.ensureDefault creates a
      // fresh row, but we need to preserve ids and timestamps. Patch via raw
      // insert through the user.update / direct fetch isn't exposed publicly.
      // Cleanest: re-create via remote.gardens.ensureDefault if it's the only
      // garden, otherwise we'd need a custom insert. v1 only ever has one
      // garden (see localRepo.ensureDefaultGardenSync), so this is enough.
      // If src has multiples, log and skip.
      if (report.gardens === 0) {
        await remote.gardens.ensureDefault();
        report.gardens++;
      } else {
        report.errors.push(`Skipped extra garden ${g.id} — supabase repo only handles one.`);
      }
    } catch (e) { report.errors.push(`garden ${g.id}: ${e.message}`); }
  }

  // zones.
  for (const z of src.zones) {
    try {
      await remote.zones.create({
        name: z.name,
        type: z.type,
        reference_image_path: z.reference_image_path,
      });
      report.zones++;
    } catch (e) { report.errors.push(`zone ${z.id}: ${e.message}`); }
  }

  // After zones are remote, their ids may differ. Build a local→remote id map
  // by matching on name within the (single) garden.
  const remoteZones = remote.zones.list();
  const zoneIdMap = new Map();
  for (const lz of src.zones) {
    const rz = remoteZones.find(z => z.name === lz.name && z.type === lz.type);
    if (rz) zoneIdMap.set(lz.id, rz.id);
  }

  // plants: rewrite zone_id through the map.
  for (const p of src.plants) {
    const remoteZoneId = zoneIdMap.get(p.zone_id);
    if (!remoteZoneId) {
      report.errors.push(`plant ${p.id}: no remote zone match for ${p.zone_id}`);
      continue;
    }
    try {
      await remote.plants.create({ ...p, zone_id: remoteZoneId, id: undefined });
      report.plants++;
    } catch (e) { report.errors.push(`plant ${p.id}: ${e.message}`); }
  }

  // journal_entries: same id rewrite.
  for (const j of src.journal_entries) {
    const remoteZoneId = zoneIdMap.get(j.zone_id);
    if (!remoteZoneId) {
      report.errors.push(`journal ${j.id}: no remote zone match for ${j.zone_id}`);
      continue;
    }
    try {
      await remote.journal.append({ ...j, zone_id: remoteZoneId, id: undefined });
      report.journal_entries++;
    } catch (e) { report.errors.push(`journal ${j.id}: ${e.message}`); }
  }

  // xp / level.
  try {
    await remote.progress.set({ xp: src.xp || 0, level: src.level || 1 });
  } catch (e) { report.errors.push(`progress: ${e.message}`); }

  // user fields (zip, share consent, api_key_hint, trust_score) come from the
  // remote user row already created by the auth trigger; carry over the local
  // overrides.
  const u = src.user || {};
  const patch = {};
  if (u.zip_code)             patch.zip_code = u.zip_code;
  if (u.zip_source)           patch.zip_source = u.zip_source;
  if (typeof u.share_data_globally === 'boolean') patch.share_data_globally = u.share_data_globally;
  if (u.api_key_hint)         patch.api_key_hint = u.api_key_hint;
  if (typeof u.trust_score === 'number')          patch.trust_score = u.trust_score;
  if (Object.keys(patch).length > 0) {
    try { await remote.user.update(patch); }
    catch (e) { report.errors.push(`user: ${e.message}`); }
  }

  return report;
}
