-- bellhive99.com - Guest Book
-- Applied to the bellhive99 Supabase project on Oct 31, 2026. Safe to re-run.
-- Needs supabase/site-schema.sql and supabase/chat.sql first (profiles, private.is_admin, private.is_member).
--
-- Who can do what
--   * Anyone (signed out) can SIGN the guest book from the sign-in screen: name, where from, message.
--     They can't read it - the book itself is only shown to signed-in members.
--   * Members read every entry and sign as themselves (their name is filled in by the database).
--   * Members can delete their own entries; admins can hide/show or delete any entry.
--   * Guests are limited to 3 entries an hour from one internet address (only a salted hash of the
--     address is kept, for one day) and 30 guest entries an hour in total, to keep spam bots out.
--   * The database stamps the time, name and guest/member flag, so entries can't be back-dated or
--     signed as someone else from a page. Rows written from the SQL editor (like the import of the
--     old FrontPage guest log at the bottom) keep the values they're given.

create table if not exists public.guestbook_entries (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,   -- null = guest
  is_guest    boolean not null default true,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  location    text check (location is null or char_length(location) <= 80),
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  source      text not null default 'site' check (source in ('site', 'frontpage')),  -- frontpage = the 2000-01 guest log
  hidden      boolean not null default false
);
create index if not exists guestbook_entries_created on public.guestbook_entries (created_at desc);
create index if not exists guestbook_entries_user on public.guestbook_entries (user_id);

-- spam throttle for guests (not reachable from the API)
create table if not exists private.guestbook_throttle (
  at   timestamptz not null default now(),
  who  text not null
);
create index if not exists guestbook_throttle_at on private.guestbook_throttle (at);
create table if not exists private.guestbook_salt (salt text not null);
insert into private.guestbook_salt (salt)
select encode(extensions.gen_random_bytes(16), 'hex') where not exists (select 1 from private.guestbook_salt);
revoke all on private.guestbook_throttle, private.guestbook_salt from public, anon, authenticated;

-- ---------- stamp every entry posted from a page ----------
create or replace function public.guestbook_stamp()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  r text := coalesce(current_setting('role', true), '');
  ip text := '';
  v_who text;
  n int;
begin
  if r not in ('anon', 'authenticated') then return new; end if;   -- SQL editor / server key (imports)

  new.created_at := now();
  new.source := 'site';
  new.hidden := false;
  new.name := left(btrim(regexp_replace(coalesce(new.name, ''), '[[:cntrl:]]+', ' ', 'g')), 80);
  new.location := nullif(left(btrim(regexp_replace(coalesce(new.location, ''), '[[:cntrl:]]+', ' ', 'g')), 80), '');
  new.message := btrim(regexp_replace(replace(coalesce(new.message, ''), E'\r\n', E'\n'), E'[\\x01-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', '', 'g'));

  if auth.uid() is not null and private.is_member() then
    new.user_id := auth.uid();
    new.is_guest := false;
    select coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) into new.name
      from public.profiles p where p.id = auth.uid();
  else
    new.user_id := null;
    new.is_guest := true;
    begin
      ip := btrim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1));
    exception when others then ip := '';
    end;
    v_who := encode(extensions.digest((select s.salt from private.guestbook_salt s limit 1) || ip, 'sha256'), 'hex');
    delete from private.guestbook_throttle where at < now() - interval '1 day';
    select count(*) into n from private.guestbook_throttle t where t.who = v_who and t.at > now() - interval '1 hour';
    if n >= 3 then
      raise exception 'You have signed the guest book a few times already. Please try again in an hour.';
    end if;
    select count(*) into n from private.guestbook_throttle t where t.at > now() - interval '1 hour';
    if n >= 30 then
      raise exception 'The guest book is very busy right now. Please try again a little later.';
    end if;
    insert into private.guestbook_throttle (who) values (v_who);
  end if;
  return new;
end $$;
revoke execute on function public.guestbook_stamp() from public, anon, authenticated;
drop trigger if exists guestbook_stamp on public.guestbook_entries;
create trigger guestbook_stamp before insert on public.guestbook_entries
  for each row execute function public.guestbook_stamp();

