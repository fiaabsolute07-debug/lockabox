import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import SupportClient from '@/components/SupportClient';
import { donateWallets } from '@/components/donate';

export const metadata: Metadata = { title: 'Support Locky · Lockabox', description: 'Lockabox is free and takes no fee. Tips keep Locky picking.' };

export default async function SupportPage() {
  const wallets = donateWallets();
  if (!wallets.length) notFound();
  // QR codes are drawn here, so the page ships no QR library to the browser.
  const qrs = await Promise.all(wallets.map((w) => QRCode.toString(w.address, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0B0C0F', light: '#FFFFFF' } })));
  return <SupportClient wallets={wallets.map((w, i) => ({ ...w, qr: qrs[i] }))} />;
}
