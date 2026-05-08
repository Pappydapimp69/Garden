// Stub. When you're ready to migrate from localStorage to Supabase, implement
// the same interface as createLocalRepo and switch the export in repo.js.
//
// Each method here will become an async call to a supabase-js client.
// Plan to make UI call sites async at that time (the few entry points are
// showOverview, showZone, the photo-upload flow, and dialog confirms).

export function createSupabaseRepo(/* { url, anonKey } */) {
  throw new Error('supabaseRepo: not implemented yet — see BLUEPRINT.md migration plan.');
}
