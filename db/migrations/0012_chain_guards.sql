-- AC-071: a chain can only offer in-app swap when it is enabled and its route is configured.
-- EVM needs the chain id (wallet_switchEthereumChain, LI.FI), an RPC (allowance, receipts) and the input coin's symbol.
alter table chains add constraint chains_swap_needs_enabled check (not swap_enabled or enabled);
alter table chains add constraint chains_swap_needs_route check (
  not swap_enabled or family = 'solana' or (evm_chain_id is not null and rpc_url is not null and native_symbol is not null));
