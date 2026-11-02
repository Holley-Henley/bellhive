-- bellhive99.com - per-user permissions (ADMIN > Permissions)
-- Modeled on HHB Project Exchange's role_permissions table, but stored per user
-- instead of per tier. Controls what each person sees in the left menu and which
-- module pages they can open.
-- Needs site-schema.sql (profiles, private.is_admin) and audit-log.sql first. Safe to re-run.
-- Applied to the bellhive99 Supabase project on Nov 2, 2026.
--
-- permissions is a flat object of menu keys -> true/false, e.g.
--   {"workout": false, "audiobooks_library": true}
-- A key that isn't in the object uses its default from auth/perms.js (PERM_TREE), so a
-- new menu item only needs a new entry there - no migration. A user with no row at all
-- gets every default.
-- The ADMIN section is not stored here: it follows the Admin role on ADMIN > Users,
-- so an edit on this screen can never lock every admin out.

create table if not exists public.user_permissions (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.user_permissions enable row level security;
grant select, insert, update, delete on public.user_permissions to authenticated;

-- Everyone can read their own row (the menu needs it); admins can read all.
drop policy if exists "read own or admin" on public.user_permissions;
create policy "read own or admin" on public.user_permissions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
-- Only admins can change anyone's permissions, their own included.
drop policy if exists "admins write" on public.user_permissions;
create policy "admins write" on public.user_permissions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Stamp who/when on every save.
create or replace function private.user_permissions_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists user_permissions_touch on public.user_permissions;
create trigger user_permissions_touch before insert or update on public.user_permissions
  for each row execute function private.user_permissions_touch();

-- Database-side check, for RLS policies that want it later:
--   using ((select private.can_see('workout')))
-- Missing keys count as allowed (the defaults in PERM_TREE are all "on").
create or replace function private.can_see(k text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (p.permissions ->> k)::boolean from public.user_permissions p where p.user_id = uid), true);
$$;
revoke execute on function private.can_see(text, uuid) from public, anon;
grant execute on function private.can_see(text, uuid) to authenticated;

-- Audit Log: one entry per save, listing what was turned on / off.
create or replace function private.audit_user_permissions()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  o jsonb := case when TG_OP = 'INSERT' then '{}'::jsonb else old.permissions end;
  n jsonb := case when TG_OP = 'DELETE' then '{}'::jsonb else new.permissions end;
  uid uuid := case when TG_OP = 'DELETE' then old.user_id else new.user_id end;
  who text;
  turned_on text; turned_off text; detail text;
begin
  if auth.uid() is null then return null; end if;
  select coalesce(full_name, email) into who from public.profiles where id = uid;
  -- a missing key means "default" (on), so compare with that filled in
  with ks as (select jsonb_object_keys(o) k union select jsonb_object_keys(n)),
       d as (select k, coalesce((o ->> k)::boolean, true) was, coalesce((n ->> k)::boolean, true) now_ from ks)
  select string_agg(k, ', ' order by k) filter (where now_ and not was),
         string_agg(k, ', ' order by k) filter (where was and not now_)
    into turned_on, turned_off from d;
  if TG_OP = 'DELETE' then detail := 'reset permissions to defaults for ' || coalesce(who, 'a user');
  else detail := 'changed permissions for ' || coalesce(who, 'a user')
      || coalesce(': on ' || turned_on, '') || coalesce(case when turned_on is null then ': ' else '; ' end || 'off ' || turned_off, '');
  end if;
  if TG_OP <> 'DELETE' and turned_on is null and turned_off is null then return null; end if;
  insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, old_values, new_values, row_count)
  values (auth.uid(), 'admin', 'permissions_update', left(detail, 500), who, 'database',
          case when TG_OP = 'INSERT' then null else o end, case when TG_OP = 'DELETE' then null else n end, 1);
  return null;
end $$;
drop trigger if exists audit_user_permissions on public.user_permissions;
create trigger audit_user_permissions after insert or update or delete on public.user_permissions
  for each row execute function private.audit_user_permissions();

revoke execute on function private.user_permissions_touch() from public, anon, authenticated;
revoke execute on function private.audit_user_permissions() from public, anon, authenticated;

-- Live updates: the left menu re-draws as soon as an admin saves.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_permissions') then
    alter publication supabase_realtime add table public.user_permissions;
  end if;
end $$;
