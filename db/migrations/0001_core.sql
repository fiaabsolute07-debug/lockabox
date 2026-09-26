-- Lockabox core schema (LAB_MASTER §6). Money never touches this database: swaps are signed in the user's wallet.
create extension if not exists pgcrypto;

-- Guards --------------------------------------------------------------------------------------------------------
create or replace function lab_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only/immutable', tg_table_name using errcode = 'P0001';
end $$;

-- Chains --------------------------------------------------------------------------------------------------------
create table chains (
  id text primary key,                         -- DEX Screener chain id
  name text not null,
  family text not null check (family in ('solana', 'evm')),
  dexpaprika_id text,
  enabled boolean not null default false,
  swap_enabled boolean not null default false,
  explorer_tx_url text,                         -- template with {tx}
  explorer_token_url text,                      -- template with {address}
  sort int not null default 100
);

insert into chains (id, name, family, dexpaprika_id, enabled, swap_enabled, explorer_tx_url, explorer_token_url, sort) values
  ('solana',    'Solana',    'solana', 'solana',    true,  true,  'https://solscan.io/tx/{tx}',              'https://solscan.io/token/{address}', 1),
  ('base',      'Base',      'evm',    'base',      true,  false, 'https://basescan.org/tx/{tx}',            'https://basescan.org/token/{address}', 2),
  ('bsc',       'BSC',       'evm',    'bsc',       true,  false, 'https://bscscan.com/tx/{tx}',             'https://bscscan.com/token/{address}', 3),
  ('ethereum',  'Ethereum',  'evm',    'ethereum',  true,  false, 'https://etherscan.io/tx/{tx}',            'https://etherscan.io/token/{address}', 4),
  ('robinhood', 'Robinhood', 'evm',    'robinhood', true,  false, null, null, 5),
  ('arc',       'Arc',       'evm',    'arc',       true,  false, null, null, 6);

-- Assets --------------------------------------------------------------------------------------------------------
create table assets (
  id bigserial primary key,
  chain_id text not null references chains(id),
  address text not null,
  symbol text,
  name text,
  image_url text,
  sources text[] not null default '{}',         -- e.g. ds:boost, ds:profile, ds:cto, ds:meta:cat, paprika:new
  first_seen_at timestamptz not null default now(),
  unique (chain_id, address)
);

-- Latest market snapshot per asset (overwritten by the worker).
create table asset_snapshots (
  asset_id bigint primary key references assets(id) on delete cascade,
  taken_at timestamptz not null,
  price_usd double precision,
  market_cap double precision,
  fdv double precision,
  liquidity_usd double precision,
  volume_24h double precision,
  change_m5 double precision,
  change_h1 double precision,
  change_h6 double precision,
  change_h24 double precision,
  pair_address text,
  dex_id text,
  pair_created_at timestamptz,
  boosts_active int not null default 0,
  dexscreener_url text,
  websites jsonb not null default '[]',
  socials jsonb not null default '[]'
);

-- Hidden gates (LAB §2.3): results are internal, never shown as risk labels.
create table gate_results (
  asset_id bigint not null references assets(id) on delete cascade,
  gate text not null check (gate in ('honeypot', 'liquidity')),
  passed boolean not null,
  reason text,
  checked_at timestamptz not null default now(),
  primary key (asset_id, gate)
);

-- Kill switch (LAB §7.6).
create table moderation (
  asset_id bigint primary key references assets(id) on delete cascade,
  reason text not null,
  actor text not null,
  created_at timestamptz not null default now()
);

-- Cases & immutable pools ------------------------------------------------------------------------------------
create table cases (
  id text primary key,
  kind text not null check (kind in ('trending', 'new', 'meta', 'cto', 'sponsored')),
  title text not null,
  meta_slug text,
  tier_odds jsonb not null default '{"micro":35,"small":30,"mid":20,"large":12,"top":3}',
  cost_points int,                               -- null = free roll
  active boolean not null default true,
  sort int not null default 100
);

insert into cases (id, kind, title, sort) values
  ('trending', 'trending', 'Trending', 1),
  ('new', 'new', 'New < 24h', 2),
  ('cto', 'cto', 'CTO', 4);

