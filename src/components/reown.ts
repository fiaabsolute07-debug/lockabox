'use client';

import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import {
  mainnet, base, bsc, arbitrum, optimism, polygon, avalanche, solana, linea, scroll, mantle, blast, gnosis, celo, sonic,
  unichain, monad, xLayer, worldchain, soneium, megaeth, robinhood, arc, ink, zora,
} from '@reown/appkit/networks';

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
if (!projectId) throw new Error('Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable WalletConnect.');

// Every EVM chain with in-app buys (Uniswap, DECISIONS #21) must be listed: a WalletConnect session only approves these networks.
export const walletNetworks = [
  solana, mainnet, base, bsc, arbitrum, optimism, polygon, avalanche, linea, scroll, mantle, blast, gnosis, celo, sonic,
  unichain, monad, xLayer, worldchain, soneium, megaeth, robinhood, arc, ink, zora,
] as const;
const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lockabox.fun';

export const walletKit = createAppKit({
  adapters: [new EthersAdapter(), new SolanaAdapter()],
  networks: [...walletNetworks],
  projectId,
  metadata: { name: 'Lockabox', description: 'Connect your wallet to Lockabox', url: origin, icons: [] },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#ff5b1f', '--w3m-border-radius-master': '2px', '--w3m-font-family': 'Arial, sans-serif' },
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
  enableWalletConnect: true,
  allWallets: 'SHOW',
});
