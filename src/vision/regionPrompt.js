import { repo } from '../data/repo.js';

// Build a region phrase to splice into vision prompts. Reads the current
// user's region fields and returns either a non-empty fragment or ''. The
// fragment is meant to follow "a backyard garden" — see analyze.js,
// reidentify.js, careAdvice.js.
//
// Priority: explicit region_label > zip_code > nothing. zip_source isn't
// used in the prompt itself; it's metadata about where the zip came from.

export function regionPhrase() {
  const u = repo.user.get();
  if (u?.region_label) return `in ${u.region_label}`;
  if (u?.zip_code)     return `in zip code ${u.zip_code}`;
  return '';
}
