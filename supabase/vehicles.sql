-- bellhive99.com - RESOURCES > Vehicles and Equipment (Inventory + Maintenance)
-- Cloned from HHB Project Exchange (Heavy Equipment & Vehicles, 261028.03-.10) and cut down
-- for the family site. Applied to the bellhive99 Supabase project Oct 31, 2026.
-- Needs site-schema.sql (profiles, private.is_admin) and chat.sql (private.is_member) first.
--
-- Who sees what (per Chris): a vehicle has an OWNER (a family member). Only the owner and
-- admins see it, and everything hangs off it - photos, notes, NHTSA recall marks,
-- maintenance entries and their invoices and notes. Members add vehicles for themselves;
-- admins can add for anyone and change the owner. The option lists (Category, Type,
-- Status, Service Type) are shared, and only admins change them.
--
-- Photos and invoices are stored in the site's Dropbox app folder (the File Share
-- connection) under /Vehicles/<vehicle id>/..., or are pasted Dropbox links.
-- Dropbox-stored rows (kind 'dropbox') are written only by the vehicles edge function,
-- which also hands out the short-lived links that show them; the browser can add
-- 'link' rows itself.
--
--   equipment_options               Category / Type / Status / Service Type lists
--   equipment                       one row per vehicle or piece of equipment
--   equipment_photos                gallery (profile picture = equipment.profile_photo_id)
--   equipment_notes                 notes on a vehicle
--   equipment_recalls               Done / Not Affected marks on NHTSA recall campaigns
--   equipment_maintenance           dated service entries
--   equipment_maintenance_services  Service Type checkboxes on an entry
--   equipment_maintenance_files     invoices / receipts on an entry
--   equipment_maintenance_notes     notes on an entry

-- ---------- access helper ----------
create or replace function private.eqp_can(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.active and (p.role = 'admin' or p.id = p_owner));
$$;
revoke execute on function private.eqp_can(uuid) from public, anon;
grant execute on function private.eqp_can(uuid) to authenticated;

-- ---------- 1. option lists ----------
create table if not exists public.equipment_options (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('category', 'type', 'status', 'service_type')),
  label       text not null check (length(btrim(label)) between 1 and 60),
  color       text check (color is null or color in ('green', 'blue', 'orange', 'red', 'gray', 'purple', 'honey')),
  sort_order  integer not null default 0,
  active      boolean not null default true,
  counts      boolean not null default true,   -- status: part of the "In Use" list (shown by default)
  created_at  timestamptz not null default now()
);
create unique index if not exists equipment_options_label_uq on public.equipment_options (kind, lower(btrim(label)));
alter table public.equipment_options enable row level security;
revoke all on public.equipment_options from public, anon;
grant select, insert, update, delete on public.equipment_options to authenticated;
drop policy if exists equipment_options_select on public.equipment_options;
create policy equipment_options_select on public.equipment_options for select to authenticated
  using ((select private.is_member()));
drop policy if exists equipment_options_admin on public.equipment_options;
create policy equipment_options_admin on public.equipment_options for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

insert into public.equipment_options (kind, label, color, sort_order, counts)
select * from (values
  ('category', 'Vehicle', null, 1, true), ('category', 'Equipment', null, 2, true), ('category', 'Trailer', null, 3, true),
  ('category', 'Recreational', null, 4, true), ('category', 'Other', null, 5, true),
  ('type', 'Car', null, 1, true), ('type', 'Pickup', null, 2, true), ('type', 'SUV', null, 3, true), ('type', 'Van', null, 4, true),
  ('type', 'Motorcycle', null, 5, true), ('type', 'Boat', null, 6, true), ('type', 'RV / Camper', null, 7, true),
  ('type', 'ATV / UTV', null, 8, true), ('type', 'Riding Mower', null, 9, true), ('type', 'Tractor', null, 10, true),
  ('type', 'Generator', null, 11, true), ('type', 'Trailer', null, 12, true),
  ('status', 'In Use', 'green', 1, true), ('status', 'Spare', 'blue', 2, true), ('status', 'In Shop', 'orange', 3, true),
  ('status', 'Out of Service', 'red', 4, true), ('status', 'Sold / Gone', 'gray', 5, false),
  ('service_type', 'Oil Change', null, 1, true), ('service_type', 'Tire Rotation', null, 2, true), ('service_type', 'Tires', null, 3, true),
  ('service_type', 'Filters', null, 4, true), ('service_type', 'Brakes', null, 5, true), ('service_type', 'Battery', null, 6, true),
  ('service_type', 'Wipers', null, 7, true), ('service_type', 'Alignment', null, 8, true), ('service_type', 'Fluids', null, 9, true),
  ('service_type', 'Inspection / Tag', null, 10, true), ('service_type', 'Recall Repair', null, 11, true), ('service_type', 'Repair', null, 12, true)
) v (kind, label, color, sort_order, counts)
where not exists (select 1 from public.equipment_options);

