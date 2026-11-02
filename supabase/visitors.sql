-- bellhive99.com - visitor log for ADMIN > Visitors
-- Run once in the bellhive99 Supabase project -> SQL Editor. Safe to re-run.
--
-- Rows are written only by the `track` edge function (server key). Visitor IP addresses are
-- never stored: the function looks up an approximate location, then keeps only a salted hash
-- of the address (to count unique visitors) plus city/region/country.

create table if not exists public.site_visits (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  page          text not null,                 -- login, home, pictures, workout, account, ...
  signed_in     boolean not null default false,
  user_id       uuid references auth.users (id) on delete set null,
  visitor_hash  text,                           -- salted hash of the IP, for unique counts only
  city          text,
  region        text,
  country       text,
  country_code  text,
  lat           double precision,
  lon           double precision,
  isp           text,
  referrer      text,                           -- referring site's domain only
  device        text,                           -- Desktop / Phone / Tablet
  browser       text,                           -- Chrome / Safari / Edge / Firefox / ...
  is_bot        boolean not null default false
);
create index if not exists site_visits_created on public.site_visits (created_at desc);
create index if not exists site_visits_user on public.site_visits (user_id);

alter table public.site_visits enable row level security;
revoke insert, update, delete on public.site_visits from anon, authenticated;
drop policy if exists "admins read" on public.site_visits;
create policy "admins read" on public.site_visits for select to authenticated
  using ((select private.is_admin()));
