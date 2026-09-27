'use client';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { EvmWalletProvider } from './EvmWallet';
import '@/styles/wallet-adapter.css';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider><EvmWalletProvider>{children}</EvmWalletProvider></WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
