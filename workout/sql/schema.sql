-- Workout Log - Supabase schema
-- Paste into the Supabase dashboard -> SQL Editor -> New query -> Run (after ../../supabase/site-schema.sql).
-- Every table is locked to the signed-in user with row level security,
-- so Chris and Kim (or anyone else with an account) only ever see their own log.


-- What you can log. `fields` picks the built-in measures (reps, weight, duration, distance);
-- `custom` holds extra numeric fields [{key, label, unit}]; `target` holds sets/reps/weight/... goals.
create table if not exists public.exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text,                         -- links imported history (bench, pushups, ...)
  name        text not null,
  category    text not null default 'other',
  fields      text[] not null default '{reps}',
  custom      jsonb not null default '[]'::jsonb,
  target      jsonb not null default '{}'::jsonb,
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists exercises_user on public.exercises (user_id);

-- One row per set.
create table if not exists public.sets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id   uuid not null references public.exercises (id) on delete cascade,
  performed_on  date not null,
  performed_at  time,                       -- time of day the set was logged
  set_no        int not null default 1,
  reps          int,
  weight        numeric(7,2),               -- lb
  duration_sec  int,
  distance      numeric(7,2),               -- miles
  extra         jsonb not null default '{}'::jsonb,   -- custom field values
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists sets_user_date on public.sets (user_id, performed_on);
create index if not exists sets_exercise on public.sets (exercise_id, performed_on);

-- Daily trackers (body weight, beers, ...): agg = 'sum' or 'avg' for the weekly number.
create table if not exists public.daily_metrics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text,
  name        text not null,
  unit        text not null default '',
  agg         text not null default 'sum' check (agg in ('sum', 'avg')),
  step        numeric not null default 1,
  sort        int not null default 0,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists daily_metrics_user on public.daily_metrics (user_id);

create table if not exists public.daily_entries (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric_id   uuid not null references public.daily_metrics (id) on delete cascade,
  entry_date  date not null,
  value       numeric(9,2) not null,
  primary key (metric_id, entry_date)
);
create index if not exists daily_user_date on public.daily_entries (user_id, entry_date);

-- Small per-user flags (seeded starter exercises, history imported, ...)
create table if not exists public.user_prefs (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key      text not null,
  value    jsonb,
  primary key (user_id, key)
);

-- Row level security: each table only shows/accepts the caller's own rows.
do $$
declare t text;
begin
  foreach t in array array['exercises', 'sets', 'daily_metrics', 'daily_entries', 'user_prefs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
