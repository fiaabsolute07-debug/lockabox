'use client';

import TokenImage from './TokenImage';

import Link from 'next/link';
import { displaySymbol, formatCompactUsd, formatPercent, formatPrice, tierColor, tierLabel, type AssetDetail, type Chain, type Tier } from './api';
import { ChainIcon } from './ChainIcon';
import { useT } from './i18n';
import SharePullButton from './SharePullButton';
import SwapBox from './SwapBox';
import { ChartEmbed } from './MarketView';

/**
 * The coin card shown in the middle of the screen right after a pull (owner request, modelled on a "you got …" reward card).
 * The buy box is the focus: in-app buy with the amount pre-filled when the chain has swap on, otherwise a primary "Buy on
 * DEX Screener" button. Everything shown is real market data; no countdowns, no invented scarcity, no price promises (LAB §0.4.8/10).
 * Nothing is bought without the user's click and wallet signature (AC-040).
 */
export default function PullCard({ asset, tier, chance, rollId, chain, againRef, onAgain, onClose }: {
  asset: AssetDetail; tier: Tier; chance?: number; rollId: number; chain?: Chain;
  againRef?: React.Ref<HTMLButtonElement>; onAgain: () => void; onClose: () => void;
}) {
  const { t, locale, number, age } = useT();
  const symbol = displaySymbol(asset);
  const change = asset.change.h24;
  const stats: [string, string][] = [
    [t('marketCap'), formatCompactUsd(asset.marketCap, locale)],
    [t('liquidity'), formatCompactUsd(asset.liquidityUsd, locale)],
    [t('volume24h'), formatCompactUsd(asset.volume24h, locale)],
    [t('pullAge'), asset.pairCreatedAt ? age(asset.pairCreatedAt).replace(' ago', '') : '—'],
  ];
  return <div className="pull-card" style={{ '--rarity': tierColor(tier) } as React.CSSProperties} role="document">
    <header className="pull-bar">
      <span className="pull-eyebrow">{tierLabel(tier)}{chance ? ` · ${t('revealOdds', { percent: number(chance / 100, { maximumFractionDigits: 2 }) })}` : ''} · {t('pullUnboxed')}</span>
      <div className="pull-bar-actions">
        <button ref={againRef} type="button" className="button button-outline" onClick={onAgain}>↻ {t('openAgain')}</button>
        <button type="button" className="pull-close" onClick={onClose} aria-label={t('close')} title={t('close')}>✕</button>
      </div>
    </header>
    <section className="pull-coin">
      <div className="pull-art"><TokenImage src={asset.imageUrl} symbol={symbol} /></div>
      <div className="pull-name">
        <h2>${symbol}</h2>
        <p className="pull-sub">{asset.name && asset.name !== asset.symbol ? `${asset.name} · ` : ''}<ChainIcon id={asset.chainId} name={chain?.name} size={14} /> {chain?.name ?? asset.chainId}</p>
      </div>
      <div className="pull-price"><b>{asset.stale ? '—' : formatPrice(asset.priceUsd, locale)}</b>{!asset.stale && change !== null && <span className={change >= 0 ? 'up-text' : 'down-text'}>{formatPercent(change, locale)} · 24h</span>}</div>
    </section>
    <section className="pull-buy">
      <SwapBox asset={asset} rollId={rollId} onRollAgain={onAgain} />
    </section>
    <section className="pull-details">
      <div className="pull-stats">{stats.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
      {/* Owner request: the chart right on the card (official embed, GeckoTerminal fallback; LAB §3.4), compact toolbar. */}
      <div className="pull-chart"><ChartEmbed asset={asset} compact /></div>
      {asset.lockaboxBuys24h > 0 && <p className="pull-proof">{t('pullBuysToday', { count: asset.lockaboxBuys24h })}</p>}
      <div className="pull-links">
        {asset.links.dexscreener && <a href={asset.links.dexscreener} target="_blank" rel="noreferrer">{t('pullChart')}</a>}
        {asset.links.explorer && <a href={asset.links.explorer} target="_blank" rel="noreferrer">{t('explorerLink')}</a>}
        <Link href={`/verify/${rollId}`}>{t('verify')} ✓</Link>
        <SharePullButton rollId={rollId} symbol={symbol} />
      </div>
    </section>
  </div>;
}
