'use client';
import './reown';

import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { EvmWalletProvider } from './EvmWallet';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <EvmWalletProvider>{children}</EvmWalletProvider>
    </ConnectionProvider>
  );
}
