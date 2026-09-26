-- Sponsored cases (LAB §7.5, R4). Projects fund token drops; users open the sponsored case with points.
-- Distribution from the vault is a separate, default-off job: nothing here moves tokens.

create table sponsor_campaigns (
  id bigserial primary key,
  sponsor_user_id uuid not null references users(id),
  sponsor_wallet text not null,
  project_name text not null check (length(project_name) between 2 and 60),
  description text not null default '' check (length(description) <= 280),
  chain_id text not null references chains(id),
  asset_id bigint not null references assets(id),
  amount_per_open text not null check (amount_per_open ~ '^[1-9][0-9]{0,30}$'),   -- raw token units
  total_opens int not null check (total_opens between 1 and 1000000),
  opens_used int not null default 0,
  cost_points int not null default 500 check (cost_points > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fee_tx_hash text,                               -- sponsorship fee paid to the treasury (verified by admin)
  deposit_tx_hash text,                           -- tokens deposited to the campaign vault (verified by admin)
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'ended')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (opens_used <= total_opens)
);

create table redemptions (
  id bigserial primary key,
  campaign_id bigint not null references sponsor_campaigns(id),
  roll_id bigint not null references rolls(id),
  user_id uuid not null references users(id),
  wallet text not null,
  amount text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  tx_hash text unique,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roll_id)
);

-- One sponsored case; its pool is the tokens of campaigns that are approved, running and not exhausted.
insert into cases (id, kind, title, cost_points, sort) values ('sponsored', 'sponsored', 'Sponsored', 500, 3);
