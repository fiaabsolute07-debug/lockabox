/** Tip addresses (public). Unset or malformed: that network is hidden; neither set: no /support page and no links. */
export type DonateWallet = { family: 'solana' | 'evm'; address: string };

const SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;

export function donateWallets(): DonateWallet[] {
  const sol = process.env.NEXT_PUBLIC_DONATE_SOL?.trim();
  const evm = process.env.NEXT_PUBLIC_DONATE_EVM?.trim();
  return [
    ...(sol && SOL.test(sol) ? [{ family: 'solana' as const, address: sol }] : []),
    ...(evm && EVM.test(evm) ? [{ family: 'evm' as const, address: evm }] : []),
  ];
}

export const donateOn = donateWallets().length > 0;

/** Where anyone can see what came in: tips are public. */
export function explorerUrl(w: DonateWallet) {
  return w.family === 'solana' ? `https://solscan.io/account/${w.address}` : `https://debank.com/profile/${w.address}`;
}
