'use client';

import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana';
import { PublicKey, type Connection, type VersionedTransaction } from '@solana/web3.js';
import { useMemo } from 'react';

export function useSolanaWallet() {
  const account = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const publicKey = useMemo(() => {
    try { return account.isConnected && account.address ? new PublicKey(account.address) : null; }
    catch { return null; }
  }, [account.address, account.isConnected]);
  const sendTransaction = async (transaction: VersionedTransaction, connection: Connection) => {
    if (!walletProvider || !publicKey) throw new Error('Connect a Solana wallet first.');
    // Prefer the wallet's atomic sign-and-send path. Never retry after rejection or
    // an ambiguous transport error: that could submit the same buy twice.
    try { return await walletProvider.signAndSendTransaction(transaction); }
    catch (error) {
      if (!(error instanceof Error) || !['WalletStandardFeatureNotSupportedError', 'WalletConnectMethodNotSupportedError'].includes(error.constructor.name)) throw error;
      return walletProvider.sendTransaction(transaction, connection);
    }
  };
  return { publicKey, walletProvider, sendTransaction, caipAddress: account.caipAddress };
}
