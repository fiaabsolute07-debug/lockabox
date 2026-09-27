'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createWalletClient, custom, type EIP1193Provider, type Hex, type WalletClient } from 'viem';

/**
 * Injected EVM wallets (AC-036/004) without a wallet SDK: EIP-6963 discovery (MetaMask, Rabby, Coinbase Wallet…), falling back to
 * `window.ethereum`, driven through viem's `custom` transport. Nothing is signed or sent without a click; the key stays in the wallet.
 * WalletConnect needs a project id from the owner and is not wired.
 */

export type EvmProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
export type EvmProviderDetail = { info: EvmProviderInfo; provider: EIP1193Provider };
export type EvmTx = { to: string; data: string; value: string; gasLimit: string | null; chainId: number };
type Connection = { detail: EvmProviderDetail; client: WalletClient; address: `0x${string}`; chainId: number };

type EvmWalletValue = {
  providers: EvmProviderDetail[];
  connection: Connection | null;
  connect: (detail: EvmProviderDetail) => Promise<Connection>;
  forget: () => void;
  switchChain: (chainId: number) => Promise<void>;
  signMessage: (message: string) => Promise<Hex>;
  sendTransaction: (tx: EvmTx) => Promise<Hex>;
  waitForReceipt: (hash: Hex, options?: { intervalMs?: number; timeoutMs?: number }) => Promise<'success' | 'reverted'>;
  chooserOpen: boolean;
  setChooserOpen: (open: boolean) => void;
};

const EvmWalletContext = createContext<EvmWalletValue | null>(null);

export function useEvmWallet() {
  const value = useContext(EvmWalletContext);
  if (!value) throw new Error('useEvmWallet must be used inside EvmWalletProvider');
  return value;
}

/** A wallet closed its popup: EIP-1193 code 4001 (viem wraps it as UserRejectedRequestError). Shown quietly, not as a failure. */
export function isUserRejection(error: unknown): boolean {
  let current = error as { code?: number; name?: string; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === 4001 || current.name === 'UserRejectedRequestError') return true;
    current = current.cause as typeof current;
  }
  return false;
}

export function EvmWalletProvider({ children }: { children: React.ReactNode }) {
  const [providers, setProviders] = useState<EvmProviderDetail[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const connectionRef = useRef<Connection | null>(null);
  connectionRef.current = connection;

  useEffect(() => {
    const found = new Map<string, EvmProviderDetail>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<EvmProviderDetail>).detail;
      if (!detail?.info?.uuid || typeof detail.provider?.request !== 'function') return;
      found.set(detail.info.uuid, detail);
      setProviders([...found.values()]);
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    // Wallets that predate EIP-6963 only inject window.ethereum.
    const legacy = window.setTimeout(() => {
      const injected = (window as { ethereum?: EIP1193Provider }).ethereum;
      if (!found.size && injected && typeof injected.request === 'function') {
        setProviders([{ info: { uuid: 'injected', name: 'Browser wallet', icon: '', rdns: 'injected' }, provider: injected }]);
      }
    }, 400);
    return () => { window.removeEventListener('eip6963:announceProvider', onAnnounce); window.clearTimeout(legacy); };
  }, []);

  // Follow account and network changes made inside the wallet.
  useEffect(() => {
    const provider = connection?.detail.provider;
    if (!provider?.on) return;
    const onAccounts = (accounts: string[]) => {
      if (!accounts.length) { setConnection(null); return; }
      setConnection((current) => current ? { ...current, address: accounts[0].toLowerCase() as `0x${string}` } : current);
    };
    const onChain = (chainId: string) => setConnection((current) => current ? { ...current, chainId: Number(chainId) } : current);
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => { provider.removeListener?.('accountsChanged', onAccounts); provider.removeListener?.('chainChanged', onChain); };
  }, [connection?.detail.provider]);

  const connect = useCallback(async (detail: EvmProviderDetail) => {
    const client = createWalletClient({ transport: custom(detail.provider) });
    const [address] = await client.requestAddresses();
    if (!address) throw new Error('the wallet returned no account');
    const chainId = await client.getChainId();
    const next: Connection = { detail, client, address: address.toLowerCase() as `0x${string}`, chainId };
    setConnection(next);
    return next;
  }, []);

  const current = useCallback(() => {
    const c = connectionRef.current;
    if (!c) throw new Error('connect an EVM wallet first');
    return c;
  }, []);

  const switchChain = useCallback(async (chainId: number) => {
    const c = current();
    if (c.chainId === chainId) return;
    await c.client.switchChain({ id: chainId });
    const now = await c.client.getChainId();
    setConnection((value) => value ? { ...value, chainId: now } : value);
    connectionRef.current = { ...c, chainId: now };
    if (now !== chainId) throw new Error('the wallet did not switch network');
  }, [current]);

  const signMessage = useCallback(async (message: string) => {
    const c = current();
    return c.client.signMessage({ account: c.address, message });
  }, [current]);

  const sendTransaction = useCallback(async (tx: EvmTx) => {
    const c = current();
    if (c.chainId !== tx.chainId) throw new Error('the wallet is on another network');
    // chain: null → viem sends eth_sendTransaction as is; the wallet fills gas price and nonce and shows the request.
    return c.client.sendTransaction({
      account: c.address, chain: null, to: tx.to as `0x${string}`, data: tx.data as Hex, value: BigInt(tx.value || '0x0'),
      ...(tx.gasLimit ? { gas: BigInt(tx.gasLimit) } : {}),
    });
  }, [current]);

  const waitForReceipt = useCallback(async (hash: Hex, options: { intervalMs?: number; timeoutMs?: number } = {}) => {
    const c = current();
    const deadline = Date.now() + (options.timeoutMs ?? 180_000);
    while (Date.now() < deadline) {
      const receipt = await c.detail.provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }) as { status?: string } | null;
      if (receipt?.status === '0x1') return 'success';
      if (receipt?.status === '0x0') return 'reverted';
      await new Promise((resolve) => window.setTimeout(resolve, options.intervalMs ?? 2_000));
    }
    throw new Error('no receipt yet; check the explorer');
  }, [current]);

  const forget = useCallback(() => setConnection(null), []);

  const value = useMemo(() => ({ providers, connection, connect, forget, switchChain, signMessage, sendTransaction, waitForReceipt, chooserOpen, setChooserOpen }),
    [providers, connection, connect, forget, switchChain, signMessage, sendTransaction, waitForReceipt, chooserOpen]);
  return <EvmWalletContext.Provider value={value}>{children}</EvmWalletContext.Provider>;
}
