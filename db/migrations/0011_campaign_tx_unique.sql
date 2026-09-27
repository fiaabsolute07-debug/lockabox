-- AC-063/067: one fee payment and one deposit can back one campaign only.
create unique index sponsor_campaigns_fee_tx on sponsor_campaigns (fee_tx_hash) where fee_tx_hash is not null;
create unique index sponsor_campaigns_deposit_tx on sponsor_campaigns (deposit_tx_hash) where deposit_tx_hash is not null;
