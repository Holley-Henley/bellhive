-- bellhive99.com - Blood Pressure log (HEALTH AND FITNESS > Blood Pressure)
-- Needs site-schema.sql, audit-log.sql, audit-detail.sql and permissions.sql first. Safe to re-run.
--
-- Who can do what
--   * Each person only ever sees, adds, edits and deletes their OWN readings - admins included.
--   * The menu item (and these rows) follow the 'bloodpressure' key on ADMIN > Permissions.
--   * The Audit Log records THAT a reading was added / changed / deleted, never the numbers or
--     notes, because admins can read the Audit Log and the readings are private.

create table if not exists public.bp_readings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  taken_at    timestamptz not null default now(),
  systolic    int not null check (systolic between 50 and 300),
  diastolic   int not null check (diastolic between 30 and 200),
  notes       text check (notes is null or char_length(notes) <= 500),
  created_at  timestamptz not null default now(),
  check (systolic > diastolic)
);
create index if not exists bp_readings_user_taken on public.bp_readings (user_id, taken_at desc);

alter table public.bp_readings enable row level security;
revoke all on public.bp_readings from anon, authenticated;
grant select, insert, update, delete on public.bp_readings to authenticated;

drop policy if exists "own rows" on public.bp_readings;
create policy "own rows" on public.bp_readings for all to authenticated
  using (user_id = (select auth.uid()) and (select private.can_see('bloodpressure')))
  with check (user_id = (select auth.uid()) and (select private.can_see('bloodpressure')));

-- ---------- Audit Log: what happened, never the values ----------
create or replace function private.audit_bp()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  r text := coalesce(current_setting('role', true), '');
  w timestamptz := case when TG_OP = 'DELETE' then old.taken_at else new.taken_at end;
begin
  if r <> 'authenticated' then return null; end if;   -- SQL editor / imports aren't logged
  insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, row_count)
  values (auth.uid(), 'bloodpressure',
          case TG_OP when 'INSERT' then 'bp_add' when 'UPDATE' then 'bp_edit' else 'bp_delete' end,
          case TG_OP when 'INSERT' then 'logged a blood pressure reading'
                     when 'UPDATE' then 'edited a blood pressure reading'
                     else 'deleted a blood pressure reading' end,
          to_char(w at time zone 'America/Chicago', 'Mon FMDD, YYYY FMHH12:MI AM'), 'database', 1);
  return null;
end $$;
revoke execute on function private.audit_bp() from public, anon, authenticated;
drop trigger if exists audit_bp on public.bp_readings;
create trigger audit_bp after insert or update or delete on public.bp_readings
  for each row execute function private.audit_bp();
