-- bellhive99.com - detailed audit log (adds to audit-log.sql)
-- Applied to the bellhive99 Supabase project on Oct 31, 2026. Safe to re-run.
--
-- What this adds:
--   * before/after values on every logged change (old_values / new_values)
--   * where each entry came from (source): 'browser' = written by a page,
--     'database' = written by the database itself, 'server' = written by an edge function
--   * database triggers that log every add / edit / delete of workout data, trackers and
--     user profiles - these can't be skipped or faked from the browser
--   * sign-ins, password changes and password-reset requests logged straight from the
--     sign-in system (auth.users), not from the page
-- Bulk changes (more than 3 rows in one go, e.g. an import or deleting an exercise with all
-- its sets) are written as one summary entry with a row count instead of one entry per row.

alter table public.audit_log add column if not exists source     text not null default 'browser';
alter table public.audit_log add column if not exists old_values jsonb;
alter table public.audit_log add column if not exists new_values jsonb;
alter table public.audit_log add column if not exists row_count  int;
create index if not exists audit_log_type on public.audit_log (action_type, created_at desc);

-- Entries posted by a page are always marked 'browser' and always belong to the signed-in person.
create or replace function public.audit_log_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- posted straight from a page (not from another trigger): always 'browser'
  if coalesce(current_setting('role', true), '') in ('authenticated', 'anon') and pg_trigger_depth() <= 1 then
    new.source := 'browser';
  end if;
  if auth.uid() is not null then
    new.user_id := auth.uid();
    select coalesce(p.full_name, p.email), p.role into new.user_name, new.user_role
    from public.profiles p where p.id = auth.uid();
  elsif new.user_id is not null and new.user_name is null then
    select coalesce(p.full_name, p.email), p.role into new.user_name, new.user_role
    from public.profiles p where p.id = new.user_id;
  end if;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.audit_log_stamp() from public, anon, authenticated;

-- ---------- helpers ----------
create or replace function private.audit_label(tbl text, k text)
returns text language sql immutable as $$
  select coalesce(case tbl
    when 'sets' then case k when 'performed_on' then 'date' when 'performed_at' then 'time' when 'set_no' then 'set #'
                            when 'duration_sec' then 'seconds' when 'exercise_id' then 'exercise' when 'extra' then 'other fields' end
    when 'exercises' then case k when 'fields' then 'measures' when 'custom' then 'custom fields' when 'target' then 'target' when 'archived' then 'hidden' end
    when 'daily_metrics' then case k when 'agg' then 'weekly number' when 'archived' then 'hidden' end
    when 'profiles' then case k when 'full_name' then 'name' when 'active' then 'active' end
  end, replace(k, '_', ' '));
$$;

