-- bellhive99.com - site-wide accounts (profiles, roles, active flag)
-- Run once in Supabase -> SQL Editor. Safe to re-run.
-- Run this BEFORE workout/sql/schema.sql (order doesn't strictly matter, but this is the site layer).

-- One profile per sign-in account.
create table if not exists public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  email                 text,
  full_name             text,
  phone                 text,
  role                  text not null default 'member' check (role in ('admin', 'member')),
  active                boolean not null default true,
  must_change_password  boolean not null default false,
  last_sign_in_at       timestamptz,
  created_at            timestamptz not null default now()
);

-- Is the caller an active admin? (security definer so policies can use it without recursion)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- New auth user -> profile. The very first account becomes the admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles where role = 'admin') then 'member' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep email + last sign-in in sync for the Users list.
create or replace function public.sync_user_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email, last_sign_in_at = new.last_sign_in_at where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, last_sign_in_at on auth.users
  for each row execute function public.sync_user_fields();

-- Members may edit their own name/phone and clear their own "must change password" flag,
-- but only admins can change role, active, or set the flag.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;  -- service role / admins
  new.role := old.role;
  new.active := old.active;
  new.email := old.email;
  new.last_sign_in_at := old.last_sign_in_at;
  if new.must_change_password and not old.must_change_password then new.must_change_password := false; end if;
  return new;
end $$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
  for each row execute function public.protect_profile_fields();

alter table public.profiles enable row level security;
drop policy if exists "read own or admin" on public.profiles;
create policy "read own or admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "update own or admin" on public.profiles;
create policy "update own or admin" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
-- inserts come from the trigger / edge function only; deletes cascade from auth.users

-- Backfill accounts created before this script ran; the earliest one becomes admin
-- if there isn't an admin yet.
insert into public.profiles (id, email, full_name, last_sign_in_at, created_at)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)), u.last_sign_in_at, u.created_at
from auth.users u
on conflict (id) do nothing;

update public.profiles set role = 'admin'
where id = (select id from public.profiles order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');
