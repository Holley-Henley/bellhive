-- bellhive99.com - storage for the SmugMug connection (Pictures page)
-- Run once in the bellhive99 Supabase project -> SQL Editor. Safe to re-run.
--
-- Holds the SmugMug API key/secret and the OAuth access token. Row level security is on
-- with NO policies, so browsers (anon / signed-in users) can never read or write it -
-- only the smugmug edge function, which uses the server's secret key.

create table if not exists public.integration_secrets (
  name        text primary key,          -- e.g. 'smugmug', 'smugmug_request'
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;
