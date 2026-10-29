-- CPSC: remember every wallet pass issued to each member, so older copies can be voided
-- whenever a member adds their card again. Run in Supabase → SQL Editor. Safe to run again.

create table if not exists public.wallet_passes (
  serial      text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists wallet_passes_live on public.wallet_passes(user_id) where revoked_at is null;

-- Only the wallet function (server key) touches this table.
alter table public.wallet_passes enable row level security;
revoke all on public.wallet_passes from anon, authenticated;

-- Start the history with each member's current pass
insert into public.wallet_passes (serial, user_id)
select wallet_serial, id from public.profiles where wallet_serial is not null
on conflict (serial) do nothing;