-- ---------- 2. vehicles ----------
create table if not exists public.equipment (
  id                   uuid primary key default gen_random_uuid(),
  unit_number          text not null check (length(btrim(unit_number)) between 1 and 60),  -- the vehicle's name ("Kim's Tahoe")
  owner_id             uuid default auth.uid() references public.profiles (id) on delete set null,
  category_id          uuid references public.equipment_options (id) on delete restrict,
  type_id              uuid references public.equipment_options (id) on delete restrict,
  status_id            uuid references public.equipment_options (id) on delete restrict,
  year                 integer check (year is null or year between 1900 and 2100),
  make                 text,
  model                text,
  color                text,
  vin                  text,
  engine               text,
  specifications       text,
  meter_type           text not null default 'miles' check (meter_type in ('miles', 'hours', 'both', 'none')),
  odometer             numeric(12,1) check (odometer is null or odometer >= 0),
  hours                numeric(12,1) check (hours is null or hours >= 0),
  meter_date           date,
  license_plate        text,
  registration_expires date,
  insurance            text,
  ownership            text check (ownership in ('owned', 'financed', 'leased')),
  purchase_date        date,
  purchase_price       numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  profile_photo_id     uuid,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid default auth.uid()
);
create unique index if not exists equipment_name_uq on public.equipment (owner_id, lower(btrim(unit_number)));
create unique index if not exists equipment_vin_uq on public.equipment (upper(btrim(vin))) where vin is not null and btrim(vin) <> '';
create index if not exists equipment_owner_idx on public.equipment (owner_id);

alter table public.equipment enable row level security;
revoke all on public.equipment from public, anon;
grant select, insert, update, delete on public.equipment to authenticated;
drop policy if exists equipment_select on public.equipment;
create policy equipment_select on public.equipment for select to authenticated using (private.eqp_can(owner_id));
drop policy if exists equipment_insert on public.equipment;
create policy equipment_insert on public.equipment for insert to authenticated with check (private.eqp_can(owner_id));
drop policy if exists equipment_update on public.equipment;
create policy equipment_update on public.equipment for update to authenticated
  using (private.eqp_can(owner_id)) with check (private.eqp_can(owner_id));
drop policy if exists equipment_delete on public.equipment;
create policy equipment_delete on public.equipment for delete to authenticated using (private.eqp_can(owner_id));

create or replace function private.equipment_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), old.updated_by);
  end if;
  new.unit_number := btrim(new.unit_number);
  new.vin := nullif(upper(btrim(coalesce(new.vin, ''))), '');
  return new;
end $$;
revoke execute on function private.equipment_touch() from public, anon, authenticated;
drop trigger if exists equipment_touch on public.equipment;
create trigger equipment_touch before insert or update on public.equipment
  for each row execute function private.equipment_touch();

-- ---------- 3. photos ----------
create table if not exists public.equipment_photos (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references public.equipment (id) on delete cascade,
  kind          text not null default 'link' check (kind in ('dropbox', 'link')),
  filename      text not null,
  storage_path  text not null,   -- dropbox: path in the app folder; link: the pasted Dropbox URL
  file_size     bigint,
  content_type  text,
  rotation      smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  uploaded_by   uuid default auth.uid(),
  uploaded_at   timestamptz not null default now()
);
create index if not exists equipment_photos_unit_idx on public.equipment_photos (equipment_id, uploaded_at);
do $$ begin
  alter table public.equipment add constraint equipment_profile_photo_fk
    foreign key (profile_photo_id) references public.equipment_photos (id) on delete set null;
