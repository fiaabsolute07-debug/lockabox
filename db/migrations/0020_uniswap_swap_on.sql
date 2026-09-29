-- Switch in-app buys on for the Uniswap chains (owner request 2026-09-29, DECISIONS #21).
-- Separate from 0019 so it runs only after the web and worker that route by `swap_provider` are live.
-- Undo per chain: update chains set swap_enabled = false where id = '…';
update chains set swap_enabled = true
where swap_provider = 'uniswap' and enabled and evm_chain_id is not null and rpc_url is not null and native_symbol is not null;
