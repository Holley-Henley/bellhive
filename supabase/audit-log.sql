-- bellhive99.com - audit log (ADMIN > Audit Log)
-- Run once in the bellhive99 Supabase project -> SQL Editor. Safe to re-run.
-- Needs site-schema.sql (profiles + private.is_admin) to have been run first.

create table if not exists public.audit_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid default auth.uid() references auth.users (id) on delete set null,
  user_name       text,
  user_role       text,
  module          text not null default 'site',   -- site | admin | workout | ...
  action_type     text not null,                  -- login, user_create, exercise_delete, ...
  action_detail   text,
  item_reference  text
);
create index if not exists audit_log_created on public.audit_log (created_at desc);
create index if not exists audit_log_user on public.audit_log (user_id);

-- Who and when are always filled in by the database, so entries can't be forged from the browser.
create or replace function public.audit_log_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    select coalesce(p.full_name, p.email), p.role into new.user_name, new.user_role
    from public.profiles p where p.id = auth.uid();
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists audit_log_stamp on public.audit_log;
create trigger audit_log_stamp before insert on public.audit_log
  for each row execute function public.audit_log_stamp();
revoke execute on function public.audit_log_stamp() from public, anon, authenticated;

-- Anyone signed in can add entries about themselves; only admins can read; nobody edits or deletes.
alter table public.audit_log enable row level security;
drop policy if exists "add own entries" on public.audit_log;
create policy "add own entries" on public.audit_log for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "admins read" on public.audit_log;
create policy "admins read" on public.audit_log for select to authenticated
  using ((select private.is_admin()));
