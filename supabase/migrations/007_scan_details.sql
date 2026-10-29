-- CPSC: scanner shows the member's full profile and whether they were already checked in
-- within the last 24 hours. Run in Supabase → SQL Editor. Safe to run again.
create or replace function public.scan_card(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_serial uuid;
  v_member public.profiles;
  v_prev   public.scans;
  v_total  integer;
  v_today  integer;
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
  select count(*) into v_today from public.scans where user_id = v_member.id and scanned_at > now() - interval '24 hours';
  select email into v_by from public.profiles where id = auth.uid();
  insert into public.scans (user_id, scanned_by) values (v_member.id, v_by);
  return json_build_object(
    'valid', true,
    'member', json_build_object('id', v_member.id, 'name', v_member.name, 'email', v_member.email,
                                'memberNo', v_member.member_no, 'isAdmin', v_member.is_admin,
                                'since', v_member.created_at),
    'lastScan', v_prev.scanned_at,
    'lastScannedBy', v_prev.scanned_by,
    'scannedWithin24h', v_today > 0,
    'scansLast24h', v_today,
    'totalScans', v_total + 1
  );
end $$;
revoke all on function public.scan_card(text) from public, anon;
grant execute on function public.scan_card(text) to authenticated;
