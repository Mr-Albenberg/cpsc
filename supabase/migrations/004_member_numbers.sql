-- CPSC: member numbers (#0001, #0002 …) shown on wallet passes, the website card and the scanner.
-- Numbered by sign-up date. Run in Supabase → SQL Editor. Safe to run again.

create sequence if not exists public.member_no_seq;
alter table public.profiles add column if not exists member_no int;

-- Number anyone who doesn't have one yet, oldest sign-up first
with todo as (
  select id, row_number() over (order by created_at, id) as rn
  from public.profiles where member_no is null
), base as (select coalesce(max(member_no), 0) as m from public.profiles)
update public.profiles p set member_no = base.m + todo.rn
from todo, base where p.id = todo.id;

select setval('public.member_no_seq', greatest((select coalesce(max(member_no), 0) from public.profiles), 1),
              (select count(*) > 0 from public.profiles where member_no is not null));
alter table public.profiles alter column member_no set default nextval('public.member_no_seq');
create unique index if not exists profiles_member_no on public.profiles(member_no);

-- Scanner: include the member number
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
    'member', json_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
                                'memberNo', v_member.member_no, 'isAdmin', v_member.is_admin),
    'lastScan', v_prev.scanned_at,
    'lastScannedBy', v_prev.scanned_by,
    'totalScans', v_total + 1
  );
end $$;
revoke all on function public.scan_card(text) from public, anon;
grant execute on function public.scan_card(text) to authenticated;
