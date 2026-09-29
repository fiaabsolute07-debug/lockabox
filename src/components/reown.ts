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

// Every EVM chain with in-app buys (Uniswap, DECISIONS #21) must be listed so extension wallets can switch/add it;
// WalletConnect sessions ask for the smaller WALLETCONNECT_EVM_CHAINS set below.
export const walletNetworks = [
  solana, mainnet, base, bsc, arbitrum, optimism, polygon, avalanche, linea, scroll, mantle, blast, gnosis, celo, sonic,
  unichain, monad, xLayer, worldchain, soneium, megaeth, robinhood, arc, ink, zora,
] as const;
/**
 * Networks asked for in a WalletConnect (QR / mobile) session. Mobile wallets (Trust, Binance, OKX) can reject the whole
 * pairing when the proposal lists chains they don't know (MegaETH, Robinhood, Arc…), so QR sessions only ask for chains
 * every major mobile wallet supports. Browser-extension wallets still reach every chain in walletNetworks.
 */
const WALLETCONNECT_EVM_CHAINS = [mainnet, base, bsc, arbitrum, optimism, polygon, avalanche, linea].map((n) => `eip155:${n.id}`);
const WALLETCONNECT_EVM_METHODS = ['eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'];

const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lockabox.fun';

export const walletKit = createAppKit({
  adapters: [new EthersAdapter(), new SolanaAdapter()],
  networks: [...walletNetworks],
  projectId,
  metadata: { name: 'Lockabox', description: 'Connect your wallet to Lockabox', url: origin, icons: [`${origin}/apple-icon.png`] },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#ff5b1f', '--w3m-border-radius-master': '2px', '--w3m-font-family': 'Arial, sans-serif' },
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
  enableWalletConnect: true,
  universalProviderConfigOverride: { chains: { eip155: WALLETCONNECT_EVM_CHAINS }, methods: { eip155: WALLETCONNECT_EVM_METHODS } },
  allWallets: 'SHOW',
});
