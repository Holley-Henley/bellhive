-- bellhive99.com - MUSIC > Library
-- Needs site-schema.sql (profiles), permissions.sql (user_permissions) and smugmug.sql
-- (integration_secrets) first. Safe to re-run.
--
-- The music lives in Dropbox under /_Media/Music/Music (any depth of sub folders). The music
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
  album_key           text primary key,
  mb_status           text check (mb_status in ('matched', 'none')),   -- none = looked up, nothing close enough
  mb_release_id       text,
  mb_release_group_id text,
  mb_title            text,
  mb_artist           text,
  mb_year             integer,
  mb_genre            text,
  cover_url           text,                         -- Cover Art Archive front image
  checked_at          timestamptz,
  updated_at          timestamptz not null default now()
);

/* ---------- picture files in the music folders (cover.jpg, folder.jpg, ...) ---------- */
create table if not exists public.music_folders (
  folder_lower text primary key,                    -- Dropbox folder (path_lower)
  folder       text not null,
  art_path     text not null                        -- the best picture file in it
);
create index if not exists music_folders_art_idx on public.music_folders (art_path);

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
revoke all on public.music_tracks, public.music_albums, public.music_folders from anon, authenticated;
grant select on public.music_tracks, public.music_albums, public.music_folders to authenticated;

drop policy if exists music_tracks_read on public.music_tracks;
create policy music_tracks_read on public.music_tracks for select to authenticated
  using ((select private.music_can_read()));
drop policy if exists music_albums_read on public.music_albums;
create policy music_albums_read on public.music_albums for select to authenticated
  using ((select private.music_can_read()));
drop policy if exists music_folders_read on public.music_folders;
create policy music_folders_read on public.music_folders for select to authenticated
  using ((select private.music_can_read()));
