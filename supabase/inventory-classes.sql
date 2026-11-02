-- bellhive99.com - RESOURCES > Inventory + Maintenance, release 2 (261031.05): one module for
-- everything the family keeps up - Vehicles, Equipment, Home & Appliances, Pets - per Chris,
-- modeled on the _Allthing workbook (Data & Specifications, Maintenance - Automotive / Misc /
-- Home, Pets, Service Classification).
--
--  equipment.class          vehicle | equipment | home | pet  (the workbook's DATA TYPE A / OPE / R / P)
--  equipment_options.class  which class a Type / Service Category / Service belongs to (null = all)
--  equipment_options.parent_id   a Service's Service Category (two-level list, as on the
--                                workbook's Service Classification tab)
--  equipment_maintenance.service_category_id, purchased_from, part_info
--  new item fields: code, trim, series, nickname, sex, birth_date, address, purchased_from, financed_by

alter table public.equipment_options drop constraint if exists equipment_options_kind_check;
alter table public.equipment_options add constraint equipment_options_kind_check
  check (kind in ('category', 'type', 'status', 'service_category', 'service_type'));
alter table public.equipment_options add column if not exists class text
  check (class is null or class in ('vehicle', 'equipment', 'home', 'pet'));
alter table public.equipment_options add column if not exists parent_id uuid references public.equipment_options (id) on delete cascade;
drop index if exists public.equipment_options_label_uq;
create unique index if not exists equipment_options_label_uq on public.equipment_options
  (kind, coalesce(class, ''), coalesce(parent_id::text, ''), lower(btrim(label)));

alter table public.equipment add column if not exists class text not null default 'vehicle'
  check (class in ('vehicle', 'equipment', 'home', 'pet'));
alter table public.equipment
  add column if not exists code           text,
  add column if not exists trim_level     text,
  add column if not exists series         text,
  add column if not exists nickname       text,
  add column if not exists sex            text check (sex is null or sex in ('male', 'female')),
  add column if not exists birth_date     date,
  add column if not exists address        text,
  add column if not exists purchased_from text,
  add column if not exists financed_by    text;
create index if not exists equipment_class_idx on public.equipment (class);

alter table public.equipment_maintenance
  add column if not exists service_category_id uuid references public.equipment_options (id) on delete restrict,
  add column if not exists purchased_from text,
  add column if not exists part_info      text;

-- Option lists: the old single list is replaced (no items or entries use it yet).
delete from public.equipment_options where kind in ('category', 'type', 'service_type')
  and not exists (select 1 from public.equipment);

insert into public.equipment_options (kind, class, label, sort_order)
select 'type', c, l, n from (values
  ('vehicle','Automobile',1), ('vehicle','Pickup',2), ('vehicle','SUV',3), ('vehicle','Van',4), ('vehicle','Motorcycle',5),
  ('equipment','Lawn Mower',1), ('equipment','Riding Lawn Mower',2), ('equipment','Pressure Washer',3), ('equipment','Chain Saw',4),
  ('equipment','Generator',5), ('equipment','Trailer',6), ('equipment','Camper',7), ('equipment','Boat',8), ('equipment','ATV / UTV',9), ('equipment','Tool',10),
  ('home','House',1), ('home','Appliance',2), ('home','Clothes Dryer',3), ('home','Washer',4), ('home','HVAC',5), ('home','Water Heater',6), ('home','Roof',7),
  ('pet','Dog',1), ('pet','Cat',2)
) v (c, l, n)
on conflict do nothing;

-- Service categories (the workbook's SERVICE TYPE column), one list per class
insert into public.equipment_options (kind, class, label, sort_order)
select 'service_category', c, l, n from (values
  ('vehicle','Maintenance',1), ('vehicle','Mechanical Repair',2), ('vehicle','Collision Repair',3), ('vehicle','Aftermarket Upgrade',4),
  ('vehicle','Other',5), ('vehicle','Odometer Reading',6),
  ('equipment','Maintenance',1), ('equipment','Oil Change',2), ('equipment','Repair',3), ('equipment','Upgrade',4), ('equipment','Other',5),
  ('home','Plumbing',1), ('home','Electrical',2), ('home','HVAC',3), ('home','Appliance Repair',4), ('home','Internet / Cable',5),
  ('home','Roof / Exterior',6), ('home','Yard',7), ('home','Pest Control',8), ('home','Renovation',9), ('home','Other',10),
  ('pet','Annual / Wellness',1), ('pet','Illness / Injury',2), ('pet','Grooming',3), ('pet','Boarding',4), ('pet','Medication',5), ('pet','Other',6)
) v (c, l, n)
on conflict do nothing;

-- Services under each category (the workbook's Service Classification EXAMPLES column)
insert into public.equipment_options (kind, class, parent_id, label, sort_order)
select 'service_type', v.c, p.id, v.l, v.n
from (values
  ('vehicle','Maintenance','Oil Change',1), ('vehicle','Maintenance','Filter Replacement – Air/Oil/Cabin',2), ('vehicle','Maintenance','Battery Replacement',3),
  ('vehicle','Maintenance','Fluid Service (coolant, brake, trans)',4), ('vehicle','Maintenance','Tire Replacement',5), ('vehicle','Maintenance','Brake Service',6),
  ('vehicle','Maintenance','Scheduled Maintenance',7), ('vehicle','Maintenance','Tune-Up',8), ('vehicle','Maintenance','Belt/Hose Replacement',9),
  ('vehicle','Maintenance','Wipers',10), ('vehicle','Maintenance','Tire Rotation',11),
  ('vehicle','Mechanical Repair','Electrical Repair',1), ('vehicle','Mechanical Repair','Engine Repair',2), ('vehicle','Mechanical Repair','Transmission Repair',3),
  ('vehicle','Mechanical Repair','Drivetrain Repair',4), ('vehicle','Mechanical Repair','Suspension / Steering Work',5), ('vehicle','Mechanical Repair','Diagnostic Service',6),
  ('vehicle','Collision Repair','Body Repair – Collision',1), ('vehicle','Collision Repair','Paint & Body Work',2), ('vehicle','Collision Repair','Glass Repair/Replacement',3),
  ('vehicle','Collision Repair','Insurance Claim Repair',4), ('vehicle','Collision Repair','Accident-Related Repair',5),
  ('vehicle','Aftermarket Upgrade','Accessory Installation',1), ('vehicle','Aftermarket Upgrade','Tow Package Install',2), ('vehicle','Aftermarket Upgrade','Lighting Upgrade',3),
  ('vehicle','Aftermarket Upgrade','Audio/Tech Install',4),
  ('vehicle','Other','Inspection',1), ('vehicle','Other','Recall Service',2), ('vehicle','Other','Warranty Service',3), ('vehicle','Other','Registration / Emissions',4),
  ('equipment','Maintenance','Oil Change',1), ('equipment','Maintenance','Air Filter',2), ('equipment','Maintenance','Spark Plug',3), ('equipment','Maintenance','Blade Sharpen / Replace',4),
  ('equipment','Maintenance','Tires / Wheels',5), ('equipment','Maintenance','Belt',6), ('equipment','Maintenance','Winterize / Storage',7), ('equipment','Maintenance','Yearly Service',8),
  ('equipment','Repair','Starter / Pull Cord',1), ('equipment','Repair','Engine',2), ('equipment','Repair','Electrical',3),
  ('home','HVAC','Filter Change',1), ('home','HVAC','Service Call',2), ('home','Plumbing','Valve / Fixture',1), ('home','Plumbing','Leak',2),
  ('home','Appliance Repair','Belt',1), ('home','Appliance Repair','Part Replacement',2),
  ('pet','Annual / Wellness','Exam',1), ('pet','Annual / Wellness','Vaccinations',2), ('pet','Annual / Wellness','Rabies',3), ('pet','Annual / Wellness','Heartworm',4),
  ('pet','Annual / Wellness','Flea & Tick',5), ('pet','Illness / Injury','Exam',1), ('pet','Illness / Injury','Lab Work',2), ('pet','Illness / Injury','Medication',3)
) v (c, cat, l, n)
join public.equipment_options p on p.kind = 'service_category' and p.class = v.c and p.label = v.cat
on conflict do nothing;

-- Status: "Sold / Gone" also fits pets that have passed; rename it gently.
update public.equipment_options set label = 'Gone (sold, retired, passed)' where kind = 'status' and label = 'Sold / Gone';

-- audit wording: "item", not "vehicle"
create or replace function private.audit_vehicles()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when TG_OP <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when TG_OP <> 'DELETE' then to_jsonb(new) end;
  ign text[] := array['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'uploaded_at', 'uploaded_by', 'edited_at', 'profile_photo_id', 'rotation'];
  oc jsonb := null; nc jsonb := null; k text; changes text := null;
  veh text; typ text; detail text; ref text := null;
begin
  if uid is null then return null; end if;
  if pg_trigger_depth() > 1 then return null; end if;
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
    detail := case TG_OP when 'INSERT' then 'added ' || veh || ' to Inventory'
                         when 'DELETE' then 'deleted ' || veh || ' from Inventory'
                         else 'edited ' || veh || ': ' || changes end;
  else
    if TG_TABLE_NAME = 'equipment_maintenance' then
      select q.unit_number into veh from public.equipment q where q.id = (r->>'equipment_id')::uuid;
      ref := private.audit_day(r->>'service_date');
      typ := 'maint_' || lower(TG_OP);
      detail := case TG_OP when 'INSERT' then 'logged maintenance on ' || coalesce(veh, 'an item')
                           when 'DELETE' then 'deleted a maintenance entry on ' || coalesce(veh, 'an item')
                           else 'edited maintenance on ' || coalesce(veh, 'an item') || ': ' || changes end;
    elsif TG_TABLE_NAME = 'equipment_photos' then
      if TG_OP = 'UPDATE' then return null; end if;
      select q.unit_number into veh from public.equipment q where q.id = (r->>'equipment_id')::uuid;
      typ := 'vehicle_photo';
      detail := case TG_OP when 'INSERT' then 'added a photo link to ' else 'deleted a photo from ' end || coalesce(veh, 'an item') || ': ' || (r->>'filename');
    elsif TG_TABLE_NAME = 'equipment_maintenance_files' then
      select q.unit_number into veh from public.equipment_maintenance m join public.equipment q on q.id = m.equipment_id where m.id = (r->>'maintenance_id')::uuid;
      typ := 'maint_file';
      detail := case TG_OP when 'INSERT' then 'added an invoice link on ' else 'deleted an invoice from ' end || coalesce(veh, 'an item') || ': ' || (r->>'filename');
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
  raise warning 'inventory audit failed: %', sqlerrm;
  return null;
end $$;
revoke execute on function private.audit_vehicles() from public, anon, authenticated;
