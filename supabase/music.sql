-- bellhive99.com - MUSIC > Library
-- Needs site-schema.sql (profiles), permissions.sql (user_permissions) and smugmug.sql
-- (integration_secrets) first. Safe to re-run.
--
-- The music lives in Dropbox under /_Media/Music. Each folder directly inside it is its own
-- LIBRARY (/_Media/Music/Music, /_Media/Music/_Streamripper, ...; any depth below that). Every
-- row carries `library` - the library folder's name in lower case - so libraries never mix;
-- MUSIC > Library shows one at a time with a picker (default: Music). The music
-- edge function (supabase/functions/music) scans it with the read-only Media connection,
-- reads each file's own tags (ID3, FLAC/Vorbis, MP4, ...), falls back to the folder and file
-- names, and writes the results here. MusicBrainz (an open music database) can fill in what
-- the tags don't have, and Cover Art Archive supplies album covers.
--
-- Who sees what: the whole library is SHARED. Anyone active whose ADMIN > Permissions has
-- Music > Library switched on can read every row (and so play it through the edge function).
-- It is OFF until an admin turns it on. Browsers never write these tables - only the edge
-- function does, with the service key, for admins (Scan Dropbox, Match Online).

create schema if not exists private;

/* ---------- one row per audio file ---------- */
create table if not exists public.music_tracks (
  id               uuid primary key default gen_random_uuid(),
  library          text not null default 'music',  -- the library folder, lower case (music_libraries)
  path             text not null,                 -- Dropbox path (display case)
  path_lower       text not null unique,          -- Dropbox path_lower: the match key for rescans
  content_hash     text,                          -- Dropbox content_hash: changes when the file does
  size             bigint,
  modified         timestamptz,
  ext              text,                          -- mp3, flac, m4a, ...
  title            text,
  artist           text,
  album_artist     text,
  album            text,
  track_no         integer,
  track_total      integer,
  disc_no          integer,
  disc_total       integer,
  year             integer,
  genre            text,
  composer         text,
  duration_seconds numeric(10, 2),
  bitrate          integer,                       -- kbps
  sample_rate      integer,                       -- Hz
  bits             integer,                       -- bit depth (lossless)
  channels         integer,
  has_art          boolean not null default false,  -- a picture is embedded in the file
  album_key        text not null,                 -- groups tracks into albums (see the edge function)
  tag_source       text not null default 'tags' check (tag_source in ('tags', 'filename', 'online')),
  indexed_at       timestamptz not null default now()
);
create index if not exists music_tracks_album_idx on public.music_tracks (album_key);
create index if not exists music_tracks_artist_idx on public.music_tracks (artist);

/* ---------- album extras: a MusicBrainz match and its cover ---------- */
create table if not exists public.music_albums (
  library             text not null default 'music',
  album_key           text not null,
  mb_status           text check (mb_status in ('matched', 'none')),   -- none = looked up, nothing close enough
  mb_release_id       text,
  mb_release_group_id text,
  mb_title            text,
  mb_artist           text,
  mb_year             integer,
  mb_genre            text,
  cover_url           text,                         -- Cover Art Archive front image
  checked_at          timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (library, album_key)                  -- the same album key can be in two libraries
);

/* ---------- picture files in the music folders (cover.jpg, folder.jpg, ...) ---------- */
create table if not exists public.music_folders (
  folder_lower text primary key,                    -- Dropbox folder (path_lower)
  library      text not null default 'music',
  folder       text not null,
  art_path     text not null                        -- the best picture file in it
);
create index if not exists music_folders_art_idx on public.music_folders (art_path);

/* ---------- the libraries: one per folder directly inside the music root ---------- */
create table if not exists public.music_libraries (
  library    text primary key,                      -- folder name, lower case (the key on every row above)
  name       text not null,                         -- folder name as Dropbox shows it
  folder     text not null,                         -- full Dropbox path
  files      integer not null default 0,            -- music files found by the last scan
  scanned_at timestamptz
);

/* ---------- upgrade a database made before libraries existed (safe to re-run) ---------- */
alter table public.music_tracks  add column if not exists library text not null default 'music';
alter table public.music_albums  add column if not exists library text not null default 'music';
alter table public.music_folders add column if not exists library text not null default 'music';
-- rows saved before came from /_Media/Music/<library>/...: take the library from the path
update public.music_tracks set library = split_part(path_lower, '/', 4)
 where path_lower like '/_media/music/%/%' and library <> split_part(path_lower, '/', 4);
update public.music_folders set library = split_part(folder_lower, '/', 4)
 where folder_lower like '/_media/music/%' and split_part(folder_lower, '/', 4) <> ''
   and library <> split_part(folder_lower, '/', 4);
do $$ begin
  if (select array_length(conkey, 1) from pg_constraint
       where conrelid = 'public.music_albums'::regclass and contype = 'p') = 1 then
    alter table public.music_albums drop constraint music_albums_pkey;
    alter table public.music_albums add constraint music_albums_pkey primary key (library, album_key);
  end if;
end $$;
insert into public.music_libraries (library, name, folder, files, scanned_at)
select t.library, min(split_part(t.path, '/', 4)), '/_Media/Music/' || min(split_part(t.path, '/', 4)), count(*), max(t.indexed_at)
  from public.music_tracks t
 where t.path_lower like '/_media/music/%/%'
 group by t.library
on conflict (library) do nothing;
create index if not exists music_tracks_library_idx on public.music_tracks (library, path_lower);
create index if not exists music_folders_library_idx on public.music_folders (library);

/* ---------- who can read: active + Music Library switched on (admins always) ---------- */
create or replace function private.music_can_read()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.active
       and (p.role = 'admin'
            or coalesce((select (u.permissions ->> 'music_library')::boolean
                           from public.user_permissions u where u.user_id = p.id), false)));
$$;
revoke all on function private.music_can_read() from public, anon;
grant execute on function private.music_can_read() to authenticated;

alter table public.music_tracks enable row level security;
alter table public.music_albums enable row level security;
alter table public.music_folders enable row level security;
alter table public.music_libraries enable row level security;
revoke all on public.music_tracks, public.music_albums, public.music_folders, public.music_libraries from anon, authenticated;
grant select on public.music_tracks, public.music_albums, public.music_folders, public.music_libraries to authenticated;

drop policy if exists music_tracks_read on public.music_tracks;
create policy music_tracks_read on public.music_tracks for select to authenticated
  using ((select private.music_can_read()));
drop policy if exists music_albums_read on public.music_albums;
create policy music_albums_read on public.music_albums for select to authenticated
  using ((select private.music_can_read()));
drop policy if exists music_folders_read on public.music_folders;
create policy music_folders_read on public.music_folders for select to authenticated
  using ((select private.music_can_read()));
drop policy if exists music_libraries_read on public.music_libraries;
create policy music_libraries_read on public.music_libraries for select to authenticated
  using ((select private.music_can_read()));
