-- Lockabox is a memecoin product: stables, wrapped natives and large-cap non-meme majors never enter a case.
-- Found in review of the first live ingest (WETH on Robinhood, WBTC/UNI/ONDO on Ethereum reached pools).
create table symbol_blocklist (symbol text primary key, reason text not null);
insert into symbol_blocklist (symbol, reason) values
  ('USDC','stable'),('USDT','stable'),('DAI','stable'),('USDE','stable'),('USD1','stable'),('FDUSD','stable'),('PYUSD','stable'),('USDS','stable'),
  ('USDC.E','stable'),('USDBC','stable'),('TUSD','stable'),('FRAX','stable'),('RLUSD','stable'),('EURC','stable'),
  ('WETH','wrapped native'),('ETH','native'),('WBNB','wrapped native'),('BNB','native'),('SOL','native'),('WSOL','wrapped native'),
  ('WBTC','wrapped major'),('BTC','major'),('CBBTC','wrapped major'),('STETH','staked major'),('WSTETH','staked major'),('CBETH','staked major'),
  ('JITOSOL','staked major'),('MSOL','staked major'),('UNI','non-meme major'),('LINK','non-meme major'),('ONDO','non-meme major'),
  ('AAVE','non-meme major'),('ARB','non-meme major'),('OP','non-meme major'),('JUP','non-meme major'),('RAY','non-meme major');
