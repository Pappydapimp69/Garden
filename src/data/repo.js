// Repo factory. UI code imports `repo` from here and never talks to storage directly.
//
// Starts as localRepo (synchronous, localStorage-backed).
// After auth completes, activateSupabase() seeds and swaps to supabaseRepo.
// The `repo` proxy object uses getters so all importers transparently see the
// new backend without holding stale references.

import { createLocalRepo } from './localRepo.js';
import { createSupabaseRepo } from './supabaseRepo.js';

let _backend = createLocalRepo();

// Proxy that always delegates to the current backend via getters.
// Importers capture this object once; getters re-read _backend on every call.
export const repo = {
  get user()    { return _backend.user; },
  get gardens() { return _backend.gardens; },
  get zones()   { return _backend.zones; },
  get plants()  { return _backend.plants; },
  get journal() { return _backend.journal; },
  get progress(){ return _backend.progress; },
  get community(){ return _backend.community; },
  newId: (...a) => _backend.newId(...a),
  save:  ()    => _backend.save(),
  raw:   ()    => _backend.raw(),
};

// Called by main.js after successful auth. Seeds from Supabase then swaps backend.
export async function activateSupabase(session) {
  const sbRepo = await createSupabaseRepo(session);
  _backend = sbRepo;
  return repo;
}
