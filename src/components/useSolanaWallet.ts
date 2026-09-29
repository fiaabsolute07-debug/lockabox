'use client';

import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana';
import { PublicKey, type Connection, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { useMemo } from 'react';
import { sendSolanaTransaction, viaWalletConnect, type SolanaSender } from './solanaSend';

export function useSolanaWallet() {
  const account = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const publicKey = useMemo(() => {
    try { return account.isConnected && account.address ? new PublicKey(account.address) : null; }
    catch { return null; }
  }, [account.address, account.isConnected]);
  const sendTransaction = async (transaction: Transaction | VersionedTransaction, connection: Connection, signal?: AbortSignal) => {
    if (!walletProvider || !publicKey) throw new Error('Connect a Solana wallet first.');
    return sendSolanaTransaction(walletProvider as unknown as SolanaSender, transaction, connection, signal);
  };
  // Phone wallets over WalletConnect get legacy transactions: several (OKX, Trust…) can't sign Jupiter's v0 ones there.
  return { publicKey, walletProvider, sendTransaction, caipAddress: account.caipAddress, wantsLegacy: viaWalletConnect(walletProvider) };
}