exception when duplicate_object then null; end $$;

alter table public.equipment_photos enable row level security;
revoke all on public.equipment_photos from public, anon, authenticated;
grant select, insert, delete on public.equipment_photos to authenticated;
grant update (rotation, filename) on public.equipment_photos to authenticated;
drop policy if exists equipment_photos_select on public.equipment_photos;
create policy equipment_photos_select on public.equipment_photos for select to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_photos_insert on public.equipment_photos;
create policy equipment_photos_insert on public.equipment_photos for insert to authenticated
  with check (kind = 'link' and storage_path ~* '^https://' and exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_photos_update on public.equipment_photos;
create policy equipment_photos_update on public.equipment_photos for update to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id))
  with check (exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_photos_delete on public.equipment_photos;
create policy equipment_photos_delete on public.equipment_photos for delete to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id));

-- The profile picture must be one of the vehicle's own photos.
create or replace function private.equipment_profile_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_photo_id is not null and not exists
     (select 1 from public.equipment_photos p where p.id = new.profile_photo_id and p.equipment_id = new.id) then
    raise exception 'That photo is not in this vehicle''s gallery';
  end if;
  return new;
end $$;
revoke execute on function private.equipment_profile_check() from public, anon, authenticated;
drop trigger if exists equipment_profile_check on public.equipment;
create trigger equipment_profile_check before insert or update of profile_photo_id on public.equipment
  for each row execute function private.equipment_profile_check();

-- ---------- 4. notes (vehicle and maintenance entry share one shape) ----------
create table if not exists public.equipment_notes (
  id            uuid primary key default gen_random_uuid(),
  equipment_id  uuid not null references public.equipment (id) on delete cascade,
  user_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  user_name     text,
  note_text     text not null check (length(btrim(note_text)) between 1 and 5000),
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index if not exists equipment_notes_unit_idx on public.equipment_notes (equipment_id, created_at);

-- ---------- 5. recall marks ----------
create table if not exists public.equipment_recalls (
  id               uuid primary key default gen_random_uuid(),
  equipment_id     uuid not null references public.equipment (id) on delete cascade,
  campaign_number  text not null check (campaign_number ~ '^[0-9A-Z]{6,12}$'),
  status           text not null check (status in ('done', 'not_affected')),
  note             text,
  checked_by       uuid default auth.uid(),
  checked_at       timestamptz not null default now(),
  unique (equipment_id, campaign_number)
);
alter table public.equipment_recalls enable row level security;
revoke all on public.equipment_recalls from public, anon;
grant select, insert, update, delete on public.equipment_recalls to authenticated;
drop policy if exists equipment_recalls_all on public.equipment_recalls;
create policy equipment_recalls_all on public.equipment_recalls for all to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id))
  with check (exists (select 1 from public.equipment q where q.id = equipment_id));

-- ---------- 6. maintenance ----------
create table if not exists public.equipment_maintenance (
  id                 uuid primary key default gen_random_uuid(),
  equipment_id       uuid not null references public.equipment (id) on delete cascade,
  service_date       date not null check (service_date between '1900-01-01' and '2100-12-31'),
  odometer           numeric(12,1) check (odometer is null or odometer >= 0),
  hours              numeric(12,1) check (hours is null or hours >= 0),
  work_performed     text,
  performed_by_name  text,     -- shop or person, typed (suggestions come from earlier entries + family)
  performed_by_user  uuid references public.profiles (id) on delete set null,   -- when it was a family member
  cost               numeric(12,2) check (cost is null or cost >= 0),
  invoice_number     text,
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid default auth.uid()
);
create index if not exists equipment_maintenance_unit_idx on public.equipment_maintenance (equipment_id, service_date);
alter table public.equipment_maintenance enable row level security;
revoke all on public.equipment_maintenance from public, anon;
grant select, insert, update, delete on public.equipment_maintenance to authenticated;
drop policy if exists equipment_maintenance_all on public.equipment_maintenance;
create policy equipment_maintenance_all on public.equipment_maintenance for all to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id))
  with check (exists (select 1 from public.equipment q where q.id = equipment_id));

