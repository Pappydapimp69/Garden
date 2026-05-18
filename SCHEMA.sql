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

-- ── Vision API free-tier quota ────────────────────────────────────────────────
-- Master key (Supabase secret ANTHROPIC_API_KEY) funds 10 calls/day per user
-- up to a per-account lifetime cap of 100. After that, users must supply
-- their own Anthropic key (sent in the x-user-api-key header by the client).
alter table public.user_profiles
  add column if not exists vision_calls_today    int  not null default 0,
  add column if not exists vision_calls_total    int  not null default 0,
  add column if not exists vision_last_call_date date;

-- Atomic check + increment. Returns whether the call is allowed under the
-- master-key quota and the post-increment counters. SECURITY DEFINER so the
-- update bypasses RLS while still using auth.uid() to identify the caller.
create or replace function public.try_use_vision_quota()
returns table(allowed boolean, today_used int, total_used int, daily_limit int, lifetime_limit int)
language plpgsql security definer as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := current_date;
  v_t     int;
  v_total int;
  v_last  date;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select vision_calls_today, vision_calls_total, vision_last_call_date
    into v_t, v_total, v_last
    from public.user_profiles where id = v_uid for update;

  if not found then
    -- First-time caller: create a profile row so the counters have somewhere to live.
    insert into public.user_profiles (id) values (v_uid)
      on conflict (id) do nothing;
    v_t := 0; v_total := 0; v_last := null;
  end if;

  if v_last is null or v_last <> v_today then
    v_t := 0;
  end if;

  if v_t >= 10 or v_total >= 100 then
    return query select false, v_t, v_total, 10, 100;
    return;
  end if;

  update public.user_profiles
    set vision_calls_today    = v_t + 1,
        vision_calls_total    = coalesce(vision_calls_total, 0) + 1,
        vision_last_call_date = v_today
    where id = v_uid;

  return query select true, v_t + 1, coalesce(v_total, 0) + 1, 10, 100;
end $$;

grant execute on function public.try_use_vision_quota() to authenticated;