create or replace function private.audit_val(v jsonb)
returns text language sql immutable as $$
  select case when v is null or v = 'null'::jsonb then 'blank'
              when jsonb_typeof(v) = 'string' then left(v #>> '{}', 60)
              when jsonb_typeof(v) = 'number' then trim_scale((v #>> '{}')::numeric)::text
              else left(v::text, 60) end;
$$;

create or replace function private.audit_day(v text)
returns text language sql immutable as $$
  select case when v is null then null else to_char(v::date, 'Mon FMDD, YYYY') end;
$$;

-- one human sentence for a set: "10 reps x 135 lb"
create or replace function private.audit_set_text(j jsonb)
returns text language sql immutable as $$
  select coalesce(nullif(concat_ws(' x ',
    case when j->>'reps' is not null then (j->>'reps') || ' reps' end,
    case when j->>'weight' is not null then trim_scale((j->>'weight')::numeric)::text || ' lb' end,
    case when j->>'duration_sec' is not null then (j->>'duration_sec') || ' sec' end,
    case when j->>'distance' is not null then trim_scale((j->>'distance')::numeric)::text || ' mi' end), ''), 'no values');
$$;

-- ---------- one entry for one row ----------
create or replace function private.audit_row(tbl text, op text, o jsonb, n jsonb, uid uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  ignore text[] := array['id', 'user_id', 'created_at', 'updated_at', 'last_sign_in_at', 'email', 'must_change_password', 'sort'];
  oc jsonb := null; nc jsonb := null; changes text := null; k text;
  r jsonb := coalesce(n, o);
  typ text; detail text; ref text := null; mod text := 'workout'; nm text;
begin
  if op = 'UPDATE' then
    oc := '{}'; nc := '{}';
    for k in select jsonb_object_keys(n) loop
      if k = any(ignore) or (o -> k) is not distinct from (n -> k) then continue; end if;
      oc := oc || jsonb_build_object(k, o -> k);
      nc := nc || jsonb_build_object(k, n -> k);
      changes := concat_ws(', ', changes, audit_label(tbl, k) || ' ' || audit_val(o -> k) || ' -> ' || audit_val(n -> k));
    end loop;
    if nc = '{}' then return; end if;            -- nothing anyone would care about changed
  elsif op = 'INSERT' then nc := n - ignore;
  else oc := o - ignore;
  end if;

  if tbl = 'sets' then
    select name into nm from public.exercises where id = (r->>'exercise_id')::uuid;
    nm := coalesce(nm, '(removed exercise)');
    ref := audit_day(r->>'performed_on');
    typ := case op when 'INSERT' then 'set_add' when 'UPDATE' then 'set_edit' else 'set_delete' end;
    detail := case op
      when 'INSERT' then 'logged ' || nm || ' set ' || coalesce(r->>'set_no', '1') || ': ' || audit_set_text(n)
      when 'UPDATE' then 'edited ' || nm || ' set ' || coalesce(r->>'set_no', '1') || ': ' || changes
      else 'deleted ' || nm || ' set ' || coalesce(r->>'set_no', '1') || ' (' || audit_set_text(o) || ')' end;

  elsif tbl = 'daily_entries' then
    select name || case when unit <> '' then ' (' || unit || ')' else '' end into nm
    from public.daily_metrics where id = (r->>'metric_id')::uuid;
    nm := coalesce(nm, '(removed tracker)');
    ref := audit_day(r->>'entry_date');
    typ := case op when 'INSERT' then 'daily_add' when 'UPDATE' then 'daily_edit' else 'daily_delete' end;
    detail := case op
      when 'INSERT' then 'entered ' || nm || ': ' || audit_val(n->'value')
      when 'UPDATE' then 'changed ' || nm || ': ' || audit_val(o->'value') || ' -> ' || audit_val(n->'value')
      else 'cleared ' || nm || ' (was ' || audit_val(o->'value') || ')' end;

  elsif tbl = 'exercises' then
    nm := r->>'name';
    typ := case op when 'INSERT' then 'exercise_create' when 'UPDATE' then 'exercise_update' else 'exercise_delete' end;
    detail := case
      when op = 'INSERT' then 'added exercise ' || nm
      when op = 'DELETE' then 'deleted exercise ' || nm
      when nc ? 'archived' and (select count(*) from jsonb_object_keys(nc)) = 1
        then case when (n->>'archived')::boolean then 'hid exercise ' else 'showed exercise ' end || nm
      else 'edited exercise ' || nm || ': ' || changes end;

  elsif tbl = 'daily_metrics' then
    nm := r->>'name';
    typ := case op when 'INSERT' then 'tracker_create' when 'UPDATE' then 'tracker_update' else 'tracker_delete' end;
    detail := case
      when op = 'INSERT' then 'added daily tracker ' || nm
      when op = 'DELETE' then 'deleted daily tracker ' || nm
      when nc ? 'archived' and (select count(*) from jsonb_object_keys(nc)) = 1
        then case when (n->>'archived')::boolean then 'hid tracker ' else 'showed tracker ' end || nm
      else 'edited daily tracker ' || nm || ': ' || changes end;

  elsif tbl = 'profiles' then
    nm := coalesce(r->>'full_name', r->>'email');
    ref := r->>'email';
    if (r->>'id')::uuid = uid then
      mod := 'site'; typ := 'profile';
      detail := case op when 'DELETE' then 'removed own profile' else 'updated own profile: ' || coalesce(changes, 'new') end;
    else
      mod := 'admin';
      typ := case op when 'DELETE' then 'user_delete' else 'user_update' end;
      detail := case op when 'DELETE' then 'removed user ' || nm else 'updated user ' || nm || ': ' || coalesce(changes, 'new') end;
    end if;
  else
    return;
  end if;

  insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, old_values, new_values, row_count)
  values (uid, mod, typ, left(detail, 500), ref, 'database', oc, nc, 1);
end $$;

-- ---------- statement-level trigger: one call per insert/update/delete statement ----------
create or replace function private.audit_changes()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  uid uuid := auth.uid();
  tbl text := TG_TABLE_NAME;
  op text := TG_OP;
  cnt int;
  oj jsonb; nj jsonb;
  noun text; nouns text; typ text; first_day text; last_day text;
begin
  -- Changes made by the server (edge functions, sign-in system) are logged by those parts themselves.
  if uid is null then return null; end if;

  if op = 'DELETE' then select count(*) into cnt from old_rows;
  else select count(*) into cnt from new_rows; end if;
  if cnt = 0 then return null; end if;

  if cnt <= 3 then
    if op = 'INSERT' then
      for nj in select to_jsonb(x) from new_rows x loop perform audit_row(tbl, op, null, nj, uid); end loop;
    elsif op = 'DELETE' then
      for oj in select to_jsonb(x) from old_rows x loop perform audit_row(tbl, op, oj, null, uid); end loop;
    else
      for oj in select to_jsonb(x) from old_rows x loop
        if tbl = 'daily_entries' then
          select to_jsonb(x) into nj from new_rows x where to_jsonb(x)->>'metric_id' = oj->>'metric_id' and to_jsonb(x)->>'entry_date' = oj->>'entry_date';
        else
          select to_jsonb(x) into nj from new_rows x where to_jsonb(x)->>'id' = oj->>'id';
        end if;
        if nj is not null then perform audit_row(tbl, op, oj, nj, uid); end if;
      end loop;
    end if;
    return null;
  end if;

  -- bulk: one summary entry
  noun  := case tbl when 'sets' then 'set' when 'daily_entries' then 'daily entry' when 'exercises' then 'exercise'
                    when 'daily_metrics' then 'daily tracker' when 'profiles' then 'profile' else tbl end;
  nouns := case tbl when 'daily_entries' then 'daily entries' else noun || 's' end;
  typ := case tbl when 'sets' then 'set' when 'daily_entries' then 'daily' when 'exercises' then 'exercise'
                  when 'daily_metrics' then 'tracker' else 'user' end
      || case op when 'INSERT' then (case when tbl in ('exercises', 'daily_metrics') then '_create' else '_add' end)
                 when 'UPDATE' then (case when tbl in ('sets', 'daily_entries') then '_edit' else '_update' end)
                 else '_delete' end;
  if tbl = 'sets' then
    if op = 'DELETE' then select min(performed_on)::text, max(performed_on)::text into first_day, last_day from old_rows;
    else select min(performed_on)::text, max(performed_on)::text into first_day, last_day from new_rows; end if;
  elsif tbl = 'daily_entries' then
    if op = 'DELETE' then select min(entry_date)::text, max(entry_date)::text into first_day, last_day from old_rows;
    else select min(entry_date)::text, max(entry_date)::text into first_day, last_day from new_rows; end if;
  end if;

  insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, row_count)
  values (uid, case when tbl = 'profiles' then 'admin' else 'workout' end, typ,
          case op when 'INSERT' then 'added ' when 'UPDATE' then 'changed ' else 'deleted ' end || cnt || ' ' || nouns || ' at once',
          case when first_day is null then null
               when first_day = last_day then audit_day(first_day)
               else audit_day(first_day) || ' to ' || audit_day(last_day) end,
          'database', cnt);
  return null;
end $$;

-- attach to the tables (transition tables need one trigger per kind of change)
do $$
declare t text;
begin
  foreach t in array array['sets', 'daily_entries', 'exercises', 'daily_metrics', 'profiles'] loop
    execute format('drop trigger if exists audit_ins on public.%I', t);
    execute format('drop trigger if exists audit_upd on public.%I', t);
    execute format('drop trigger if exists audit_del on public.%I', t);
    if t <> 'profiles' then   -- new profiles are logged by the admin-users function
      execute format('create trigger audit_ins after insert on public.%I referencing new table as new_rows for each statement execute function private.audit_changes()', t);
    end if;
    execute format('create trigger audit_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function private.audit_changes()', t);
    execute format('create trigger audit_del after delete on public.%I referencing old table as old_rows for each statement execute function private.audit_changes()', t);
  end loop;
end $$;

-- ---------- sign-in system: sign-ins, password changes, reset requests ----------
create or replace function private.audit_auth_user()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, new_values)
    values (new.id, 'site', 'login', 'signed in', new.email, 'database',
            jsonb_build_object('method', coalesce(new.raw_app_meta_data->>'provider', 'email')));
  end if;
  if new.encrypted_password is distinct from old.encrypted_password and old.encrypted_password is not null
     and old.encrypted_password <> '' then
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source)
    values (new.id, 'site', 'password', 'password changed', new.email, 'database');
  end if;
  if new.recovery_sent_at is distinct from old.recovery_sent_at and new.recovery_sent_at is not null then
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source)
    values (new.id, 'site', 'password_reset', 'password reset email requested', new.email, 'database');
  end if;
  return null;
end $$;
drop trigger if exists audit_auth_user on auth.users;
create trigger audit_auth_user after update on auth.users
  for each row execute function private.audit_auth_user();

revoke execute on function private.audit_changes() from public, anon, authenticated;
revoke execute on function private.audit_row(text, text, jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function private.audit_auth_user() from public, anon, authenticated;

-- helper functions run with an empty search path (Supabase security advisor)
alter function private.audit_label(text, text) set search_path = '';
alter function private.audit_val(jsonb) set search_path = '';
alter function private.audit_day(text) set search_path = '';
alter function private.audit_set_text(jsonb) set search_path = '';
