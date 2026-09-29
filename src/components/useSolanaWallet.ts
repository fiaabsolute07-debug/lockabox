'use client';

import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana';
import { PublicKey, type Connection, type VersionedTransaction } from '@solana/web3.js';
import { useMemo } from 'react';
import { sendSolanaTransaction } from './solanaSend';

export function useSolanaWallet() {
  const account = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const publicKey = useMemo(() => {
    try { return account.isConnected && account.address ? new PublicKey(account.address) : null; }
    catch { return null; }
  }, [account.address, account.isConnected]);
  const sendTransaction = async (transaction: VersionedTransaction, connection: Connection) => {
    if (!walletProvider || !publicKey) throw new Error('Connect a Solana wallet first.');
    return sendSolanaTransaction(walletProvider as unknown as Parameters<typeof sendSolanaTransaction>[0], transaction, connection);
  };
  return { publicKey, walletProvider, sendTransaction, caipAddress: account.caipAddress };
}
