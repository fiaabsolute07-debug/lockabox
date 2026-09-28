-- Cosmetic metadata is independent of price freshness, gates and frozen roll proofs.
create table asset_image_lookups (
  asset_id bigint primary key references assets(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  next_attempt_at timestamptz not null,
  last_error text
);
