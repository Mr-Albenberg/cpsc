-- CPSC: a long-lived secret for wallet pass update passwords, kept separate from the signing
-- certificate so renewing the certificate (or changing its key) never breaks existing passes.
-- Run in Supabase → SQL Editor. Safe to run again.
create table if not exists public.pass_secrets (
  id      int primary key default 1 check (id = 1),
  secret  text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);
insert into public.pass_secrets (id) values (1) on conflict (id) do nothing;
alter table public.pass_secrets enable row level security;
revoke all on public.pass_secrets from anon, authenticated;
