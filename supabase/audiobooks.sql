-- bellhive99.com - AUDIOBOOKS (Library + Twice Yearly)
-- Needs site-schema.sql (profiles, private.is_admin) first. Safe to re-run.
-- Source: Twice-Yearly_Book_Listening.xlsm
--   Books sheet               -> public.audiobooks            (AUDIOBOOKS > Library)
--   BOOKS - BI-ANNUAL sheet   -> public.audiobook_rotation     (AUDIOBOOKS > Twice Yearly)
--                                public.audiobook_listens      (start / finish per half-year)
--
-- Who sees what: every row has an OWNER. Only the owner and admins can see or change it,
-- the same rule as RESOURCES (vehicles.sql). Each person can keep their own library and
-- twice-yearly list.

create schema if not exists private;

create or replace function private.ab_can(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.active and (p.role = 'admin' or p.id = p_owner));
$$;
revoke all on function private.ab_can(uuid) from public;
grant execute on function private.ab_can(uuid) to authenticated;

/* ---------- Library: one row per book (Audible export) ---------- */
create table if not exists public.audiobooks (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid default auth.uid() references public.profiles (id) on delete set null,
  audible_key      text not null,                 -- export "Key" (BK_ADBL_000564, ...)
  asin             text,                          -- audible.com/pd/<asin>
  title            text not null,
  authors          text,
  narrators        text,
  series_name      text,
  series_seq       text,                          -- "1", "2.5", "1-3"
  genre            text,                          -- "Science Fiction & Fantasy:Fantasy:Epic"
  publisher        text,
  release_date     date,
  purchase_date    date,
  duration_seconds integer check (duration_seconds >= 0),
  rating           numeric(3,2),                  -- Audible average
  rating_count     integer,
  abridged         boolean,
  language         text,
  description      text,                          -- short teaser
  summary          text,                          -- full publisher summary
  cover_url        text,
  m4b_file         text,
  mp3_file         text,
  read_status      text check (read_status in ('Unread', 'Reading', 'Finished')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists audiobooks_key_uq on public.audiobooks (owner_id, audible_key);
create index if not exists audiobooks_owner_idx on public.audiobooks (owner_id);
create index if not exists audiobooks_asin_idx on public.audiobooks (asin);

/* ---------- Twice Yearly: the books re-listened twice a year ---------- */
create table if not exists public.audiobook_rotation (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid default auth.uid() references public.profiles (id) on delete set null,
  sort_order       integer not null default 0,
  author           text not null,
  series           text,                          -- "Standalone" for one-offs
  series_num       numeric,
  title            text not null,
  pub_year         integer,
  length_seconds   integer check (length_seconds >= 0),
  audiobook_id     uuid references public.audiobooks (id) on delete set null,   -- link to the Library row
  file_path        text,                          -- workbook hyperlink (Audible_m4b\books\...)
  active           boolean not null default true,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists audiobook_rotation_owner_idx on public.audiobook_rotation (owner_id, sort_order);
create index if not exists audiobook_rotation_book_idx on public.audiobook_rotation (audiobook_id);

/* One start/finish per book per half-year: period '2026-1' = Jan-Jun, '2026-2' = Jul-Dec */
create table if not exists public.audiobook_listens (
  id               uuid primary key default gen_random_uuid(),
  rotation_id      uuid not null references public.audiobook_rotation (id) on delete cascade,
  period           text not null check (period ~ '^\d{4}-[12]$'),
  start_date       date,
  finish_date      date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (rotation_id, period)
);

/* ---------- updated_at ---------- */
create or replace function private.ab_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists audiobooks_touch on public.audiobooks;
create trigger audiobooks_touch before update on public.audiobooks for each row execute function private.ab_touch();
drop trigger if exists audiobook_rotation_touch on public.audiobook_rotation;
create trigger audiobook_rotation_touch before update on public.audiobook_rotation for each row execute function private.ab_touch();
drop trigger if exists audiobook_listens_touch on public.audiobook_listens;
create trigger audiobook_listens_touch before update on public.audiobook_listens for each row execute function private.ab_touch();

/* ---------- Row level security ---------- */
alter table public.audiobooks enable row level security;
alter table public.audiobook_rotation enable row level security;
alter table public.audiobook_listens enable row level security;
grant select, insert, update, delete on public.audiobooks, public.audiobook_rotation, public.audiobook_listens to authenticated;

drop policy if exists audiobooks_all on public.audiobooks;
create policy audiobooks_all on public.audiobooks for all to authenticated
  using ((select private.ab_can(owner_id))) with check ((select private.ab_can(owner_id)));

drop policy if exists audiobook_rotation_all on public.audiobook_rotation;
create policy audiobook_rotation_all on public.audiobook_rotation for all to authenticated
  using ((select private.ab_can(owner_id))) with check ((select private.ab_can(owner_id)));

drop policy if exists audiobook_listens_all on public.audiobook_listens;
create policy audiobook_listens_all on public.audiobook_listens for all to authenticated
  using (exists (select 1 from public.audiobook_rotation r where r.id = rotation_id and (select private.ab_can(r.owner_id))))
  with check (exists (select 1 from public.audiobook_rotation r where r.id = rotation_id and (select private.ab_can(r.owner_id))));
