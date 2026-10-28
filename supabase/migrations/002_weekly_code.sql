-- CPSC: weekly check-in code (shown on wallet passes and the live website card)
-- Run in Supabase → SQL Editor. Safe to run again.

create table if not exists public.club_settings (
  id          int primary key default 1 check (id = 1),
  week_word   text not null default 'POWDER',
  week_emoji  text not null default '🏔️',
  updated_at  timestamptz not null default now(),
  updated_by  text
);
insert into public.club_settings (id) values (1) on conflict (id) do nothing;

alter table public.club_settings enable row level security;
grant select on public.club_settings to authenticated;
revoke all on public.club_settings from anon;
drop policy if exists "settings: members read" on public.club_settings;
create policy "settings: members read" on public.club_settings for select to authenticated using (true);

-- The member's WalletWallet pass id, so passes can be updated in place
alter table public.profiles add column if not exists wallet_serial text;

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
  return v_row;
end $$;

revoke all on function public.set_week_code(text, text) from public, anon;
grant execute on function public.set_week_code(text, text) to authenticated;
