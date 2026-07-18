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

-- Server-side sanitization (defense-in-depth for the anonymized log).
-- The client sanitizes before insert, but any authenticated user can POST an
-- arbitrary body straight to PostgREST — client-side allow-listing is not a
-- boundary. This BEFORE INSERT trigger re-enforces the whitelist in the DB so
-- even a raw insert is normalized: unknown action_type is rejected (default
-- deny), and payload is stripped to known-safe numeric/categorical keys only.
create or replace function public.sanitize_global_action_log()
returns trigger
language plpgsql
as $$
declare
  allowed_actions text[] := array[
    'photo_analyzed','plant_confirmed','plant_rejected','journal_entry_saved',
    'vision_proxy_call','vision_byok_call','vision_quota_exhausted'];
  allowed_keys text[] := array[
    'plant_count','zone_type','confidence','category','amount','species_canonical'];
  safe jsonb := '{}'::jsonb;
  k text;
begin
  if new.action_type is null or not (new.action_type = any(allowed_actions)) then
    raise exception 'global_action_log: action_type % not allowed', new.action_type;
  end if;
  if new.payload is not null and jsonb_typeof(new.payload) = 'object' then
    foreach k in array allowed_keys loop
      if new.payload ? k then
        safe := safe || jsonb_build_object(k, new.payload -> k);
      end if;
    end loop;
  end if;
  new.payload := safe;
  return new;
end;
$$;
drop trigger if exists trg_sanitize_global_action_log on public.global_action_log;
create trigger trg_sanitize_global_action_log
  before insert on public.global_action_log
  for each row execute function public.sanitize_global_action_log();

-- ── Species observations (crowdsourced plant-network, anonymized) ─────────────
-- The "plant-network" layer: a write-only-by-system, aggregate-read-only table
-- keyed by canonical species + zip only — NEVER GPS, NO user_id, no reverse
-- lookup. RLS is enabled with NO policies, so the anon/authenticated client can
-- neither read nor write it directly; the SECURITY DEFINER functions below are
-- the sole interface. That (a) sources the contributor's zip server-side so the
-- client can't spoof a region, (b) prevents correlation of raw rows, and (c)
-- enforces the publish threshold at read time.
create table if not exists public.species_observations (
  id                bigserial primary key,
  species_canonical text not null,
  zip_code          text not null,
  category          text,
  confidence        numeric,
  observed_month    smallint,          -- 1-12 only; coarser than a date, by design
  weight            numeric not null default 1.0,
  created_at        timestamptz not null default now()
);
create index if not exists species_obs_species_zip_idx
  on public.species_observations (species_canonical, zip_code);
alter table public.species_observations enable row level security;
-- (no policies — direct client access denied; use the RPCs below)

-- Writer: called by the client on plant confirm. Reads the caller's zip +
-- opt-in + trust_score from their profile (server-side), and records ONE
-- anonymized observation. Opted-out or region-less users contribute nothing.
-- Trust-weighting: low-trust contributors are down-weighted, never rejected.
create or replace function public.record_species_observation(
  p_species text, p_category text default null, p_confidence numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_zip   text;
  v_share boolean;
  v_trust integer;
  v_weight numeric;
begin
  if v_uid is null or p_species is null or length(trim(p_species)) = 0 then
    return;
  end if;
  select zip_code, share_data_globally, trust_score
    into v_zip, v_share, v_trust
    from public.user_profiles where id = v_uid;
  if coalesce(v_share, false) is not true
     or v_zip is null or length(trim(v_zip)) = 0 then
    return;  -- opted out or no region → contribute nothing
  end if;
  v_weight := greatest(0.1, least(1.0, coalesce(v_trust, 100) / 100.0));
  insert into public.species_observations
    (species_canonical, zip_code, category, confidence, observed_month, weight)
  values
    (lower(trim(p_species)), trim(v_zip), p_category, p_confidence,
     extract(month from now())::smallint, v_weight);
end;
$$;
revoke all on function public.record_species_observation(text, text, numeric) from public;
grant execute on function public.record_species_observation(text, text, numeric) to authenticated;

-- Reader: aggregate insight for a species in the CALLER's own zip. Returns
-- honestly-framed JSON: below the publish threshold it reports enough=false +
-- the running sample count (so the UI can stay quiet or caveat), never raw rows.
create or replace function public.species_insight(p_species text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_zip text;
  v_min int := 3;                 -- min reports per zip+species before publishing
  v_count int;
  v_wsum  numeric;
  v_avg_conf numeric;
  v_top_category text;
begin
  if v_uid is null or p_species is null then
    return jsonb_build_object('enough', false, 'sample', 0);
  end if;
  select zip_code into v_zip from public.user_profiles where id = v_uid;
  if v_zip is null or length(trim(v_zip)) = 0 then
    return jsonb_build_object('enough', false, 'sample', 0, 'reason', 'no_region');
  end if;

  select count(*), coalesce(sum(weight), 0), avg(confidence)
    into v_count, v_wsum, v_avg_conf
    from public.species_observations
    where species_canonical = lower(trim(p_species)) and zip_code = trim(v_zip);

  if v_count < v_min then
    return jsonb_build_object('enough', false, 'sample', v_count, 'min', v_min);
  end if;

  select category into v_top_category
    from public.species_observations
    where species_canonical = lower(trim(p_species)) and zip_code = trim(v_zip)
      and category is not null
    group by category order by sum(weight) desc nulls last limit 1;

  return jsonb_build_object(
    'enough', true,
    'sample', v_count,
    'weighted_sample', round(v_wsum, 1),
    'top_category', v_top_category,
    'avg_confidence', round(coalesce(v_avg_conf, 0), 2)
  );
end;
$$;
revoke all on function public.species_insight(text) from public;
grant execute on function public.species_insight(text) to authenticated;

-- ── Vision API call ledger ───────────────────────────────────────────────────
-- One row per Anthropic call we cover for the user (i.e. proxied through the
-- vision-proxy edge function). BYOK calls bypass this table entirely.
-- The vision-proxy function is the only writer; the client reads its own rows
-- to render the quota meter in Settings.
create table if not exists public.vision_api_calls (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  called_at timestamptz not null default now()
);
create index if not exists vision_api_calls_user_called_idx
  on public.vision_api_calls(user_id, called_at desc);
alter table public.vision_api_calls enable row level security;
create policy "owner_insert" on public.vision_api_calls
  for insert with check (auth.uid() = user_id);
create policy "owner_select" on public.vision_api_calls
  for select using (auth.uid() = user_id);
