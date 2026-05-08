// Repo factory. UI code imports `repo` from here and never talks to storage directly.
//
// Today: localRepo (synchronous, localStorage-backed).
// Tomorrow: supabaseRepo (asynchronous, network-backed). When that swap happens,
// update the export below and add `await` to call sites in UI screens.
//
// Method shapes are deliberately small and table-like so they map directly to
// Supabase queries. Anything more complex (joins, aggregates) is a UI concern
// and should be composed at the call site, not buried here.

import { createLocalRepo } from './localRepo.js';
// import { createSupabaseRepo } from './supabaseRepo.js';

export const repo = createLocalRepo();
// To swap backends later:
//   export const repo = createSupabaseRepo({ url: '...', anonKey: '...' });
