# Garden Journal — Blueprint

This is the design document the code in this repo was built against. It exists
to make the inline `// see BLUEPRINT.md` references in
[`src/data/schema.js`](src/data/schema.js),
[`src/data/supabaseRepo.js`](src/data/supabaseRepo.js), and
[`src/vision/client.js`](src/vision/client.js) point at something real, and to
give a future contributor (human or agent) the shared mental model needed to
extend the app without re-deriving it from comments.

It is reverse-engineered from the current code. Where the code and this
document disagree, the code wins — and the discrepancy is a bug in this
document. Open a PR.

---

## 1. What the app is

A phone-first garden journal. The user uploads a top-down photo of a garden
area (a "zone"), Claude identifies the plants in it, the user reviews/edits the
tags, and the app keeps a per-plant journal over time. XP and levels make
re-engagement feel rewarding rather than chore-like.

Concretely, v1 is a single-file HTML app (`dist/garden-artifact.html`)
designed to paste into a Claude.ai artifact preview, where browser CORS is
already handled by the artifact host. The modular source under `src/` is
bundled by `build.mjs` — see [§7 Build & Deploy](#7-build--deploy).

---

## 2. Architecture at a glance

```
index.html
  └─ <script type=module src=src/main.js>
        │
        ├─ data/        repo abstraction (local now, Supabase later)
        ├─ state/       session bag + event bus + XP
        ├─ image/       upload processing + EXIF capture-date extraction
        ├─ vision/      Anthropic Messages API (full analysis + re-ID)
        ├─ care/        static plant-care lookup
        ├─ ui/          one module per screen/dialog + dom + toast
        └─ assets/      dev test image + loading phrases
```

Cross-module communication goes through `events` (a tiny pub/sub in
`src/state/session.js`). UI modules never reach into each other's internals;
`src/main.js` wires their callbacks together. The single global mutable bag is
`session` (current zone, gesture state, pan/zoom) — also in `session.js`.

The repo (`src/data/repo.js`) is the only seam between UI and storage. Today
it exports a synchronous `createLocalRepo()` instance. The plan is to swap
that for `createSupabaseRepo()` without restructuring callers — see
[§5 Migration plan](#5-migration-plan).

---

## 3. Data model

Field names in `src/data/schema.js` match this section so the eventual
migration to Postgres is a column-rename exercise, not a redesign. Every shape
below maps 1:1 to a future Supabase table. The whole shape is serialized as a
single JSON blob in `localStorage` today (`garden_journal_v2`).

### `user`
One row. Tracks identity and global-share consent.

| field                  | type    | notes                                          |
| ---------------------- | ------- | ---------------------------------------------- |
| `id`                   | string  | null until Supabase auth is wired              |
| `email`                | string  | null until Supabase auth is wired              |
| `created_at`           | epoch   |                                                |
| `zip_code`             | string  | for future climate-zone lookups                |
| `zip_source`           | enum    | `'none' \| 'manual' \| 'geo'`                  |
| `share_data_globally`  | bool    | governs whether journal entries leave device   |
| `api_key_hint`         | string  | last 4 chars of stored Anthropic key, for UI   |
| `trust_score`          | number  | future: weight a user's corrections in aggregate |

### `gardens`
A user can have several gardens (front yard, community plot, etc.). v1 only
ever creates one — `My Garden` — but the table exists so we don't have to
restructure later.

`{ id, user_id, name, created_at }`

### `zones`
A single tracked area inside a garden. Has a reference photo, a type
(`bed | patio | container | single_plant | nursery`), and an optional
fingerprint (reserved for visual re-identification of the same zone across
sessions).

`{ id, garden_id, name, type, reference_image_path, fingerprint, created_at }`

`reference_image_path` is currently a base64 data URL stored inline. On
Supabase it becomes a path into Supabase Storage — see
[§6 Storage strategy](#6-storage-strategy).

### `sub_zones`
Reserved. Idea: tag a bounding box on the reference photo as a sub-area
("the back row", "the corner pots"). Not yet used by v1 UI.

`{ id, zone_id, name, bbox }`

### `plants`
The unit of identity. One row per visible plant tagged on a reference photo.
A "plant" is the conceptual thing across photos — re-ID flow ties new photos
back to existing rows rather than creating duplicates.

| field                    | type      | notes                                             |
| ------------------------ | --------- | ------------------------------------------------- |
| `id`                     | string    |                                                   |
| `zone_id`                | string    | FK                                                |
| `sub_zone_id`            | string?   | nullable                                          |
| `display_label`          | string    | what UI shows (user can override `species`)       |
| `species`                | string?   | model-suggested or user-typed species             |
| `species_canonical`      | string?   | lowercased species, for matching                  |
| `species_locked`         | bool      | user has explicitly confirmed; re-ID won't change |
| `category`               | enum      | `fruiting \| herb \| flowering \| unknown`        |
| `container_description`  | string?   | future: "5-gal black pot, drip line"              |
| `secondary_identifiers`  | json?     | future: leaf-shape, stem color, etc.              |
| `x`, `y`                 | number    | percent of reference image (0–100)                |
| `pending`                | bool      | "save for later" — species not yet confirmed      |
| `confidence`             | number?   | last vision call's 0–1 score                      |
| `custom`                 | bool      | user typed the species themselves                 |
| `notes`                  | string    |                                                   |
| `deleted`                | bool      | soft-delete                                       |
| `created_at`             | epoch     |                                                   |

### `journal_entries`
A point-in-time observation of a zone, usually triggered by uploading a photo.
The photo itself is **not** persisted (`photo_path: null`) — see
[§6 Storage strategy](#6-storage-strategy) for why.

| field                    | type     | notes                                               |
| ------------------------ | -------- | --------------------------------------------------- |
| `id`                     | string   |                                                     |
| `zone_id`                | string   | FK                                                  |
| `entry_date`             | epoch    | user-editable (defaults to EXIF / lastModified)     |
| `photo_path`             | string?  | always null in v1 (see storage strategy)            |
| `vision_data`            | json?    | raw model output (for replay / debugging)           |
| `user_corrections`       | json?    | diff between vision_data and accepted tags          |
| `overall_health_note`    | string?  | freeform summary                                    |
| `plant_count`            | number   | denormalized for cheap rendering                    |
| `contributes_to_global`  | bool     | gated by `user.share_data_globally`                 |
| `created_at`             | epoch    |                                                     |

### `vision_feedback`
Per-plant correction signal. Captured so we can eventually train/fine-tune,
score the model in aggregate, and reward users whose corrections turn out to
be right (see `user.trust_score`).

`{ id, plant_id, journal_entry_id, ai_suggestion, user_score, correction }`

### `xp` / `level`
Flat scalars on the root of the DB. Curve: `xpForLevel(level) = round(50 * level^1.4)`.
See `src/state/xp.js`. The bar in the header fills based on the current level's
budget, not a global one.

---

## 4. Versioning

The localStorage key is versioned (`garden_journal_v1`, `garden_journal_v2`,
…). Bumping the version means:

1. Add a `migrateFromVN` in `src/data/schema.js`.
2. Update `createLocalRepo.load()` to attempt the new key first, then walk
   backwards through previous keys, migrating as it goes.
3. Bump `STORAGE_KEY` in `src/config.js`.
4. Keep `schema_version` on the DB itself; it's currently unused as a guard
   but is the obvious belt-and-suspenders if a migration ever needs to detect
   half-migrated state.

v1 → v2 is implemented (`migrateFromV1`). It flattens the nested
`zones[].plants[]` / `zones[].journal[]` shape into the current table-style
shape, conservatively setting `species_locked: false` so the user can lock
species explicitly.

---

## 5. Migration plan

> Referenced by `src/data/supabaseRepo.js`.

The local repo is a single-process synchronous façade over a JSON blob; the
Supabase repo is an async façade over Postgres + Auth. The interface is
identical — the same method names returning the same shapes — so the UI
swap is mechanical.

### Step 1 — async-ready interface  *(implemented)*
Reads stay synchronous from an in-memory cache that both repos hydrate at
`init()`; writes (`create`, `update`, `delete`, `softDelete`, `append`,
`set`, `ensureDefault`) are async. Boot in `src/main.js` runs inside an
async IIFE that awaits `repo.init()` before any UI renders.

Per-pixel writes during tag-drag in `src/ui/zone.js` were collapsed to a
single write on drop — local case is microtask churn, Supabase would have
been one HTTP request per pointermove.

### Step 2 — Supabase schema  *(implemented)*
See `supabase/migrations/0001_initial_schema.sql`. One table per object in
[§3 Data model](#3-data-model), foreign keys + `ON DELETE CASCADE` so
deleting a zone removes its plants and journal entries server-side.

RLS chains ownership: `users → gardens → zones → (plants | journal_entries
| sub_zones)`, with `vision_feedback` reached via `plants`. Every policy
is `for all using (...) with check (...)` so a user can only touch rows
that resolve back to their `auth.uid()`. An `auth.users` insert trigger
provisions the `public.users` row so first repo.init() finds a real row.

### Step 3 — implement `createSupabaseRepo`  *(implemented)*
See `src/data/supabaseRepo.js`. Hits the PostgREST endpoint directly over
`fetch`, no `supabase-js` dependency (build.mjs stays zero-dep). Same
read-sync / write-async shape as localRepo. Takes
`{ url, anonKey, accessToken, userId }`; without an accessToken every
request is anonymous and RLS will reject anything beyond public selects.

### Step 4 — swap the export
In `src/data/repo.js`:

```js
// from:
export const repo = createLocalRepo();
// to:
import { createSupabaseRepo } from './supabaseRepo.js';
export const repo = createSupabaseRepo({ url, anonKey, accessToken, userId });
```

`url` / `anonKey` come from `config.js` (env-baked at build time) or from a
runtime config endpoint. `accessToken` and `userId` come from an auth flow
not yet wired into the UI. Local-only deploys keep using `createLocalRepo`.

### Step 5 — one-shot local→remote migration  *(implemented)*
See `src/data/migrateLocalToSupabase.js`. Walks the local repo's in-memory
DB and pushes every row through the Supabase repo's async create methods.
Rewrites `zone_id` foreign keys through a local→remote id map because
Supabase generates new ids on insert. Doesn't touch storage itself — the
caller decides whether to wipe the local copy or keep it as a backup.

---

## 6. Storage strategy

> Referenced by `src/vision/client.js:8`.

There are three storage concerns: **the DB**, **photos**, and **the Anthropic
API key**. Each has its own lifecycle.

### The DB
- **Now**: localStorage, JSON blob keyed by `STORAGE_KEY` (`garden_journal_v2`).
  Single-device, single-browser. No sync.
- **Later**: Supabase Postgres. Per-row RLS pinned to `auth.uid()`. Single
  user identity across devices.

### Photos
- **Now**: reference photos are inlined as base64 data URLs in the DB blob.
  This is fine for a few dozen zones but blows up localStorage at any real
  scale (~5 MB hard limit per origin in most browsers).
- **Journal entry photos** are deliberately **not** persisted at all
  (`journal_entries.photo_path = null` is hardcoded in
  `src/ui/review.js:342`). Storage cost would be prohibitive and the analysis
  itself, not the raw pixels, is what we want to remember.
- **Later**: reference photos move to Supabase Storage, with
  `reference_image_path` becoming an object key. Photos are downscaled
  (`MAX_IMAGE_DIM = 1600`, `IMAGE_QUALITY = 0.82` — see `config.js`) before
  upload, same as today.

### Anthropic API key
This is the part the vision client comment is pointing at. The current code
makes a no-auth `fetch` to `api.anthropic.com`, which only works inside the
Claude.ai artifact host because that host proxies the request. Outside the
sandbox, the call fails CORS without an `x-api-key` header.

Three options for getting that header, in order of increasing security:

1. **Plaintext localStorage** — easy, but anything running JS on the origin
   can exfiltrate it. Acceptable only for a personal local-only build.
2. **Session-encrypted localStorage** — store the key as `AES-GCM(key,
   passphrase)`, with the passphrase entered once per session and held in
   memory. `crypto.subtle` is sufficient. The user re-enters on reload, but
   an XSS bug doesn't leak persistent secrets.
   - `user.api_key_hint` is populated with the last 4 chars so the UI can
     prove the key is the one the user expects without decrypting.
3. **Supabase edge function proxy** — the key lives on the server; the
   browser calls `/api/vision/analyze` with the user's Supabase JWT, and the
   edge function injects the Anthropic header. This is the only setup where
   the key never enters the browser process.

Option (3) is the destination. (2) is the bridge for users who don't want to
stand up a Supabase project, **and is implemented today** in
`src/state/apiKey.js`.

The on-disk envelope:

```json
{ "v": 1, "salt": "<b64>", "iv": "<b64>", "ct": "<b64>", "hint": "<last4>" }
```

PBKDF2-SHA256 with 250k iterations derives a 256-bit AES-GCM key from the
user's passphrase; salt is 16 random bytes, iv is 12. AES-GCM's auth tag
means a wrong passphrase throws on decrypt instead of returning garbage.
The cleartext is held in a module-level closure (never on `window`) and
cleared by `lock()` or `clearApiKey()`.

`visionRequest` in `src/vision/client.js` calls `getApiKey()` — null inside
the artifact sandbox (let the host's proxy handle it), the decrypted key
once the user has unlocked it via `unlock(passphrase)`. The UI for entering
the passphrase isn't built yet — that's a settings-screen TODO.

---

## 7. Build & Deploy

`build.mjs` is a zero-dependency bundler tailored to this codebase. See its
header for the assumptions it makes (all static named imports, no dynamic
import, no top-level await — don't extend it without revisiting these).

Two output modes:

- `node build.mjs` → `dist/garden.html` (full bundle, includes dev test image)
- `node build.mjs --artifact` → `dist/garden-artifact.html` (dev image
  stubbed; ~111 KB; optimized for paste-into-Claude.ai-artifact)

The artifact mode exists because Claude.ai's artifact host enforces a size
ceiling and won't proxy requests for files larger than a certain threshold.
The dev image is the heaviest single asset, so stripping it is the cheapest
way to fit.

---

## 8. Vision pipeline

Two calls, both hitting Anthropic Messages API via `src/vision/client.js`:

1. **`analyzeFullPhoto`** (`src/vision/analyze.js`) — full reference photo +
   list of already-confirmed species in this zone. Returns plant tags with
   `(x, y, name, category, confidence, notes)`. Sorted top→bottom,
   left→right within rough rows before display.
2. **`reIdentifyBatch`** (`src/vision/reidentify.js`) — when the user rejects
   one or more tags, we crop a `REID_CROP_PCT`-sized square centered on each
   rejected tag and ship all crops in a single message, with the rejected
   labels as negative constraints. Returns up to 3 candidates per crop.

The review screen (`src/ui/review.js`) is the single owner of this flow. It
also owns the user-facing date selection (EXIF capture date with
lastModified fallback, user-editable), which gates `entry_date` on the
resulting journal entry.

The model + endpoint are pinned in `src/config.js` (`VISION_MODEL`,
`VISION_ENDPOINT`). Migration to a Supabase edge proxy means changing
`VISION_ENDPOINT` and dropping the direct-browser-access header.

---

## 9. UX conventions worth knowing

- File pickers use `<label for="...">` instead of programmatic `.click()`.
  Sandboxed iframes (the artifact host) block synthetic click events; the
  native `for=` association still works.
- Long-press on the "Upload Photo" button triggers the dev test image flow
  (800ms hold + haptic), and suppresses the native picker via
  `preventDefault` on the subsequent click. This is the only place the dev
  image is reachable in production builds.
- XP feedback is delivered through the toast system, not a modal. Level-ups
  get a different toast kind (`'xp'`).
- `pending` plants ("save for later") render with a distinct visual state —
  they're on the map but not yet committed to a species.

---

## 10. Roadmap / open questions

These are things the current code is shaped to allow but doesn't yet do:

- **Zone fingerprinting** — `zones.fingerprint` is reserved. Idea: store a
  perceptual hash of the reference photo so we can prompt "is this the same
  zone as X?" when a new upload looks similar.
- **`sub_zones`** — bounding boxes on the reference photo. UI not built.
- **Visual re-ID across photos** — match plants on a new photo to existing
  rows by `(x, y)` proximity + species. Today the re-ID flow only handles
  the rejected-tags-in-one-photo case.
- **Global aggregation** — `journal_entries.contributes_to_global` is the
  gate. Needs an anonymized rollup table and an ingestion job.
- **Climate-zone-aware care tips** — `user.zip_code` is captured but unused;
  `src/care/careDb.js` is hardcoded to Texas zone 7b/8a. Either parameterize
  the lookup or ship per-zone DBs.
- **Trust scoring** — `user.trust_score` + `vision_feedback.user_score`
  exist as columns. Mechanism doesn't.
- **Multi-garden UI** — schema supports it, UI assumes one.

---

## 11. Conventions for changes

- Don't add fields to schema.js without updating this doc's [§3 Data model](#3-data-model).
- Don't bypass `repo` from UI code. New persistence needs go through the
  factory in `src/data/repo.js`.
- New cross-module communication goes through an `EV` event in
  `src/state/session.js`, not a direct import.
- New tunable constants live in `src/config.js`.
- Comments answer "why" or flag invariants. Don't narrate what the code
  obviously does.
