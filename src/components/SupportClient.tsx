'use client';

import { useState } from 'react';
import { ChainIcon } from './ChainIcon';
import { LockyLogo } from './LockyLogo';
import { explorerUrl, type DonateWallet } from './donate';
import { useT } from './i18n';

/** /support: tip addresses with copy + QR. A tip is a gift: no points, no better odds (rolls stay uniform, DECISIONS #25). */
export default function SupportClient({ wallets }: { wallets: (DonateWallet & { qr: string })[] }) {
  const { t } = useT();
  return (
    <div className="workspace-grid leaderboard-layout">
      <main className="main-column leaderboard-main">
        <section className="panel support-card">
          <div className="support-hero">
            <div className="support-locky"><span className="locky-bubble nfa-bubble" aria-hidden="true">{t('supportBubble')}</span><LockyLogo size={112} /></div>
            <div><span className="eyebrow">{t('supportEyebrow')}</span><h1>{t('supportTitle')}</h1><p>{t('supportIntro')}</p></div>
          </div>
          <div className="support-wallets">{wallets.map((w) => <WalletCard key={w.family} wallet={w} />)}</div>
          <ul className="support-notes">
            <li>{t('supportNoPerks')}</li>
            <li>{t('supportNetwork')}</li>
            <li>{t('supportPublic')}</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: DonateWallet & { qr: string } }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(wallet.address); setCopied(true); window.setTimeout(() => setCopied(false), 1_500); } catch { setCopied(false); }
  };
  const sol = wallet.family === 'solana';
  return (
    <div className="support-wallet">
      <div className="support-qr" role="img" aria-label={t('supportQr', { network: sol ? 'Solana' : 'EVM' })} dangerouslySetInnerHTML={{ __html: wallet.qr }} />
      <div className="support-wallet-body">
        <strong className="support-network"><ChainIcon id={sol ? 'solana' : 'ethereum'} name={sol ? 'Solana' : 'Ethereum'} size={18} />{sol ? t('supportSolana') : t('supportEvm')}</strong>
        <small className="muted">{sol ? t('supportSolanaHint') : t('supportEvmHint')}</small>
        <code className="support-address mono">{wallet.address}</code>
        <div className="support-actions">
          <button className="button button-primary" onClick={copy}>{copied ? t('copied') : t('supportCopy')}</button>
          <a className="verify-link" href={explorerUrl(wallet)} target="_blank" rel="noopener noreferrer">{t('supportExplorer')} ↗</a>
        </div>
      </div>
    </div>
  );
}
