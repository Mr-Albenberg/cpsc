-- CPSC Membership Cards — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again.

-- ---------- Tables ----------
create table if not exists public.approved_emails (
  email      text primary key check (email = lower(email)),
  note       text,
  make_admin boolean not null default false,
  added_by   text,
  added_at   timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text not null,
  is_admin   boolean not null default false,
  serial     uuid not null unique default gen_random_uuid(),  -- the secret value inside the QR code
  created_at timestamptz not null default now()
);

create table if not exists public.scans (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  scanned_by text
);
create index if not exists scans_user_time on public.scans(user_id, scanned_at desc);

alter table public.approved_emails enable row level security;
alter table public.profiles        enable row level security;
alter table public.scans           enable row level security;

-- ---------- Helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------- Row-level security ----------
drop policy if exists "profiles: own or admin" on public.profiles;
create policy "profiles: own or admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists "approved: admins" on public.approved_emails;
create policy "approved: admins" on public.approved_emails
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "scans: admins read" on public.scans;
create policy "scans: admins read" on public.scans
  for select to authenticated using (public.is_admin());

-- ---------- Sign-up gate: only approved emails can create an account ----------
create or replace function public.enforce_approved_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.approved_emails where email = lower(new.email)) then
    raise exception 'EMAIL_NOT_APPROVED';
  end if;
  return new;
end $$;

drop trigger if exists cpsc_enforce_approved_signup on auth.users;
create trigger cpsc_enforce_approved_signup
  before insert on auth.users for each row execute function public.enforce_approved_signup();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    coalesce((select make_admin from public.approved_emails where email = lower(new.email)), false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists cpsc_on_auth_user_created on auth.users;
create trigger cpsc_on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Functions the pages call ----------
-- Lets the sign-up page show a friendly message before trying to create the account.
create or replace function public.is_email_approved(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.approved_emails where email = lower(trim(p_email)))
$$;

-- Scan a QR code: returns the member plus their PREVIOUS scan, then records this one.
create or replace function public.scan_card(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_serial uuid;
  v_member public.profiles;
  v_prev   public.scans;
  v_total  integer;
  v_by     text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;

  begin
    v_serial := substring(trim(p_code) from '^CPSC1:([0-9a-fA-F-]{36})$')::uuid;
  exception when others then
    v_serial := null;
  end;
  if v_serial is null then
    return json_build_object('valid', false, 'error', 'This isn''t a CPSC membership card.');
  end if;

  select * into v_member from public.profiles where serial = v_serial;
  if not found then
    return json_build_object('valid', false, 'error', 'This card isn''t linked to an active member.');
  end if;

  select * into v_prev from public.scans where user_id = v_member.id order by scanned_at desc limit 1;
  select count(*) into v_total from public.scans where user_id = v_member.id;
  select email into v_by from public.profiles where id = auth.uid();
  insert into public.scans (user_id, scanned_by) values (v_member.id, v_by);

  return json_build_object(
    'valid', true,
    'member', json_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email),
    'lastScan', v_prev.scanned_at,
    'lastScannedBy', v_prev.scanned_by,
    'totalScans', v_total + 1
  );
end $$;

create or replace function public.admin_members()
returns table (id uuid, name text, email text, is_admin boolean, created_at timestamptz, last_scan timestamptz, scan_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, p.is_admin, p.created_at, max(s.scanned_at), count(s.id)
  from public.profiles p
  left join public.scans s on s.user_id = p.id
  where public.is_admin()
  group by p.id
  order by lower(p.name)
$$;

create or replace function public.set_admin(p_id uuid, p_value boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_id = auth.uid() and not p_value then raise exception 'You can''t remove your own admin access.'; end if;
  update public.profiles set is_admin = p_value where id = p_id;
end $$;

-- Removes the account (their card stops scanning as valid) and takes them off the approved list.
create or replace function public.delete_member(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_id = auth.uid() then raise exception 'You can''t remove yourself.'; end if;
  select email into v_email from public.profiles where id = p_id;
  delete from public.approved_emails where email = v_email;
  delete from auth.users where id = p_id;
end $$;

revoke all on function public.scan_card(text), public.admin_members(), public.set_admin(uuid, boolean),
  public.delete_member(uuid) from public, anon;
grant execute on function public.scan_card(text), public.admin_members(), public.set_admin(uuid, boolean),
  public.delete_member(uuid), public.is_admin() to authenticated;
grant execute on function public.is_email_approved(text) to anon, authenticated;

-- ---------- Photo storage (private) ----------
-- Each member's files live in a folder named after their user id: <id>/photo.jpg and <id>/thumb.png
insert into storage.buckets (id, name, public) values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos: read own or admin" on storage.objects;
create policy "photos: read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "photos: upload own" on storage.objects;
create policy "photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: replace own" on storage.objects;
create policy "photos: replace own" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: delete own or admin" on storage.objects;
create policy "photos: delete own or admin" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------- Make yourself the first admin ----------
-- Replace the email below with yours, then run just this line (or keep it and run the whole file):
-- insert into public.approved_emails (email, make_admin, note) values ('you@example.com', true, 'First admin') on conflict (email) do update set make_admin = true;
-- Already signed up before doing that? Run this too:
-- update public.profiles set is_admin = true where email = 'you@example.com';
