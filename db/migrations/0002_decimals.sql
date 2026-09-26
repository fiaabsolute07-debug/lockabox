-- Token decimals, needed to show swap amounts in whole tokens. Filled lazily from chain RPC.
alter table assets add column decimals int check (decimals between 0 and 36);
