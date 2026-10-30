-- CPSC: admin site editor. Admins can change text, photos and colors on the club pages from the site itself
-- (Edit page button). Everyone can read the changes; only admins can write. Run in SQL Editor. Safe to run again.

create table if not exists public.site_content (
  key        text primary key,                          -- kind:page:scope:path
  kind       text not null check (kind in ('text', 'img', 'theme')),
  page       text not null,                             -- e.g. home.html, or * for every page (footer, colors)
  scope      text not null default 'main',              -- main | foot | theme
  path       text not null default '',                  -- where the element sits on the page
  orig       text not null default '',                  -- the original text/image, so edits find their spot after a rebuild
  value      text not null check (length(value) <= 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.site_content enable row level security;

drop policy if exists "site_content: everyone reads" on public.site_content;
create policy "site_content: everyone reads" on public.site_content for select to anon, authenticated using (true);
drop policy if exists "site_content: admins write" on public.site_content;
create policy "site_content: admins write" on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select on public.site_content to anon, authenticated;
grant insert, update, delete on public.site_content to authenticated;

-- Public bucket for photos admins upload through the editor (anyone can view; only admins can upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('site', 'site', true, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "site: admins upload" on storage.objects;
create policy "site: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.is_admin());
drop policy if exists "site: admins replace" on storage.objects;
create policy "site: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.is_admin());
drop policy if exists "site: admins delete" on storage.objects;
create policy "site: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.is_admin());
