-- CPSC: 2026/27 Exec Board page (members only).
-- Text comes from cpsconline.com/exec-board-26-27 (members-only there too). Photos live in the private "club" bucket.
-- Edit later in Supabase → Table Editor → exec_board. Run in SQL Editor. Safe to run again.

create table if not exists public.exec_board (
  id       serial primary key,
  sort     int  not null unique,
  role     text not null,
  name     text not null,
  nickname text,
  bio      text,
  photos   text[] not null default '{}',  -- paths in the "club" storage bucket
  photo_sources text[] not null default '{}'  -- where admins import them from (Import photos button)
);
alter table public.exec_board add column if not exists photo_sources text[] not null default '{}';
alter table public.exec_board enable row level security;

-- Logged-in members (anyone with a profile) can read; admins can edit.
drop policy if exists "exec_board: members read" on public.exec_board;
create policy "exec_board: members read" on public.exec_board for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "exec_board: admins write" on public.exec_board;
create policy "exec_board: admins write" on public.exec_board for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.exec_board from anon;
grant select, insert, update, delete on public.exec_board to authenticated;
grant usage on sequence public.exec_board_id_seq to authenticated;

-- Private bucket for members-only club files
insert into storage.buckets (id, name, public) values ('club', 'club', false) on conflict (id) do nothing;
drop policy if exists "club: members read" on storage.objects;
create policy "club: members read" on storage.objects for select to authenticated
  using (bucket_id = 'club' and exists (select 1 from public.profiles p where p.id = auth.uid()));
drop policy if exists "club: admins upload" on storage.objects;
create policy "club: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'club' and public.is_admin());
drop policy if exists "club: admins replace" on storage.objects;
create policy "club: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'club' and public.is_admin());
drop policy if exists "club: admins delete" on storage.objects;
create policy "club: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'club' and public.is_admin());

-- The board's names, bios and photo sources are members-only, so they are NOT kept in this public repo.
-- They were loaded straight into the live database; edit them in Supabase → Table Editor → exec_board.
