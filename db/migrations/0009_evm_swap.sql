-- EVM in-app swap via LI.FI (DECISIONS #10). Everything stays OFF (chains.swap_enabled = false) until the owner decides:
-- LI.FI adds its own 0.25 % fee to every route and its terms exclude US persons. Lockabox's own fee stays 0.
alter table chains add column evm_chain_id int;
alter table chains add column rpc_url text;
alter table chains add column native_symbol text;
alter table chains add column native_decimals int not null default 18;

update chains set evm_chain_id = 8453, rpc_url = 'https://mainnet.base.org',               native_symbol = 'ETH'  where id = 'base';
update chains set evm_chain_id = 56,   rpc_url = 'https://bsc-dataseed.bnbchain.org',      native_symbol = 'BNB'  where id = 'bsc';
update chains set evm_chain_id = 1,    rpc_url = 'https://ethereum-rpc.publicnode.com',    native_symbol = 'ETH'  where id = 'ethereum';
update chains set evm_chain_id = 4663, rpc_url = 'https://rpc.mainnet.chain.robinhood.com', native_symbol = 'ETH',
  explorer_tx_url = 'https://robinhoodchain.blockscout.com/tx/{tx}', explorer_token_url = 'https://robinhoodchain.blockscout.com/token/{address}' where id = 'robinhood';
update chains set evm_chain_id = 5042, rpc_url = 'https://rpc.mainnet.arc.io',              native_symbol = 'USDC',
  explorer_tx_url = 'https://explorer.arc.io/tx/{tx}', explorer_token_url = 'https://explorer.arc.io/token/{address}' where id = 'arc';
update chains set native_symbol = 'SOL', native_decimals = 9 where id = 'solana';
update chains set native_decimals = 6 where id = 'arc'; -- LI.FI routes Arc buys from USDC (6 decimals, ERC-20 approve first)

-- EVM sell-check gate results use the same gate_results table ('honeypot'), filled by honeypot.is (ETH/BSC/Base)
-- or a LI.FI buy→sell quote round trip (Robinhood, Arc).
