-- AC-022: which source the current price came from. DEX Screener normally; DexPaprika only while DEX Screener has been down > 10 min.
alter table asset_snapshots add column price_source text not null default 'dexscreener' check (price_source in ('dexscreener', 'dexpaprika'));