create or replace function private.equipment_maint_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), old.updated_by);
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  if new.performed_by_user is not null then
    select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into new.performed_by_name
      from public.profiles p where p.id = new.performed_by_user;
  end if;
  new.performed_by_name := nullif(btrim(coalesce(new.performed_by_name, '')), '');
  new.invoice_number := nullif(btrim(coalesce(new.invoice_number, '')), '');
  new.work_performed := nullif(btrim(coalesce(new.work_performed, '')), '');
  return new;
end $$;
revoke execute on function private.equipment_maint_touch() from public, anon, authenticated;
drop trigger if exists equipment_maint_touch on public.equipment_maintenance;
create trigger equipment_maint_touch before insert or update on public.equipment_maintenance
  for each row execute function private.equipment_maint_touch();

-- A reading moves the vehicle's meter forward when the entry is the newest reading.
create or replace function private.equipment_maint_meter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.odometer is null and new.hours is null then return null; end if;
  update public.equipment q
     set odometer   = coalesce(new.odometer, q.odometer),
         hours      = coalesce(new.hours, q.hours),
         meter_date = new.service_date
   where q.id = new.equipment_id
     and (q.meter_date is null or new.service_date >= q.meter_date);
  return null;
exception when others then
  raise warning 'equipment meter update failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function private.equipment_maint_meter() from public, anon, authenticated;
drop trigger if exists equipment_maint_meter on public.equipment_maintenance;
create trigger equipment_maint_meter after insert or update of service_date, odometer, hours on public.equipment_maintenance
  for each row execute function private.equipment_maint_meter();

create table if not exists public.equipment_maintenance_services (
  maintenance_id uuid not null references public.equipment_maintenance (id) on delete cascade,
  option_id      uuid not null references public.equipment_options (id) on delete restrict,
  primary key (maintenance_id, option_id)
);
alter table public.equipment_maintenance_services enable row level security;
revoke all on public.equipment_maintenance_services from public, anon, authenticated;
grant select, insert, delete on public.equipment_maintenance_services to authenticated;
drop policy if exists equipment_maintenance_services_all on public.equipment_maintenance_services;
create policy equipment_maintenance_services_all on public.equipment_maintenance_services for all to authenticated
  using (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id))
  with check (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));

create table if not exists public.equipment_maintenance_files (
  id              uuid primary key default gen_random_uuid(),
  maintenance_id  uuid not null references public.equipment_maintenance (id) on delete cascade,
  kind            text not null default 'link' check (kind in ('dropbox', 'link')),
  filename        text not null,
  storage_path    text not null,
  file_size       bigint,
  content_type    text,
  uploaded_by     uuid default auth.uid(),
  uploaded_at     timestamptz not null default now()
);
create index if not exists equipment_maintenance_files_m_idx on public.equipment_maintenance_files (maintenance_id);
alter table public.equipment_maintenance_files enable row level security;
revoke all on public.equipment_maintenance_files from public, anon, authenticated;
grant select, insert, delete on public.equipment_maintenance_files to authenticated;
drop policy if exists equipment_maintenance_files_select on public.equipment_maintenance_files;
create policy equipment_maintenance_files_select on public.equipment_maintenance_files for select to authenticated
  using (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));
drop policy if exists equipment_maintenance_files_insert on public.equipment_maintenance_files;
create policy equipment_maintenance_files_insert on public.equipment_maintenance_files for insert to authenticated
  with check (kind = 'link' and storage_path ~* '^https://' and exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));
drop policy if exists equipment_maintenance_files_delete on public.equipment_maintenance_files;
create policy equipment_maintenance_files_delete on public.equipment_maintenance_files for delete to authenticated
  using (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));

