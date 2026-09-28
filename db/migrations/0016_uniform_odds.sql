-- Owner decision 2026-09-28: every coin in a pool has the same chance (1/N). Earlier rolls keep 'tiers' (tier odds first, then a
-- coin inside the tier) so they still verify exactly as they were rolled; new rolls record 'uniform'.
alter table rolls add column odds_mode text not null default 'tiers' check (odds_mode in ('tiers', 'uniform'));
alter table rolls alter column odds_mode set default 'uniform';
