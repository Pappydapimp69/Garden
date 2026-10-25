-- Garden Pal cloud brain quota. Clients cannot touch this table; only the
-- pal-chat function (service role) calls claim_pal_call.

create table if not exists public.pal_api_calls (
  id        bigserial primary key,
  user_id   uuid not null,
  called_at timestamptz not null default now()
);
create index if not exists pal_api_calls_user_day on public.pal_api_calls (user_id, called_at);
alter table public.pal_api_calls enable row level security;
revoke all on public.pal_api_calls from anon, authenticated;

-- Count and insert under a per-user transaction advisory lock, so parallel
-- requests cannot all pass the check before any of them inserts.
create or replace function public.claim_pal_call(p_user uuid, p_daily int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('pal:' || p_user::text));
  select count(*) into n from pal_api_calls
   where user_id = p_user and called_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if n >= p_daily then return false; end if;
  insert into pal_api_calls (user_id) values (p_user);
  return true;
end $$;
revoke all on function public.claim_pal_call(uuid, int) from public, anon, authenticated;
