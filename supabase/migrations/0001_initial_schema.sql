-- Initial Garden Journal schema for Supabase.
--
-- Mirrors BLUEPRINT.md §3 (Data model). Every column name matches the field
-- name used by src/data/schema.js so createSupabaseRepo's payloads ship
-- straight through.
--
-- Apply via: supabase db push  (or the Studio SQL editor)

create extension if not exists "pgcrypto";

-- ── users ──────────────────────────────────────────────────────────
-- One row per signed-in user. id mirrors auth.uid().
create table public.users (
  id                    uuid primary key references auth.users on delete cascade,
  email                 text,
  created_at            bigint not null default (extract(epoch from now()) * 1000)::bigint,
  zip_code              text,
  zip_source            text not null default 'none' check (zip_source in ('none','manual','geo')),
  region_label          text,
  share_data_globally   boolean not null default true,
  api_key_hint          text,
  trust_score           numeric,
  xp                    integer not null default 0,
  level                 integer not null default 1
);

-- ── gardens ────────────────────────────────────────────────────────
create table public.gardens (
  id          text primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  created_at  bigint not null
);
create index gardens_user_id_idx on public.gardens(user_id);

-- ── zones ──────────────────────────────────────────────────────────
create table public.zones (
  id                     text primary key,
  garden_id              text not null references public.gardens(id) on delete cascade,
  name                   text not null,
  type                   text not null check (type in ('bed','patio','container','single_plant','nursery')),
  reference_image_path   text,
  fingerprint            text,
  created_at             bigint not null
);
create index zones_garden_id_idx on public.zones(garden_id);

-- ── sub_zones ──────────────────────────────────────────────────────
create table public.sub_zones (
  id        text primary key,
  zone_id   text not null references public.zones(id) on delete cascade,
  name      text not null,
  bbox      jsonb
);
create index sub_zones_zone_id_idx on public.sub_zones(zone_id);

-- ── plants ─────────────────────────────────────────────────────────
create table public.plants (
  id                      text primary key,
  zone_id                 text not null references public.zones(id) on delete cascade,
  sub_zone_id             text references public.sub_zones(id) on delete set null,
  display_label           text not null default 'Unknown',
  species                 text,
  species_canonical       text,
  species_locked          boolean not null default false,
  category                text not null default 'unknown' check (category in ('fruiting','herb','flowering','unknown')),
  container_description   text,
  secondary_identifiers   jsonb,
  x                       numeric,
  y                       numeric,
  pending                 boolean not null default false,
  confidence              numeric,
  custom                  boolean not null default false,
  notes                   text not null default '',
  deleted                 boolean not null default false,
  created_at              bigint not null
);
create index plants_zone_id_idx on public.plants(zone_id);
create index plants_zone_active_idx on public.plants(zone_id) where deleted = false;

-- ── journal_entries ────────────────────────────────────────────────
create table public.journal_entries (
  id                      text primary key,
  zone_id                 text not null references public.zones(id) on delete cascade,
  entry_date              bigint not null,
  photo_path              text,
  vision_data             jsonb,
  user_corrections        jsonb,
  overall_health_note     text,
  plant_count             integer not null default 0,
  contributes_to_global   boolean not null default false,
  created_at              bigint not null
);
create index journal_entries_zone_id_idx on public.journal_entries(zone_id);

-- ── vision_feedback ────────────────────────────────────────────────
create table public.vision_feedback (
  id                  text primary key,
  plant_id            text not null references public.plants(id) on delete cascade,
  journal_entry_id    text references public.journal_entries(id) on delete set null,
  ai_suggestion       jsonb,
  user_score          numeric,
  correction          jsonb
);
create index vision_feedback_plant_id_idx on public.vision_feedback(plant_id);

-- ── Row-level security ─────────────────────────────────────────────
-- The chain of ownership is users → gardens → zones → (plants | journal_entries | sub_zones).
-- vision_feedback is reached via plants.

alter table public.users             enable row level security;
alter table public.gardens           enable row level security;
alter table public.zones             enable row level security;
alter table public.sub_zones         enable row level security;
alter table public.plants            enable row level security;
alter table public.journal_entries   enable row level security;
alter table public.vision_feedback   enable row level security;

-- users: see/manage your own row.
create policy users_self on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

-- gardens: yours.
create policy gardens_owner on public.gardens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- zones: through gardens.
create policy zones_owner on public.zones
  for all using (
    garden_id in (select id from public.gardens where user_id = auth.uid())
  ) with check (
    garden_id in (select id from public.gardens where user_id = auth.uid())
  );

-- sub_zones: through zones → gardens.
create policy sub_zones_owner on public.sub_zones
  for all using (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  ) with check (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  );

-- plants: same chain as sub_zones.
create policy plants_owner on public.plants
  for all using (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  ) with check (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  );

-- journal_entries: same chain.
create policy journal_entries_owner on public.journal_entries
  for all using (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  ) with check (
    zone_id in (
      select z.id from public.zones z
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  );

-- vision_feedback: through plants → zones → gardens.
create policy vision_feedback_owner on public.vision_feedback
  for all using (
    plant_id in (
      select p.id from public.plants p
      join public.zones z on z.id = p.zone_id
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  ) with check (
    plant_id in (
      select p.id from public.plants p
      join public.zones z on z.id = p.zone_id
      join public.gardens g on g.id = z.garden_id
      where g.user_id = auth.uid()
    )
  );

-- ── Bootstrap a public.users row on auth signup ────────────────────
-- Without this, the first repo.init() finds no user row and falls back to
-- a default. With this, the row is ready before the app first connects.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
