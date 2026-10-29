-- CPSC: Apple Wallet passes signed with the club's own certificate (pass.com.cpsc.membership).
-- Phones that add a pass register here so the site can tell them when it changes.
-- Run in Supabase → SQL Editor. Safe to run again.

create table if not exists public.pass_registrations (
  device_id   text not null,          -- Apple's id for the phone's Wallet
  serial      text not null,          -- the pass serialNumber (the member's card id)
  push_token  text not null,
  created_at  timestamptz not null default now(),
  primary key (device_id, serial)
);
create index if not exists pass_registrations_serial on public.pass_registrations(serial);

-- Passes of removed members: phones get a voided copy on their next update
create table if not exists public.voided_passes (
  serial     text primary key,
  name       text,
  voided_at  timestamptz not null default now()
);

-- Only the wallet function (server key) uses these.
alter table public.pass_registrations enable row level security;
alter table public.voided_passes enable row level security;
revoke all on public.pass_registrations, public.voided_passes from anon, authenticated;

-- When this member's pass last changed (photo, test word…). Code changes use club_settings.updated_at.
alter table public.profiles add column if not exists pass_updated_at timestamptz not null default now();
-- Temporary word for the admin "Test on your phone" button (null = use the real code)
alter table public.profiles add column if not exists pass_test_code text;
