import { describe, expect, it, vi } from 'vitest';
import { defineChain } from 'viem';
import { sessionHasChain, switchWalletChain, WalletChainUnsupportedError } from '@/components/walletChain';

const robinhood = defineChain({ id: 4663, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.example'] } } });
const rejected = () => Object.assign(new Error('User rejected the request.'), { code: 4001 });
const unknownChain = () => Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });

/** A WalletConnect session like Reown's UniversalProvider holds; `extend` mimics the wallet's session_update after adding a chain. */
function wcProvider(chains: string[]) {
  const provider = { session: { namespaces: { eip155: { chains: [...chains], accounts: chains.map((c) => `${c}:0xabc`) } } } };
  return { provider, extend: (id: string) => { provider.session = { namespaces: { eip155: { chains: [...chains, id], accounts: [...chains, id].map((c) => `${c}:0xabc`) } } }; } };
}

describe('switching the wallet to the coin’s chain', () => {
  it('extension wallet: 4902 → add the chain, then switch', async () => {
    const client = { switchChain: vi.fn().mockRejectedValueOnce(unknownChain()).mockResolvedValue(undefined), addChain: vi.fn().mockResolvedValue(undefined) };
    await switchWalletChain({ client, provider: {}, chainId: 4663, network: robinhood });
    expect(client.addChain).toHaveBeenCalledWith({ chain: robinhood });
    expect(client.switchChain).toHaveBeenCalledTimes(2);
  });

  it('extension wallet: other errors pass through unchanged', async () => {
    const boom = new Error('boom');
    const client = { switchChain: vi.fn().mockRejectedValue(boom), addChain: vi.fn() };
    await expect(switchWalletChain({ client, provider: {}, chainId: 4663, network: robinhood })).rejects.toBe(boom);
    expect(client.addChain).not.toHaveBeenCalled();
  });

  it('WalletConnect: a wallet that adds the chain and extends the session can buy there', async () => {
    const { provider, extend } = wcProvider(['eip155:1', 'eip155:8453']);
    const client = {
      switchChain: vi.fn().mockRejectedValueOnce(new Error('Unsupported chain')).mockResolvedValue(undefined),
      addChain: vi.fn(async () => { setTimeout(() => extend('eip155:4663'), 50); }),
    };
    await switchWalletChain({ client, provider, chainId: 4663, network: robinhood, waitMs: 1000 });
    expect(sessionHasChain(provider.session, 4663)).toBe(true);
  });

  it('WalletConnect: a wallet that can’t add the chain gets a clear "unsupported" error', async () => {
    const { provider } = wcProvider(['eip155:1']);
    const client = { switchChain: vi.fn().mockRejectedValue(new Error('Unsupported chain')), addChain: vi.fn().mockRejectedValue(new Error('Method not supported')) };
    await expect(switchWalletChain({ client, provider, chainId: 4663, network: robinhood })).rejects.toBeInstanceOf(WalletChainUnsupportedError);
  });

  it('WalletConnect: a switch that "succeeds" without the session approving the chain is still unsupported', async () => {
    const { provider } = wcProvider(['eip155:1']);
    const client = { switchChain: vi.fn().mockResolvedValue(undefined), addChain: vi.fn() };
    await expect(switchWalletChain({ client, provider, chainId: 4663, network: robinhood, waitMs: 300 })).rejects.toBeInstanceOf(WalletChainUnsupportedError);
  });

  it('WalletConnect: an approved chain switches straight away; a rejection stays a rejection', async () => {
    const { provider } = wcProvider(['eip155:1', 'eip155:8453']);
    await switchWalletChain({ client: { switchChain: vi.fn().mockResolvedValue(undefined), addChain: vi.fn() }, provider, chainId: 8453 });
    const client = { switchChain: vi.fn().mockRejectedValue(new Error('x')), addChain: vi.fn().mockRejectedValue(rejected()) };
    await expect(switchWalletChain({ client, provider, chainId: 4663, network: robinhood })).rejects.toMatchObject({ code: 4001 });
  });
});