create table case_pools (
  id bigserial primary key,
  case_id text not null references cases(id),
  chain_scope text not null,                     -- a chain id, or 'all'
  version int not null,
  items jsonb not null,                          -- [{ "a": assetId, "t": tier }] in canonical order
  hash text not null,                            -- sha256 of the canonical items JSON
  size int not null,
  created_at timestamptz not null default now(),
  unique (case_id, chain_scope, version)
);
create trigger case_pools_immutable before update or delete on case_pools for each row execute function lab_forbid_change();

-- Provably fair seeds ---------------------------------------------------------------------------------------
create table server_seeds (
  id bigserial primary key,
  seed text not null,                            -- secret until revealed_at
  hash text not null unique,                     -- sha256(seed), published before use
  active_from timestamptz not null default now(),
  revealed_at timestamptz
);
create unique index server_seeds_one_active on server_seeds ((true)) where revealed_at is null;

-- Users, wallets, sessions -------------------------------------------------------------------------------------
create table users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  age_confirmed_at timestamptz,
  client_seed text not null default encode(gen_random_bytes(8), 'hex'),
  nonce int not null default 0
);

create table wallets (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  chain_family text not null check (chain_family in ('solana', 'evm')),
  address text not null,
  verified_at timestamptz not null default now(),
  unique (chain_family, address)
);

create table auth_nonces (
  nonce text primary key,
  address text not null,
  chain_family text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Anonymous devices keep their own client seed + nonce so guests can roll and verify too.
create table devices (
  id text primary key,
  client_seed text not null default encode(gen_random_bytes(8), 'hex'),
  nonce int not null default 0,
  created_at timestamptz not null default now()
);

-- Rolls ---------------------------------------------------------------------------------------------------------
create table rolls (
  id bigserial primary key,
  user_id uuid references users(id),
  device_id text references devices(id),
  case_id text not null references cases(id),
  pool_id bigint not null references case_pools(id),
  filters jsonb not null default '{}',
  server_seed_id bigint not null references server_seeds(id),
  client_seed text not null,
  nonce int not null,
  items jsonb not null,                          -- the filtered pool actually rolled over (canonical order)
  items_hash text not null,
  r_tier double precision not null,
  r_item double precision not null,
  tier text not null,
  result_asset_id bigint not null references assets(id),
  price_usd_at_roll double precision,
  created_at timestamptz not null default now(),
  check (user_id is not null or device_id is not null)
);
create index rolls_created on rolls (created_at desc);
create index rolls_user on rolls (user_id, created_at desc);
create trigger rolls_immutable before update or delete on rolls for each row execute function lab_forbid_change();

-- Trades (built in-app, signed by the user; we only store what happened) -------------------------------------
create table trades (
  id bigserial primary key,
  roll_id bigint references rolls(id),
  user_id uuid references users(id),
  wallet text not null,
  chain_id text not null references chains(id),
  asset_id bigint not null references assets(id),
  input_symbol text not null,
  input_amount text not null,
  out_amount_min text not null,
  quote jsonb not null,
  tx_hash text unique,
  status text not null check (status in ('built', 'submitted', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trades_asset on trades (asset_id, created_at desc);

-- Points (LAB §7.4): only tasks add points; append-only ledger -----------------------------------------------
create table points_ledger (
  id bigserial primary key,
  user_id uuid not null references users(id),
  delta int not null check (delta <> 0),
  reason text not null,                          -- task:<id> | case:<id>
  ref text not null,                             -- idempotency reference
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create trigger points_ledger_append_only before update or delete on points_ledger for each row execute function lab_forbid_change();

create table tasks (
  id text primary key,
  title text not null,
  points int not null check (points > 0),
  kind text not null check (kind in ('checkin', 'profile', 'hold', 'rolls', 'vote', 'invite')),
  goal int not null default 1,
  daily boolean not null default false,
  active boolean not null default true
);
-- LAB §0.4.3: no task ever rewards posting on X. The check constraint makes that structural.
insert into tasks (id, title, points, kind, goal, daily) values
  ('daily-checkin', 'Daily check-in', 50, 'checkin', 1, true),
  ('daily-10-rolls', 'Open 10 cases today', 50, 'rolls', 10, true),
  ('hold-a-pull', 'Hold a coin you pulled', 150, 'hold', 1, false);

create table task_completions (
  user_id uuid not null references users(id),
  task_id text not null references tasks(id),
  period text not null,                          -- 'once' or YYYY-MM-DD
  created_at timestamptz not null default now(),
  primary key (user_id, task_id, period)
);
