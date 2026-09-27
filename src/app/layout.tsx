import type { Metadata } from 'next';
import { Caveat, Inter, JetBrains_Mono } from 'next/font/google';
import WalletProviders from '@/components/WalletProviders';
import AppShell from '@/components/AppShell';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const caveat = Caveat({ subsets: ['latin'], variable: '--font-note', weight: '700' });

export const metadata: Metadata = {
  title: 'Lockabox · Random token discovery',
  description: 'Open a free case, inspect the pull, and decide what to do next.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${caveat.variable}`}>
      <body><WalletProviders><AppShell>{children}</AppShell></WalletProviders></body>
    </html>
  );
}
