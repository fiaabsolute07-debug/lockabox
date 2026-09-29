import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Caveat, Inter, JetBrains_Mono } from 'next/font/google';
import WalletProviders from '@/components/WalletProviders';
import AppShell from '@/components/AppShell';
import { LanguageProvider } from '@/components/i18n';
import { DISCLAIMER_COOKIE } from '@/components/language';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const caveat = Caveat({ subsets: ['latin'], variable: '--font-note', weight: '700' });

export const metadata: Metadata = {
  title: 'Lockabox · Random token discovery',
  description: 'Open a free case, inspect the pull, and decide what to do next.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The first-visit disclaimer is rendered on the server, so it paints with the page instead of after hydration (AC-077).
  const disclaimerSeen = (await cookies()).get(DISCLAIMER_COOKIE)?.value === '1';
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${caveat.variable}`}>
      <body><LanguageProvider><WalletProviders><AppShell disclaimerSeen={disclaimerSeen}>{children}</AppShell></WalletProviders></LanguageProvider></body>
    </html>
  );
}
