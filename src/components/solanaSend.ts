import type { Connection, Transaction, VersionedTransaction } from '@solana/web3.js';

type AnyTx = Transaction | VersionedTransaction;
export type SolanaSender = {
  signAndSendTransaction: (tx: AnyTx) => Promise<string>;
  signTransaction: <T extends AnyTx>(tx: T) => Promise<T>;
  session?: { namespaces?: Record<string, { methods?: string[] }> };
};

/** How long a buy waits for the wallet to answer before telling the user (the blockhash expires around then anyway). */
export const WALLET_TIMEOUT_MS = 60_000;

export class WalletTimeoutError extends Error {
  constructor() { super('the wallet did not answer in time'); this.name = 'WalletTimeoutError'; }
}

/** Connected over WalletConnect (a phone wallet via QR) rather than a browser extension. */
export function viaWalletConnect(provider: unknown) {
  return !!(provider as { session?: { namespaces?: unknown } } | null | undefined)?.session?.namespaces;
}

/**
 * Reown's "method/feature not supported" errors. Matched by message: class names are minified in production builds, so
 * `error.constructor.name` never equals "WalletConnectMethodNotSupportedError" there.
 */
export function isNotSupported(error: unknown) {
  return error instanceof Error && /is not supported by the wallet|does not support the ".+" feature/i.test(error.message);
}

/**
 * Prefer the wallet's atomic sign-and-send. Mobile wallets over WalletConnect (Trust, Binance, OKX…) often only offer
 * `solana_signTransaction`; then the wallet signs and we broadcast, unless `signal` was aborted meanwhile (the user was told
 * the wallet timed out, so a late signature must not buy behind their back). Only an explicit "not supported" (raised before
 * anything reaches the wallet) falls back; a rejection or an ambiguous transport error is never retried, which could buy twice.
 */
export async function sendSolanaTransaction(provider: SolanaSender, tx: AnyTx, connection: Pick<Connection, 'sendRawTransaction'>, signal?: AbortSignal) {
  const signThenBroadcast = async () => {
    const signed = await provider.signTransaction(tx);
    if (signal?.aborted) throw new WalletTimeoutError();
    return connection.sendRawTransaction(signed.serialize());
  };
  const methods = provider.session?.namespaces?.solana?.methods;
  if (methods && !methods.includes('solana_signAndSendTransaction')) return signThenBroadcast();
  try { return await provider.signAndSendTransaction(tx); }
  catch (error) {
    if (!isNotSupported(error)) throw error;
    return signThenBroadcast();
  }
}

/** Runs a wallet step; rejects with WalletTimeoutError (and aborts the signal) if the wallet hasn't answered in `ms`. */
export function withWalletTimeout<T>(step: (signal: AbortSignal) => Promise<T>, ms = WALLET_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new WalletTimeoutError()); }, ms); });
  const run = step(controller.signal);
  run.catch(() => undefined); // after a timeout the step's own late failure is expected; don't report it as unhandled
  return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
}
