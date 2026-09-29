import type { Connection, VersionedTransaction } from '@solana/web3.js';

type SolanaSender = {
  signAndSendTransaction: (tx: VersionedTransaction) => Promise<string>;
  sendTransaction: (tx: VersionedTransaction, connection: Connection) => Promise<string>;
  session?: { namespaces?: Record<string, { methods?: string[] }> };
};

/**
 * Reown's "method/feature not supported" errors. Matched by message: class names are minified in production builds, so
 * `error.constructor.name` never equals "WalletConnectMethodNotSupportedError" there.
 */
export function isNotSupported(error: unknown) {
  return error instanceof Error && /is not supported by the wallet|does not support the ".+" feature/i.test(error.message);
}

/**
 * Prefer the wallet's atomic sign-and-send. Mobile wallets over WalletConnect (Trust, Binance, OKX…) often only offer
 * `solana_signTransaction`; then the wallet signs and we broadcast. Only an explicit "not supported" (raised before anything
 * reaches the wallet) falls back; a rejection or an ambiguous transport error is never retried, which could buy twice.
 */
export async function sendSolanaTransaction(provider: SolanaSender, tx: VersionedTransaction, connection: Connection) {
  const methods = provider.session?.namespaces?.solana?.methods;
  if (methods && !methods.includes('solana_signAndSendTransaction')) return provider.sendTransaction(tx, connection);
  try { return await provider.signAndSendTransaction(tx); }
  catch (error) {
    if (!isNotSupported(error)) throw error;
    return provider.sendTransaction(tx, connection);
  }
}