-- ---------- Audit Log: signings, hides and deletes (written by the database) ----------
create or replace function private.audit_guestbook()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  r text := coalesce(current_setting('role', true), '');
begin
  if r not in ('anon', 'authenticated') then return null; end if;   -- imports from the SQL editor aren't logged
  if TG_OP = 'INSERT' then
    insert into public.audit_log (user_id, user_name, user_role, module, action_type, action_detail, item_reference, source, new_values, row_count)
    values (new.user_id,
            case when new.is_guest then new.name || ' (guest)' end,
            case when new.is_guest then 'guest' end,
            'guestbook',
            case when new.is_guest then 'guestbook_guest' else 'guestbook_sign' end,
            case when new.is_guest then 'guest ' || new.name || coalesce(' from ' || new.location, '') || ' signed the guest book'
                 else 'signed the guest book' end,
            left(new.message, 80), 'database',
            jsonb_strip_nulls(jsonb_build_object('name', new.name, 'location', new.location, 'message', left(new.message, 500))), 1);
  elsif TG_OP = 'UPDATE' then
    if new.hidden is not distinct from old.hidden then return null; end if;
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, old_values, new_values, row_count)
    values (auth.uid(), 'guestbook', case when new.hidden then 'guestbook_hide' else 'guestbook_show' end,
            case when new.hidden then 'hid ' else 'showed ' end || 'guest book entry by ' || new.name,
            left(new.message, 80), 'database', jsonb_build_object('hidden', old.hidden), jsonb_build_object('hidden', new.hidden), 1);
  else
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, old_values, row_count)
    values (auth.uid(), 'guestbook', 'guestbook_delete', 'deleted guest book entry by ' || old.name,
            to_char(old.created_at at time zone 'America/Chicago', 'Mon FMDD, YYYY'), 'database',
            jsonb_strip_nulls(jsonb_build_object('name', old.name, 'location', old.location, 'message', left(old.message, 500))), 1);
  end if;
  return null;
end $$;
revoke execute on function private.audit_guestbook() from public, anon, authenticated;
drop trigger if exists audit_guestbook on public.guestbook_entries;
create trigger audit_guestbook after insert or update or delete on public.guestbook_entries
  for each row execute function private.audit_guestbook();

-- ---------- permissions ----------
alter table public.guestbook_entries enable row level security;
revoke all on public.guestbook_entries from anon, authenticated;
grant insert (name, location, message) on public.guestbook_entries to anon, authenticated;
grant select, delete on public.guestbook_entries to authenticated;
grant update (hidden) on public.guestbook_entries to authenticated;

-- signing: the stamp trigger has already set every column, this just double-checks it
drop policy if exists "anyone can sign" on public.guestbook_entries;
create policy "anyone can sign" on public.guestbook_entries for insert to anon, authenticated
  with check (source = 'site' and not hidden
              and ((is_guest and user_id is null) or (not is_guest and user_id = (select auth.uid()))));
drop policy if exists "members read" on public.guestbook_entries;
create policy "members read" on public.guestbook_entries for select to authenticated
  using ((select private.is_member()) and (not hidden or (select private.is_admin())));
drop policy if exists "admins hide" on public.guestbook_entries;
create policy "admins hide" on public.guestbook_entries for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "delete own or admin" on public.guestbook_entries;
create policy "delete own or admin" on public.guestbook_entries for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- ---------- the original guest log (guestlog.htm, from the FrontPage form on message.htm) ----------
-- Times are the originals, Central time. Names come from how each note was signed.
insert into public.guestbook_entries (created_at, is_guest, name, message, source)
select v.created_at::timestamptz, true, v.name, v.message, 'frontpage'
from (values
  ('2000-07-29 12:25:22-05', 'Unsigned', 'Just testing.'),
  ('2000-07-29 12:28:42-05', 'Unsigned', 'and another test'),
  ('2000-07-29 12:50:36-05', 'Unsigned', 'third test'),
  ('2000-08-30 10:08:29-05', 'Steph', E'Hey Chris! I was here and thought I''d let you know! Just snoopin around! Yall have fun in Europe!!!! Or is it Urup? I forget! Steph'),
  ('2000-09-19 13:17:31-05', 'Glenda', E'Hi Chris and Kim,\n\nI''m still waiting to see your SCOTLAND PIX. Where are they!!!! How is radiology school, Kim? Love you lots!! Glenda'),
  ('2000-09-26 12:58:57-05', 'Carter', E'I enjoyed the pictures. I know yall had a great time. Carter The HUNK'),
  ('2000-11-09 14:26:55-06', 'Philip Ferrari III', E'Chris..Chris..Chris, Ya''ll definitely did the ''website thing'' up right! Hope things are going good for ya. Good to hear from you. BUT....all I realy want to know is....... Did you get to go to Italy? yeah\n\nSee ya,\n\nPhilip Ferrari III'),
  ('2001-01-15 14:43:36-06', 'Kim', E'Chris, you''re the most wonderful husband!!!\nThanks for supporting me through school.\n\n:0)')
) as v (created_at, name, message)
where not exists (select 1 from public.guestbook_entries where source = 'frontpage');
