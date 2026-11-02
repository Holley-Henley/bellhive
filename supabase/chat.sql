-- bellhive99.com - Chat (home page chat window + "something's going on" alerts)
-- Applied to the bellhive99 Supabase project on Oct 30, 2026. Safe to re-run.
-- Needs supabase/site-schema.sql first (profiles, private.is_admin).

-- Who may use chat: any signed-in account that is still active.
create or replace function private.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;
revoke execute on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  room         text not null default 'family',
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_name  text,
  body         text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_room_id on public.chat_messages (room, id desc);
create index if not exists chat_messages_user on public.chat_messages (user_id);

-- The server stamps who/when, so nobody can post as someone else or back-date a message.
-- The sender's name is copied in because members can't read each other's profiles.
create or replace function public.chat_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.user_id := auth.uid(); end if;
  new.created_at := now();
  new.body := btrim(new.body);
  select coalesce(nullif(btrim(full_name), ''), split_part(email, '@', 1)) into new.sender_name
    from public.profiles where id = new.user_id;
  return new;
end $$;
revoke execute on function public.chat_stamp() from public, anon, authenticated;
drop trigger if exists chat_stamp on public.chat_messages;
create trigger chat_stamp before insert on public.chat_messages
  for each row execute function public.chat_stamp();

alter table public.chat_messages enable row level security;
drop policy if exists "members read chat" on public.chat_messages;
create policy "members read chat" on public.chat_messages for select to authenticated
  using ((select private.is_member()));
drop policy if exists "members post as themselves" on public.chat_messages;
create policy "members post as themselves" on public.chat_messages for insert to authenticated
  with check ((select private.is_member()) and user_id = (select auth.uid()));
drop policy if exists "delete own or admin" on public.chat_messages;
create policy "delete own or admin" on public.chat_messages for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
-- no update policy: messages can't be edited, only deleted

grant select, insert, delete on public.chat_messages to authenticated;

-- Live updates: new and deleted messages are pushed to open pages.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- "Who's here" + "typing..." run on a private realtime channel named bh-chat,
-- so only signed-in, active members can see or send them.
drop policy if exists "members join bh-chat" on realtime.messages;
create policy "members join bh-chat" on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'bh-chat' and (select private.is_member()));
drop policy if exists "members send on bh-chat" on realtime.messages;
create policy "members send on bh-chat" on realtime.messages for insert to authenticated
  with check ((select realtime.topic()) = 'bh-chat' and (select private.is_member()));

-- Each person's "read up to" marker lives in user_prefs under key 'chat_last_read'
-- (value = last message id seen), which already only lets you read/write your own rows.
