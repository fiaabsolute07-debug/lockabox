import type { Chain, WalletClient } from 'viem';

/** A wallet closed its popup: EIP-1193 code 4001 (viem wraps it as UserRejectedRequestError). Shown quietly, not as a failure. */
export function isUserRejection(error: unknown): boolean {
  let current = error as { code?: number; name?: string; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === 4001 || current.name === 'UserRejectedRequestError' || /user (rejected|denied)|request rejected/i.test(String((current as { message?: string }).message ?? ''))) return true;
    current = current.cause as typeof current;
  }
  return false;
}

/** The connected wallet cannot use this network, e.g. a mobile wallet over WalletConnect without Robinhood Chain. */
export class WalletChainUnsupportedError extends Error {
  constructor(public chainId: number) {
    super(`the wallet cannot use chain ${chainId} on this connection`);
    this.name = 'WalletChainUnsupportedError';
  }
}

type WcSession = { namespaces?: Record<string, { chains?: string[]; accounts?: string[] }> };

/** The live WalletConnect session behind a provider (Reown's UniversalProvider), or null for extension wallets. */
export function walletConnectSession(provider: unknown): WcSession | null {
  const session = (provider as { session?: WcSession } | null | undefined)?.session;
  return session && typeof session === 'object' && session.namespaces ? session : null;
}

export function sessionHasChain(session: WcSession | null, chainId: number) {
  const ns = session?.namespaces?.eip155, id = `eip155:${chainId}`;
  return !!(ns?.chains?.includes(id) || ns?.accounts?.some((a) => a.startsWith(`${id}:`)));
}

function errorCode(error: unknown): number | undefined {
  const e = error as { code?: number; cause?: { code?: number } } | undefined;
  return e?.code ?? e?.cause?.code;
}

/**
 * Switches the wallet to `chainId`, adding the network first when the wallet does not know it.
 * WalletConnect sessions only ask mobile wallets for common chains (see reown.ts), so a rarer chain is requested here, when a
 * buy needs it: the wallet adds it and extends the session, or it can't and the caller shows another way to buy.
 * Transactions on a chain the session never approved are refused by the WalletConnect client, so the session is checked too.
 */
export async function switchWalletChain(p: {
  client: Pick<WalletClient, 'switchChain' | 'addChain'>; provider: unknown; chainId: number; network?: Chain; waitMs?: number;
}) {
  const { client, provider, chainId, network } = p;
  const viaWalletConnect = !!walletConnectSession(provider);
  const unsupported = () => new WalletChainUnsupportedError(chainId);
  try {
    await client.switchChain({ id: chainId });
  } catch (error) {
    if (isUserRejection(error)) throw error;
    // 4902: the wallet does not know this chain yet. Mobile wallets over WalletConnect answer with other codes, so try adding there too.
    if (!network || (errorCode(error) !== 4902 && !viaWalletConnect)) throw viaWalletConnect ? unsupported() : error;
    try {
      await client.addChain({ chain: network });
      await client.switchChain({ id: chainId });
    } catch (retry) {
      if (isUserRejection(retry)) throw retry;
      throw viaWalletConnect ? unsupported() : retry;
    }
  }
  if (!viaWalletConnect) return;
  // The wallet extends the session (session_update) right after adding the chain; give it a moment.
  const deadline = Date.now() + (p.waitMs ?? 4000);
  while (!sessionHasChain(walletConnectSession(provider), chainId)) {
    if (Date.now() >= deadline) throw unsupported();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