create table if not exists public.equipment_maintenance_notes (
  id              uuid primary key default gen_random_uuid(),
  maintenance_id  uuid not null references public.equipment_maintenance (id) on delete cascade,
  user_id         uuid default auth.uid() references public.profiles (id) on delete set null,
  user_name       text,
  note_text       text not null check (length(btrim(note_text)) between 1 and 5000),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);
create index if not exists equipment_maintenance_notes_m_idx on public.equipment_maintenance_notes (maintenance_id, created_at);

-- notes: read with the vehicle / entry; write your own; edit or delete your own (admins: any)
alter table public.equipment_notes enable row level security;
alter table public.equipment_maintenance_notes enable row level security;
revoke all on public.equipment_notes, public.equipment_maintenance_notes from public, anon;
grant select, insert, update, delete on public.equipment_notes, public.equipment_maintenance_notes to authenticated;
drop policy if exists equipment_notes_select on public.equipment_notes;
create policy equipment_notes_select on public.equipment_notes for select to authenticated
  using (exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_notes_insert on public.equipment_notes;
create policy equipment_notes_insert on public.equipment_notes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_notes_change on public.equipment_notes;
create policy equipment_notes_change on public.equipment_notes for update to authenticated
  using ((user_id = (select auth.uid()) or (select private.is_admin())) and exists (select 1 from public.equipment q where q.id = equipment_id))
  with check (exists (select 1 from public.equipment q where q.id = equipment_id));
drop policy if exists equipment_notes_delete on public.equipment_notes;
create policy equipment_notes_delete on public.equipment_notes for delete to authenticated
  using ((user_id = (select auth.uid()) or (select private.is_admin())) and exists (select 1 from public.equipment q where q.id = equipment_id));

drop policy if exists equipment_maintenance_notes_select on public.equipment_maintenance_notes;
create policy equipment_maintenance_notes_select on public.equipment_maintenance_notes for select to authenticated
  using (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));
drop policy if exists equipment_maintenance_notes_insert on public.equipment_maintenance_notes;
create policy equipment_maintenance_notes_insert on public.equipment_maintenance_notes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));
drop policy if exists equipment_maintenance_notes_change on public.equipment_maintenance_notes;
create policy equipment_maintenance_notes_change on public.equipment_maintenance_notes for update to authenticated
  using ((user_id = (select auth.uid()) or (select private.is_admin())) and exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id))
  with check (exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));
drop policy if exists equipment_maintenance_notes_delete on public.equipment_maintenance_notes;
create policy equipment_maintenance_notes_delete on public.equipment_maintenance_notes for delete to authenticated
  using ((user_id = (select auth.uid()) or (select private.is_admin())) and exists (select 1 from public.equipment_maintenance m where m.id = maintenance_id));

-- note author name + edit stamp, set by the server
create or replace function private.equipment_note_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into new.user_name from public.profiles p where p.id = new.user_id;
    new.created_at := now();
    new.edited_at := null;
  else
    new.user_id := old.user_id; new.user_name := old.user_name; new.created_at := old.created_at;
    if new.note_text is distinct from old.note_text then new.edited_at := now(); end if;
  end if;
  new.note_text := btrim(new.note_text);
  return new;
end $$;
revoke execute on function private.equipment_note_stamp() from public, anon, authenticated;
drop trigger if exists equipment_note_stamp on public.equipment_notes;
create trigger equipment_note_stamp before insert or update on public.equipment_notes
  for each row execute function private.equipment_note_stamp();
drop trigger if exists equipment_note_stamp on public.equipment_maintenance_notes;
create trigger equipment_note_stamp before insert or update on public.equipment_maintenance_notes
  for each row execute function private.equipment_note_stamp();

