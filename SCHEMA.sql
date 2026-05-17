-- Garden Journal — Supabase Schema
-- Run this in the Supabase SQL editor for project: czoaeombqqhgyqbsetlj
-- All tables use RLS; only the owner can read/write their rows.

-- ── User profiles (extends auth.users) ─────────────────────────────────────
create table if not exists public.user_profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  zip_code            text,
  zip_source          text not null default 'none',
  share_data_globally boolean not null default true,
  api_key_hint        text,
  trust_score         integer,
  xp                  integer not null default 0,
  level               integer not null default 1,
  created_at          bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.user_profiles enable row level security;
create policy "owner" on public.user_profiles
  using (auth.uid() = id) with check (auth.uid() = id);

-- ── Gardens ─────────────────────────────────────────────────────────────────
create table if not exists public.gardens (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'My Garden',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.gardens enable row level security;
create policy "owner" on public.gardens
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Zones ────────────────────────────────────────────────────────────────────
create table if not exists public.zones (
  id                   text primary key,
  garden_id            text not null references public.gardens(id) on delete cascade,
  name                 text not null,
  type                 text not null,
  reference_image_path text,
  fingerprint          text,
  created_at           bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.zones enable row level security;
create policy "owner" on public.zones
  using (auth.uid() = (select user_id from public.gardens where id = garden_id))
  with check (auth.uid() = (select user_id from public.gardens where id = garden_id));

-- ── Plants ───────────────────────────────────────────────────────────────────
create table if not exists public.plants (
  id                    text primary key,
  zone_id               text not null references public.zones(id) on delete cascade,
  sub_zone_id           text,
  display_label         text,
  species               text,
  species_canonical     text,
  species_locked        boolean not null default false,
  category              text not null default 'unknown',
  container_description text,
  secondary_identifiers text,
  x                     numeric,
  y                     numeric,
  pending               boolean not null default false,
  confidence            numeric,
  custom                boolean not null default false,
  notes                 text not null default '',
  deleted               boolean not null default false,
  created_at            bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.plants enable row level security;
create policy "owner" on public.plants
  using (auth.uid() = (
    select g.user_id from public.gardens g
    join public.zones z on z.garden_id = g.id
    where z.id = zone_id
  ))
  with check (auth.uid() = (
    select g.user_id from public.gardens g
    join public.zones z on z.garden_id = g.id
    where z.id = zone_id
  ));

-- ── Journal entries ───────────────────────────────────────────────────────────
create table if not exists public.journal_entries (
  id                    text primary key,
  zone_id               text not null references public.zones(id) on delete cascade,
  entry_date            bigint,
  photo_path            text,
  vision_data           jsonb,
  user_corrections      jsonb,
  overall_health_note   text,
  plant_count           integer not null default 0,
  contributes_to_global boolean not null default false,
  created_at            bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.journal_entries enable row level security;
create policy "owner" on public.journal_entries
  using (auth.uid() = (
    select g.user_id from public.gardens g
    join public.zones z on z.garden_id = g.id
    where z.id = zone_id
  ))
  with check (auth.uid() = (
    select g.user_id from public.gardens g
    join public.zones z on z.garden_id = g.id
    where z.id = zone_id
  ));

-- ── User action log (private, full payload) ───────────────────────────────────
create table if not exists public.user_action_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
alter table public.user_action_log enable row level security;
create policy "owner_insert" on public.user_action_log
  for insert with check (auth.uid() = user_id);
create policy "owner_select" on public.user_action_log
  for select using (auth.uid() = user_id);

-- ── Global action log (anonymized, insert-only for authenticated users) ───────
create table if not exists public.global_action_log (
  id          bigserial primary key,
  action_type text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
alter table public.global_action_log enable row level security;
create policy "authed_insert" on public.global_action_log
  for insert with check (auth.uid() is not null);
-- No SELECT policy: only service role can read global logs

-- ── Plant care database (global shared cache, one row per species) ────────────
create table if not exists public.plant_care (
  species_canonical  text primary key,
  display_name       text,
  category           text,
  data               jsonb not null,
  created_at         bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.plant_care enable row level security;
create policy "authed_read"   on public.plant_care for select using (auth.uid() is not null);
create policy "authed_insert" on public.plant_care for insert with check (auth.uid() is not null);

-- Seed: 12 plants from the original hardcoded careDb.js
insert into public.plant_care (species_canonical, display_name, category, data) values
('squash', 'Squash', 'vegetable', '{"sun":"Full sun","water":"Deep water 1–2x/week; keep soil consistently moist.","soil":"Rich, well-draining soil with compost; pH 6.0–6.8.","spacing":"24–36 inches apart","harvest":"50–65 days; harvest summer squash at 6–8 inches.","fertilizer":"Balanced fertilizer at planting, low-nitrogen once flowering.","pests":["Squash vine borers","Squash bugs","Cucumber beetles"],"tips":["In Texas heat, shade cloth in July–August prevents blossom drop.","Mulch heavily to retain moisture.","Plant a second round in late July for fall harvest."]}'),
('cantaloupe', 'Cantaloupe', 'fruit', '{"sun":"Full sun","water":"1–2 inches/week; reduce as fruit ripens for sweeter flavor.","soil":"Sandy loam, well-draining; pH 6.0–6.8.","spacing":"36 inches apart; allow vines to trail.","harvest":"75–90 days; ripe when stem slips easily.","fertilizer":"High nitrogen early, switch to P/K at flowering.","pests":["Aphids","Cucumber beetles","Powdery mildew"],"tips":["Texas summers are ideal — plant after last frost.","Place fruit on a board to keep off hot soil.","Stop watering 1 week before harvest."]}'),
('bell pepper', 'Bell Pepper', 'vegetable', '{"sun":"Full sun (6–8 hrs min)","water":"1–2 inches/week; consistent moisture prevents blossom end rot.","soil":"Well-draining, fertile soil; pH 6.0–6.8.","spacing":"18–24 inches apart","harvest":"60–90 days; green at maturity, longer for color.","fertilizer":"Low N at planting, more P/K at first bloom.","pests":["Aphids","Pepper weevils","Spider mites"],"tips":["Texas summers above 95°F can cause blossom drop — shade cloth helps.","Mulch 3–4 inches deep.","Stake plants early; loaded branches snap in storms."]}'),
('jalapeño', 'Jalapeño', 'vegetable', '{"sun":"Full sun","water":"1 inch/week; slight drought stress increases heat.","soil":"Well-draining, fertile; pH 6.0–6.8.","spacing":"14–18 inches apart","harvest":"70–85 days; harvest green or red.","fertilizer":"Balanced at transplant; limit N mid-season.","pests":["Aphids","Pepper maggots","Bacterial leaf spot"],"tips":["Thrives in Texas heat — one of the best peppers for zone 7b/8a.","Stress slightly before harvest for hotter peppers.","Can overwinter indoors in a pot."]}'),
('serrano', 'Serrano', 'vegetable', '{"sun":"Full sun","water":"1 inch/week; tolerates heat well.","soil":"Well-draining, fertile; pH 6.0–6.8.","spacing":"18–24 inches apart","harvest":"75–90 days; harvest green or red.","fertilizer":"Light feeding; avoid over-N.","pests":["Aphids","Spider mites","Flea beetles"],"tips":["More heat-tolerant than jalapeño.","Higher capsaicin; harvest smaller for more heat.","Prolific producer — 50+ peppers per plant."]}'),
('thyme', 'Thyme', 'herb', '{"sun":"Full sun to partial shade","water":"Low water; drought-tolerant once established.","soil":"Well-draining, sandy or loamy; pH 6.0–8.0.","spacing":"12–18 inches apart","harvest":"Harvest sprigs anytime; trim before flowering.","fertilizer":"Light feeder; one balanced dose in spring.","pests":["Aphids (rare)","Spider mites in dry conditions"],"tips":["Thrives in Texas heat — very low maintenance.","Trim after flowering to prevent woodiness.","Mulch lightly in winter for occasional hard freezes."]}'),
('marigold', 'Marigold', 'flower', '{"sun":"Full sun","water":"Moderate; water at base; drought-tolerant once established.","soil":"Average, well-draining; pH 6.0–7.0.","spacing":"8–12 inches apart","harvest":null,"fertilizer":"Light feeder; too much fertilizer = more foliage, fewer flowers.","pests":["Spider mites (in heat)","Slugs"],"tips":["Repels aphids, nematodes, whiteflies — excellent companion plant.","Deadhead spent blooms for continuous flowering.","Texas heat may cause summer slow-down; rebounds in fall."]}'),
('tomato', 'Tomato', 'vegetable', '{"sun":"Full sun","water":"1–2 inches/week, deep watering at base.","soil":"Rich, well-draining, slightly acidic; pH 6.2–6.8.","spacing":"24–36 inches apart","harvest":"60–85 days depending on variety.","fertilizer":"Balanced at planting; switch to lower N at flowering.","pests":["Hornworms","Whiteflies","Blossom end rot (calcium issue)"],"tips":["Texas heat can halt fruit set above 95°F — shade cloth helps.","Stake or cage early.","Mulch heavily to maintain even moisture."]}'),
('basil', 'Basil', 'herb', '{"sun":"Full sun","water":"Keep soil consistently moist but not soggy.","soil":"Rich, well-draining; pH 6.0–7.0.","spacing":"12–18 inches apart","harvest":"Pinch leaves continuously; cut flowers to extend production.","fertilizer":"Light feeder; balanced fertilizer monthly.","pests":["Aphids","Japanese beetles","Downy mildew"],"tips":["Pinch flowers immediately to prolong leaf production.","Loves Texas heat as long as it has water.","Companion plants well with tomatoes."]}'),
('rosemary', 'Rosemary', 'herb', '{"sun":"Full sun","water":"Drought-tolerant; let soil dry between waterings.","soil":"Well-draining, slightly alkaline; pH 6.0–7.5.","spacing":"24–36 inches apart","harvest":"Cut sprigs anytime; never more than 1/3 at once.","fertilizer":"Minimal feeding; light spring fertilizer.","pests":["Spider mites","Powdery mildew"],"tips":["Excellent for Texas — very drought-tolerant.","Avoid overwatering; root rot is the biggest risk.","Can grow into a small shrub over years."]}'),
('lavender', 'Lavender', 'flower', '{"sun":"Full sun","water":"Drought-tolerant; water deeply but infrequently.","soil":"Well-draining, sandy, slightly alkaline; pH 6.7–7.3.","spacing":"18–36 inches apart","harvest":"Harvest flowers when buds open; cut stems long.","fertilizer":"Minimal; lavender prefers lean soil.","pests":["Spittlebugs","Root rot from overwatering"],"tips":["Texas summers: French/Spanish lavender handles heat better than English.","Excellent drainage is critical.","Prune after flowering to shape and prevent woodiness."]}')
on conflict (species_canonical) do nothing;
