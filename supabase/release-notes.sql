-- bellhive99.com - release notes / site version (ADMIN > Release Notes)
-- Same setup as HHB Project Exchange's release_notes table. Safe to re-run.
-- Applied to the bellhive99 Supabase project on Oct 30, 2026.
--
-- VERSION FORMAT: YYMMDD.NN  (e.g. 261030.05 = 5th release on Oct 30, 2026)
--   The newest ver is the site version. It shows on the sign-in screen, under the star
--   in the left menu, and at the top of the Release Notes page. Order and the date
--   shown both come from ver itself, not created_at, so a late or backdated insert
--   still lands in the right place.
--
-- ADDING A RELEASE (one insert, nothing in the site files changes):
--   insert into public.release_notes (ver, items) values ('261031.01', jsonb_build_array(
--     'First thing that changed.',
--     'Second thing that changed.'
--   ));

create table if not exists public.release_notes (
  ver         text primary key check (ver ~ '^\d{6}\.\d{2}$'),
  items       jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at  timestamptz not null default now()
);

alter table public.release_notes enable row level security;
grant select on public.release_notes to anon, authenticated;
grant insert, update, delete on public.release_notes to authenticated;

-- Anyone may read (the sign-in screen shows the version before anyone signs in).
drop policy if exists "read release notes" on public.release_notes;
create policy "read release notes" on public.release_notes for select to anon, authenticated using (true);
-- Only admins may change them (the SQL editor / service key bypasses RLS anyway).
drop policy if exists "admins write release notes" on public.release_notes;
create policy "admins write release notes" on public.release_notes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- History so far
insert into public.release_notes (ver, items, created_at) values
('260630.01', jsonb_build_array(
  'The original Bell Family Homepage (the FrontPage site from 1999-2001) uploaded to GitHub as the starting point: the two-frame home page, the left menu, family pages, the beer pages, the guest book and the old photos.'
), '2026-06-30 15:49-05'),
('261016.01', jsonb_build_array(
  'Planet Kimberly added to the site (ee folder).',
  'Oct 17: Planet Kimberly updated.'
), '2026-10-16 11:33-05'),
('261030.01', jsonb_build_array(
  'bellhive99.com now points at the site: CNAME file added so GitHub Pages serves it at the custom domain.'
), '2026-10-30 12:36-05'),
('261030.02', jsonb_build_array(
  'Site-wide sign-in: the home page opens on a bellhive99 sign-in screen. Forgot-password emails a reset link. Accounts are added by an admin; the first account is the admin.',
  'The old FrontPage frameset is rebuilt as two frames under a new site bar (name, role, My Account, Change Password, Sign Out).',
  'ADMIN > Users: list of accounts, Add User with a temporary password (changed at first sign-in), Edit, Activate / Deactivate, and password resets. The ADMIN section of the menu only shows for admins.',
  'My Account page: edit your own name and phone.',
  'Workout logger (workout/): each person keeps their own log. Log, Week, Progress and Setup screens, daily trackers, and import of the old workout spreadsheet.',
  'Database: profiles table with roles (supabase/site-schema.sql); admin-users edge function.'
), '2026-10-30 15:59-05'),
('261030.03', jsonb_build_array(
  'ADMIN > Audit Log: newest-first timeline of sign-ins, password changes, user changes and workout changes, with filters, day headings and CSV download.',
  'ADMIN > Visitors: where visitors are coming from on a map (city level). IP addresses are never stored, only a salted hash for unique counts.',
  'Pictures: the old Pictures link now opens a gallery of every SmugMug album, public and private, for signed-in users. The SmugMug keys stay in the smugmug edge function.',
  'Database: audit_log, site_visits and integration_secrets tables; track and smugmug edge functions.'
), '2026-10-30 21:15-05'),
('261030.04', jsonb_build_array(
  'Menu: Pictures points to the new Pictures page; ADMIN section adds Audit Log and Visitors.',
  'The menu now learns your role from the home page by message, so the ADMIN section also works when the site is opened straight from disk.',
  'Page views are recorded for the sign-in screen and home page (for Visitors).'
), '2026-10-30 21:21-05'),
('261030.05', jsonb_build_array(
  'ADMIN > Release Notes: version history for the site, grouped by month (click a month to open it), newest first, same as HHB Project Exchange.',
  'Site version (YYMMDD.NN) now shows on the sign-in screen and under the star in the left menu. It always reads the newest release note, so adding a release is a single insert and no site file needs to change.',
  'New files: admin/releases.html, admin/releases.js, auth/version.js, supabase/release-notes.sql. Changed: index.html, INDEXA.HTM, auth/auth.css.',
  'Database: release_notes table (anyone can read; only admins can change).'
), '2026-10-30 21:45-05')
on conflict (ver) do nothing;
