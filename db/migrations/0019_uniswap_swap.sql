-- In-app buys through the Uniswap API on every chain it covers (owner request 2026-09-29, DECISIONS #21).

alter table chains add column swap_provider text check (swap_provider in ('jupiter', 'lifi', 'uniswap'));
update chains set swap_provider = 'jupiter' where id = 'solana';
-- Arc pays in USDC, which needs an exact approval + Permit2 on Uniswap; it keeps the LI.FI route (off, DECISIONS #10).
update chains set swap_provider = 'lifi' where id = 'arc';
-- Chains in the Uniswap API "Supported Chains" table with a Universal Router 2.1.2 (zkSync has 2.0 only).
update chains set swap_provider = 'uniswap'
where family = 'evm' and evm_chain_id in (1, 10, 56, 130, 137, 143, 196, 480, 1868, 4326, 4663, 8453, 42161, 42220, 43114, 57073, 59144, 7777777);

-- Public RPC + native coin for chains that had none (viem/Reown chain definitions; each RPC answered eth_chainId correctly on 2026-09-29).
update chains c set rpc_url = v.rpc, native_symbol = v.sym, native_decimals = 18
from (values
  ('optimism', 'https://mainnet.optimism.io', 'ETH'), ('unichain', 'https://mainnet.unichain.org/', 'ETH'),
  ('polygon', 'https://polygon.drpc.org', 'POL'), ('monad', 'https://rpc.monad.xyz', 'MON'),
  ('xlayer', 'https://xlayerrpc.okx.com', 'OKB'), ('worldchain', 'https://worldchain-mainnet.g.alchemy.com/public', 'ETH'),
  ('soneium', 'https://rpc.soneium.org', 'ETH'), ('megaeth', 'https://mainnet.megaeth.com/rpc', 'ETH'),
  ('arbitrum', 'https://arb1.arbitrum.io/rpc', 'ETH'), ('celo', 'https://forno.celo.org', 'CELO'),
  ('avalanche', 'https://api.avax.network/ext/bc/C/rpc', 'AVAX'), ('ink', 'https://rpc-gel.inkonchain.com', 'ETH'),
  ('linea', 'https://rpc.linea.build', 'ETH'), ('zora', 'https://rpc.zora.energy', 'ETH')
) as v(id, rpc, sym)
where c.id = v.id and c.rpc_url is null;

-- Coins whose sell check has no verdict (no Uniswap pool path, or the API timed out): not a failure, so they are not killed;
-- the worker waits 6 hours before trying again and the buy box offers "Buy on DEX" meanwhile.
create table sell_check_skips (
  asset_id bigint primary key references assets(id) on delete cascade,
  reason text not null,
  checked_at timestamptz not null default now()
);
alter table sell_check_skips enable row level security;

alter table chains add constraint chains_swap_needs_provider check (not swap_enabled or swap_provider is not null);

-- Switching the Uniswap chains on is 0020, applied after the code that knows `swap_provider` is deployed.
