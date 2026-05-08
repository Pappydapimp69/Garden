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

// Vision model + endpoint. Swap here when migrating to a server-side proxy or a different model.
export const VISION_MODEL    = 'claude-sonnet-4-20250514';
export const VISION_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const VISION_MAX_TOKENS = 2000;
