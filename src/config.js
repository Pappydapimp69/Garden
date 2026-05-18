// Tunable constants for the Garden Journal.
// Anything that might change with a/b testing or per-environment config goes here.

export const STORAGE_KEY_V1 = 'garden_journal_v1';
export const STORAGE_KEY    = 'garden_journal_v2';

export const ADD_HOLD_MS    = 600;
export const TAG_HOLD_MS    = 1200;
export const BASE_DOT       = 26;
export const BASE_FONT      = 0.55;
export const MIN_ZOOM       = 0.2;
export const MAX_ZOOM       = 8;
export const MOVE_THRESH    = 6;
export const TAG_MOVE_THRESH = 18;

export const CONF_HIGH = 0.75;
export const CONF_MED  = 0.45;

export const MAX_IMAGE_DIM = 1600;
export const IMAGE_QUALITY = 0.82;
export const REID_CROP_PCT = 25;

// Vision model. The endpoint is now the Supabase Edge Function `vision`, which
// proxies to Anthropic with either the master key (free-tier quota) or the
// user's own key (sent in `x-user-api-key`) once they exceed the quota.
export const VISION_MODEL      = 'claude-sonnet-4-20250514';
export const VISION_MAX_TOKENS = 2000;

// Supabase project credentials (anon/public key — safe to ship in client code).
export const SUPABASE_URL      = 'https://czoaeombqqhgyqbsetlj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_LDKc3zPhBInG-DpInW0gLw_3GNt7MMP';

export const VISION_PROXY_ENDPOINT  = SUPABASE_URL + '/functions/v1/vision';
export const LOCAL_API_KEY_STORAGE  = 'garden:apiKey';
