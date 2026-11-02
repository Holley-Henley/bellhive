-- bellhive99.com - File Share (files kept in Dropbox, listed here)
-- Run once in the bellhive99 Supabase project -> SQL Editor. Safe to re-run.
--
-- Who can see a file: the person who sent it, the people it was sent to, or every
-- signed-in member when it was shared with "Everyone". Admins get no extra view -
-- a private share stays private, same as everyone's workout history.
--
-- Browsers can only READ these tables. Every change (new file, download, delete) goes
-- through the fileshare edge function, which checks the caller and talks to Dropbox.
-- The Dropbox connection itself lives in public.integration_secrets (name 'dropbox').

create table if not exists public.shared_files (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  sender_id        uuid not null references auth.users(id) on delete cascade,
  sender_name      text,
  file_name        text not null check (char_length(file_name) between 1 and 255),
  size_bytes       bigint,
  mime             text,
  note             text check (note is null or char_length(note) <= 1000),
  everyone         boolean not null default false,
  status           text not null default 'pending' check (status in ('pending', 'ready')),
  dropbox_path     text,
  announce         boolean not null default false,   -- post a line in the family chat when it's ready
  download_count   integer not null default 0,
  last_download_at timestamptz
);
alter table public.shared_files add column if not exists announce boolean not null default false;
create index if not exists shared_files_created_idx on public.shared_files (created_at desc);
create index if not exists shared_files_sender_idx on public.shared_files (sender_id);

-- the people a file was sent to (empty when it went to Everyone)
create table if not exists public.shared_file_recipients (
  file_id uuid not null references public.shared_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (file_id, user_id)
);
create index if not exists shared_file_recipients_user_idx on public.shared_file_recipients (user_id);

-- who downloaded what (lets the sender see "Emmy downloaded it")
create table if not exists public.shared_file_downloads (
  file_id       uuid not null references public.shared_files(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_name     text,
  downloaded_at timestamptz not null default now(),
  times         integer not null default 1,
  primary key (file_id, user_id)
);

-- can the signed-in user see this file? (security definer so the policies don't loop)
create or replace function private.can_see_file(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_member() and exists (
    select 1 from public.shared_files f
     where f.id = fid and f.status = 'ready'
       and (f.sender_id = auth.uid() or f.everyone
            or exists (select 1 from public.shared_file_recipients r where r.file_id = f.id and r.user_id = auth.uid())));
$$;
revoke all on function private.can_see_file(uuid) from public, anon;
grant execute on function private.can_see_file(uuid) to authenticated;

alter table public.shared_files enable row level security;
alter table public.shared_file_recipients enable row level security;
alter table public.shared_file_downloads enable row level security;

drop policy if exists "see files shared with me" on public.shared_files;
create policy "see files shared with me" on public.shared_files for select to authenticated
  using ((select private.can_see_file(id)));

drop policy if exists "see recipients of my files" on public.shared_file_recipients;
create policy "see recipients of my files" on public.shared_file_recipients for select to authenticated
  using ((select private.can_see_file(file_id)));

drop policy if exists "see downloads of my files" on public.shared_file_downloads;
create policy "see downloads of my files" on public.shared_file_downloads for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.shared_files f where f.id = file_id and f.sender_id = (select auth.uid())));

-- read-only from the browser; the edge function (server key) does all writes
revoke all on public.shared_files, public.shared_file_recipients, public.shared_file_downloads from anon, authenticated;
grant select on public.shared_files, public.shared_file_recipients, public.shared_file_downloads to authenticated;

-- the "Send to" list: names of active members (profiles themselves stay private)
create or replace function public.member_directory()
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as name
    from public.profiles p
   where p.active and private.is_member()
   order by 2;
$$;
revoke all on function public.member_directory() from public, anon;
grant execute on function public.member_directory() to authenticated;
