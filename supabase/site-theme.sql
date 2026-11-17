-- bellhive99.com - Home page themes (the 3D scene on the home page; themes/*.js)
-- Needs site-schema.sql and audit-log.sql first. Safe to re-run.
--
-- site_theme    one row (id = 1): how the site picks the day's theme. Any signed-in member can
--               read and change it (My Account and ADMIN > Settings both show it).
--                 mode          static | daily | weekly | monthly | random (random = each visit)
--                 static_theme  the theme when mode = static
--                 rotation      themes that take turns for daily / weekly / monthly / random
--                 today_theme   "switch today's theme": wins for today_date only
--                 holidays      [{ "md": "MM-DD", "theme": "<id>", "name": "..." }] - pinned dates
-- member_theme  a person's own pick; overrides the site for them only. No row = follow the site.
--
-- Which theme shows is worked out in the browser (themes/themes.js) from these values and the date.

create table if not exists public.site_theme (
  id            int primary key default 1 check (id = 1),
  mode          text not null default 'static' check (mode in ('static', 'daily', 'weekly', 'monthly', 'random')),
  static_theme  text not null default 'beehive' check (char_length(static_theme) <= 40),
  rotation      text[] not null default array['beehive', 'space'],
  today_theme   text check (today_theme is null or char_length(today_theme) <= 40),
  today_date    date,
  holidays      jsonb not null default '[{"md": "05-04", "theme": "space", "name": "May the 4th"}]'::jsonb
                check (jsonb_typeof(holidays) = 'array'),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);
insert into public.site_theme (id) values (1) on conflict (id) do nothing;

alter table public.site_theme enable row level security;
revoke all on public.site_theme from anon, authenticated;
grant select, update on public.site_theme to authenticated;
drop policy if exists "members read" on public.site_theme;
create policy "members read" on public.site_theme for select to authenticated using (true);
drop policy if exists "members change" on public.site_theme;
create policy "members change" on public.site_theme for update to authenticated using (true) with check (id = 1);

create table if not exists public.member_theme (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme       text not null check (char_length(theme) <= 40),
  updated_at  timestamptz not null default now()
);
alter table public.member_theme enable row level security;
revoke all on public.member_theme from anon, authenticated;
grant select, insert, update, delete on public.member_theme to authenticated;
drop policy if exists "own row" on public.member_theme;
create policy "own row" on public.member_theme for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- stamp who changed the site theme, and log it to the Audit Log
create or replace function private.site_theme_touch()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if coalesce(current_setting('role', true), '') = 'authenticated' then
    insert into public.audit_log (user_id, module, action_type, action_detail, item_reference, source, row_count)
    values (auth.uid(), 'site', 'theme_change',
            case when new.today_theme is distinct from old.today_theme or new.today_date is distinct from old.today_date
                 then coalesce('switched today''s home page theme to ' || new.today_theme, 'cleared today''s home page theme')
                 else 'changed the home page theme schedule (' || new.mode || ')' end,
            null, 'database', 1);
  end if;
  return new;
end $$;
revoke execute on function private.site_theme_touch() from public, anon, authenticated;
drop trigger if exists site_theme_touch on public.site_theme;
create trigger site_theme_touch before update on public.site_theme
  for each row execute function private.site_theme_touch();
