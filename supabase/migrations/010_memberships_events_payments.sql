-- CPSC: school-year memberships, one party a day (named after the weekly word), and paying dues online.
-- Run in Supabase → SQL Editor. Safe to run again.

-- ===================== Membership dates =====================
-- Every membership (full year or spring) is valid through June 30 of the school year — a couple of weeks
-- past spring finals. Anything bought or approved from June 1 on counts toward the NEXT school year.
create or replace function public.club_today() returns date
language sql stable as $$ select (now() at time zone 'America/Los_Angeles')::date $$;

create or replace function public.membership_end(p_day date default null) returns date
language sql stable as $$
  select make_date(extract(year from d)::int + (extract(month from d) >= 6)::int, 6, 30)
  from (select coalesce(p_day, public.club_today()) as d) x
$$;

alter table public.approved_emails add column if not exists membership text not null default 'full';
alter table public.approved_emails add column if not exists member_until date;
alter table public.approved_emails add column if not exists paid_cents int;
alter table public.approved_emails add column if not exists paid_at timestamptz;
alter table public.profiles add column if not exists membership text;
alter table public.profiles add column if not exists member_until date;
do $$ begin
  alter table public.approved_emails add constraint approved_membership check (membership in ('full', 'spring'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles add constraint profiles_membership check (membership in ('full', 'spring'));
exception when duplicate_object then null; end $$;

-- Everyone approved or signed up so far: full-year member through this school year
update public.approved_emails set member_until = public.membership_end() where member_until is null;
update public.profiles p set membership = a.membership, member_until = a.member_until
  from public.approved_emails a where a.email = p.email and p.member_until is null;
update public.profiles set membership = 'full', member_until = public.membership_end() where member_until is null;

-- The approved list is the source of truth; the member's profile mirrors it
create or replace function public.approved_defaults() returns trigger
language plpgsql as $$
begin
  if new.member_until is null then new.member_until := public.membership_end(); end if;
  return new;
end $$;
drop trigger if exists cpsc_approved_defaults on public.approved_emails;
create trigger cpsc_approved_defaults before insert or update on public.approved_emails
  for each row execute function public.approved_defaults();

create or replace function public.approved_sync_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set membership = new.membership, member_until = new.member_until where email = new.email;
  return new;
end $$;
drop trigger if exists cpsc_approved_sync on public.approved_emails;
create trigger cpsc_approved_sync after insert or update of membership, member_until on public.approved_emails
  for each row execute function public.approved_sync_profile();

-- New accounts pick up their membership from the approved list
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.approved_emails;
begin
  select * into a from public.approved_emails where email = lower(new.email);
  insert into public.profiles (id, email, name, is_admin, membership, member_until)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    coalesce(a.make_admin, false),
    coalesce(a.membership, 'full'),
    coalesce(a.member_until, public.membership_end())
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Admin: give someone a membership for the current school year (approves them if they're new)
create or replace function public.set_membership(p_email text, p_membership text, p_note text default null)
returns public.approved_emails
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_row public.approved_emails;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_membership not in ('full', 'spring') then raise exception 'Membership must be full or spring.'; end if;
  insert into public.approved_emails (email, membership, member_until, note, added_by)
  values (v_email, p_membership, public.membership_end(), nullif(trim(p_note), ''), (select email from public.profiles where id = auth.uid()))
  on conflict (email) do update set membership = excluded.membership, member_until = excluded.member_until,
    note = coalesce(excluded.note, public.approved_emails.note)
  returning * into v_row;
  return v_row;
end $$;

-- ===================== Dues (prices for paying online) =====================
alter table public.club_settings add column if not exists price_new_cents int not null default 5569;
alter table public.club_settings add column if not exists price_returning_cents int not null default 5069;
alter table public.club_settings add column if not exists price_spring_cents int not null default 2569;

create or replace function public.set_prices(p_new int, p_returning int, p_spring int) returns public.club_settings
language plpgsql security definer set search_path = public as $$
declare v_row public.club_settings;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if least(p_new, p_returning, p_spring) < 100 or greatest(p_new, p_returning, p_spring) > 100000 then
    raise exception 'Prices must be between $1 and $1,000.';
  end if;
  update public.club_settings set price_new_cents = p_new, price_returning_cents = p_returning, price_spring_cents = p_spring
  where id = 1 returning * into v_row;
  return v_row;
end $$;

create table if not exists public.payments (
  session_id   text primary key,               -- Stripe Checkout session
  email        text not null,
  name         text,
  plan         text not null check (plan in ('new', 'returning', 'spring')),
  amount_cents int not null,
  status       text not null default 'pending', -- pending | paid
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
alter table public.payments enable row level security;
drop policy if exists "payments: admins read" on public.payments;
create policy "payments: admins read" on public.payments for select to authenticated using (public.is_admin());
grant select on public.payments to authenticated;
revoke all on public.payments from anon;

-- ===================== Parties: one event per day, named after the weekly word =====================
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  day        date not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
drop policy if exists "events: admins read" on public.events;
create policy "events: admins read" on public.events for select to authenticated using (public.is_admin());
grant select on public.events to authenticated;
revoke all on public.events from anon;

alter table public.scans add column if not exists event_id bigint references public.events(id) on delete set null;
create unique index if not exists scans_one_per_event on public.scans(user_id, event_id);
create index if not exists scans_event on public.scans(event_id);

-- The party "day" runs 6am to 6am, so a 1am scan still counts for that night's party
create or replace function public.party_day() returns date
language sql stable as $$ select ((now() at time zone 'America/Los_Angeles') - interval '6 hours')::date $$;

create or replace function public.tonight_event() returns public.events
language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  insert into public.events (day, name)
  select public.party_day(), coalesce((select week_word from public.club_settings where id = 1), 'PARTY')
  on conflict (day) do nothing;
  select * into e from public.events where day = public.party_day();
  return e;
end $$;
revoke all on function public.tonight_event() from public, anon, authenticated;

-- Scanner: checks membership, then checks the member in to tonight's party (once)
create or replace function public.scan_card(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_serial uuid;
  v_member public.profiles;
  v_prev   public.scans;
  v_here   public.scans;
  v_event  public.events;
  v_total  integer;
  v_events integer;
  v_count  integer;
  v_active boolean;
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

  v_active := v_member.member_until is not null and v_member.member_until >= public.club_today();
  select * into v_prev from public.scans where user_id = v_member.id order by scanned_at desc limit 1;
  select count(*), count(distinct event_id) into v_total, v_events from public.scans where user_id = v_member.id;
  v_event := public.tonight_event();
  select * into v_here from public.scans where user_id = v_member.id and event_id = v_event.id;

  if v_active and v_here.id is null then
    select email into v_by from public.profiles where id = auth.uid();
    insert into public.scans (user_id, scanned_by, event_id) values (v_member.id, v_by, v_event.id);
    v_total := v_total + 1; v_events := v_events + 1;
  end if;
  select count(*) into v_count from public.scans where event_id = v_event.id;

  return json_build_object(
    'valid', true,
    'active', v_active,
    'membership', v_member.membership,
    'memberUntil', v_member.member_until,
    'member', json_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
                                'memberNo', v_member.member_no, 'isAdmin', v_member.is_admin,
                                'since', v_member.created_at, 'membership', v_member.membership,
                                'memberUntil', v_member.member_until),
    'lastScan', v_prev.scanned_at,
    'lastScannedBy', v_prev.scanned_by,
    'alreadyIn', v_here.id is not null,
    'checkedInAt', v_here.scanned_at,
    'checkedInBy', v_here.scanned_by,
    'scannedWithin24h', v_here.id is not null,
    'event', json_build_object('id', v_event.id, 'name', v_event.name, 'day', v_event.day, 'count', v_count),
    'eventsAttended', v_events,
    'totalScans', v_total
  );
end $$;

-- Changing the weekly word renames tonight's party too
create or replace function public.set_week_code(p_word text, p_emoji text)
returns public.club_settings
language plpgsql security definer set search_path = public as $$
declare
  v_word text := upper(regexp_replace(trim(coalesce(p_word, '')), '\s+', ' ', 'g'));
  v_emoji text := trim(coalesce(p_emoji, ''));
  v_row public.club_settings;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if char_length(v_word) < 2 or char_length(v_word) > 14 then
    raise exception 'The code word must be 2–14 characters.';
  end if;
  if char_length(v_emoji) > 8 then raise exception 'Pick a single emoji.'; end if;
  update public.club_settings
     set week_word = v_word, week_emoji = v_emoji, updated_at = now(),
         updated_by = (select email from public.profiles where id = auth.uid())
   where id = 1
  returning * into v_row;
  update public.events set name = v_word where day = public.party_day();
  return v_row;
end $$;

-- Tonight's party for the scanner header (doesn't create it)
create or replace function public.tonight() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('day', public.party_day(), 'name', coalesce(e.name, s.week_word),
                           'count', (select count(*) from public.scans x where e.id is not null and x.event_id = e.id))
  from public.club_settings s left join public.events e on e.day = public.party_day()
  where s.id = 1 and public.is_admin()
$$;

create or replace function public.admin_events()
returns table (id bigint, day date, name text, attendees bigint)
language sql stable security definer set search_path = public as $$
  select e.id, e.day, e.name, count(s.id)
  from public.events e left join public.scans s on s.event_id = e.id
  where public.is_admin()
  group by e.id order by e.day desc
$$;

create or replace function public.admin_event_attendees(p_event bigint)
returns table (user_id uuid, name text, email text, member_no int, scanned_at timestamptz, scanned_by text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, p.member_no, s.scanned_at, s.scanned_by
  from public.scans s join public.profiles p on p.id = s.user_id
  where s.event_id = p_event and public.is_admin()
  order by s.scanned_at
$$;

drop function if exists public.admin_members();
create function public.admin_members()
returns table (id uuid, name text, email text, is_admin boolean, created_at timestamptz, last_scan timestamptz, scan_count bigint,
               membership text, member_until date, events_attended bigint, in_tonight boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, p.is_admin, p.created_at, max(s.scanned_at), count(s.id),
         p.membership, p.member_until, count(distinct s.event_id), coalesce(bool_or(e.day = public.party_day()), false)
  from public.profiles p
  left join public.scans s on s.user_id = p.id
  left join public.events e on e.id = s.event_id
  where public.is_admin()
  group by p.id
  order by lower(p.name)
$$;

revoke all on function public.scan_card(text), public.admin_members(), public.set_week_code(text, text), public.tonight(),
  public.admin_events(), public.admin_event_attendees(bigint), public.set_membership(text, text, text),
  public.set_prices(int, int, int) from public, anon;
grant execute on function public.scan_card(text), public.admin_members(), public.set_week_code(text, text), public.tonight(),
  public.admin_events(), public.admin_event_attendees(bigint), public.set_membership(text, text, text),
  public.set_prices(int, int, int) to authenticated;
grant execute on function public.membership_end(date), public.club_today(), public.party_day() to anon, authenticated;
