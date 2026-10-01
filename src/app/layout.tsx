import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { cookies } from 'next/headers';
import { Caveat } from 'next/font/google';
import localFont from 'next/font/local';
import WalletProviders from '@/components/WalletProviders';
import AppShell from '@/components/AppShell';
import { LanguageProvider } from '@/components/i18n';
import { DISCLAIMER_COOKIE } from '@/components/language';
import '@/styles/globals.css';

// Text in DM Mono, headings and numbers in Doto's dot-matrix (DECISIONS #26). Self-hosted (src/assets/fonts, OFL).
const mono = localFont({
  src: [{ path: '../assets/fonts/DMMono-400.woff2', weight: '400' }, { path: '../assets/fonts/DMMono-500.woff2', weight: '500' }],
  variable: '--font-mono', fallback: ['ui-monospace', 'Menlo', 'monospace'],
});
const doto = localFont({ src: '../assets/fonts/Doto-Variable.woff2', weight: '100 900', variable: '--font-doto', fallback: ['monospace'] });
const caveat = Caveat({ subsets: ['latin'], variable: '--font-note', weight: '700' });

export const metadata: Metadata = {
  title: 'Lockabox · Random token discovery',
  description: 'Open a free case, inspect the pull, and decide what to do next.',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The first-visit disclaimer is rendered on the server, so it paints with the page instead of after hydration (AC-077).
  const disclaimerSeen = (await cookies()).get(DISCLAIMER_COOKIE)?.value === '1';
  return (
    <html lang="en" className={`${mono.variable} ${doto.variable} ${caveat.variable}`}>
      <body><LanguageProvider><WalletProviders><AppShell disclaimerSeen={disclaimerSeen}>{children}</AppShell></WalletProviders></LanguageProvider><Analytics /><SpeedInsights /></body>
    </html>
  );
}