-- ---------- 7. audit log (module 'vehicles') ----------
create or replace function private.audit_vehicles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when TG_OP <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when TG_OP <> 'DELETE' then to_jsonb(new) end;
  ign text[] := array['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'uploaded_at', 'uploaded_by', 'edited_at', 'profile_photo_id', 'rotation'];
  oc jsonb := null; nc jsonb := null; k text; changes text := null;
  veh text; typ text; detail text; ref text := null; noun text;
begin
  if uid is null then return null; end if;   -- the edge function logs its own changes
  if pg_trigger_depth() > 1 then return null; end if;   -- meter moved forward by a maintenance entry
  if TG_OP = 'UPDATE' then
    oc := '{}'; nc := '{}';
    for k in select jsonb_object_keys(n) loop
      if k = any(ign) or (o -> k) is not distinct from (n -> k) then continue; end if;
      oc := oc || jsonb_build_object(k, o -> k); nc := nc || jsonb_build_object(k, n -> k);
      changes := concat_ws(', ', changes, replace(replace(k, '_id', ''), '_', ' ') || ' ' || private.audit_val(o -> k) || ' -> ' || private.audit_val(n -> k));
    end loop;
    if nc = '{}' then return null; end if;
  elsif TG_OP = 'INSERT' then nc := n - ign;
  else oc := o - ign;
  end if;

  if TG_TABLE_NAME = 'equipment' then
    veh := r->>'unit_number';
    typ := 'vehicle_' || lower(TG_OP);
    detail := case TG_OP when 'INSERT' then 'added vehicle ' || veh
                         when 'DELETE' then 'deleted vehicle ' || veh
                         else 'edited vehicle ' || veh || ': ' || changes end;
  else
    if TG_TABLE_NAME = 'equipment_maintenance' then
      select q.unit_number into veh from public.equipment q where q.id = (r->>'equipment_id')::uuid;
      ref := private.audit_day(r->>'service_date');
      typ := 'maint_' || lower(TG_OP);
      detail := case TG_OP when 'INSERT' then 'logged maintenance on ' || coalesce(veh, 'a vehicle')
                           when 'DELETE' then 'deleted a maintenance entry on ' || coalesce(veh, 'a vehicle')
                           else 'edited maintenance on ' || coalesce(veh, 'a vehicle') || ': ' || changes end;
    elsif TG_TABLE_NAME = 'equipment_photos' then
      if TG_OP = 'UPDATE' then return null; end if;   -- rotations
      select q.unit_number into veh from public.equipment q where q.id = (r->>'equipment_id')::uuid;
      typ := 'vehicle_photo';
      detail := case TG_OP when 'INSERT' then 'added a photo link to ' else 'deleted a photo from ' end || coalesce(veh, 'a vehicle') || ': ' || (r->>'filename');
    elsif TG_TABLE_NAME = 'equipment_maintenance_files' then
      select q.unit_number into veh from public.equipment_maintenance m join public.equipment q on q.id = m.equipment_id where m.id = (r->>'maintenance_id')::uuid;
      typ := 'maint_file';
      detail := case TG_OP when 'INSERT' then 'added an invoice link on ' else 'deleted an invoice from ' end || coalesce(veh, 'a vehicle') || ': ' || (r->>'filename');
    elsif TG_TABLE_NAME = 'equipment_recalls' then
      select q.unit_number into veh from public.equipment q where q.id = (r->>'equipment_id')::uuid;
      typ := 'vehicle_recall';
      detail := case TG_OP when 'DELETE' then 'cleared the mark on recall ' || (r->>'campaign_number')
                           else 'marked recall ' || (r->>'campaign_number') || ' ' || case r->>'status' when 'done' then 'Done' else 'Not Affected' end end
                || ' for ' || coalesce(veh, 'a vehicle');
    else return null;
    end if;
  end if;
  insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, old_values, new_values, row_count)
  values (uid, 'vehicles', typ, left(detail, 500), coalesce(ref, veh), 'database', oc, nc, 1);
  return null;
exception when others then
  raise warning 'vehicles audit failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function private.audit_vehicles() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['equipment', 'equipment_maintenance', 'equipment_photos', 'equipment_maintenance_files', 'equipment_recalls'] loop
    execute format('drop trigger if exists audit_vehicles on public.%I', t);
    execute format('create trigger audit_vehicles after insert or update or delete on public.%I for each row execute function private.audit_vehicles()', t);
  end loop;
end $$;
