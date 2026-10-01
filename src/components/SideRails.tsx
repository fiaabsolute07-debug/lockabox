'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { displaySymbol, orderedChains } from './api';
import { useAppContext } from './AppShell';
import { ChainIcon } from './ChainIcon';
import { LockyLogo } from './LockyLogo';
import { useT, type TranslationKey } from './i18n';

/**
 * Wide screens only (≥ 1360 px, see globals.css): the space beside the centred column holds the live pulls on the left and
 * the chain switcher plus Locky's tips on the right (DECISIONS #26). Both read the shell's feed, which is held back while a
 * reel spins, so the rails never spoil a pull.
 */
export function SideRails() {
  return <>
    <LeftRail />
    <RightRail />
  </>;
}

function LeftRail() {
  const { t, time, number } = useT();
  const { feed } = useAppContext();
  const items = feed?.items.slice(0, 8) ?? [];
  return (
    <aside className="side-rail side-rail-left" aria-label={t('liveFeed')}>
      <span className="eyebrow">{t('railLivePulls')}</span>
      <ol className="rail-feed">
        {items.length ? items.map((item) => {
          const symbol = item.symbol ? `$${displaySymbol(item)}` : t('aToken');
          const tier = item.tier ?? 'micro';
          const row = <><i style={{ background: `var(--r-${tier})` }} /><b>{symbol}</b><span>{item.kind === 'buy' ? t('railBought') : tier}</span><small>{time(item.at)}</small></>;
          return <li key={`${item.kind}-${item.ref}`}>{item.kind === 'pull' ? <Link href={`/verify/${item.ref}`}>{row}</Link> : <div>{row}</div>}</li>;
        }) : <li className="rail-empty-line">{t('noPullsYet')}</li>}
      </ol>
      {feed?.stats && <div className="rail-stats">
        <div><strong>{number(feed.stats.rolls1h)}</strong><span>{t('openedHour')}</span></div>
        <div><strong>{number(feed.stats.buysToday)}</strong><span>{t('buysToday')}</span></div>
      </div>}
    </aside>
  );
}

const TIPS: TranslationKey[] = ['railTipSpace', 'railTipFair', 'railTipVerify', 'railTipNfa', 'railTipEarn'];

function RightRail() {
  const { t } = useT();
  const { meta, selectedChain, setSelectedChain } = useAppContext();
  const chains = orderedChains(meta?.chains).filter((chain) => chain.poolSize).slice(0, 9);
  return (
    <aside className="side-rail side-rail-right" aria-label={t('chains')}>
      <span className="eyebrow">{t('chains')}</span>
      <div className="rail-chains">
        <button className={selectedChain === 'all' ? 'active' : ''} onClick={() => setSelectedChain('all')}><ChainIcon id="all" />{t('allChains')}</button>
        {chains.map((chain) => <button key={chain.id} className={selectedChain === chain.id ? 'active' : ''} onClick={() => setSelectedChain(chain.id)}><ChainIcon id={chain.id} name={chain.name} />{chain.name}<small>{chain.poolSize}</small></button>)}
      </div>
      <LockyTips />
    </aside>
  );
}

/** Locky types one tip at a time, waits, then moves to the next. Reduced motion shows each tip whole. */
function LockyTips() {
  const { t } = useT();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const [still, setStill] = useState(false);
  const text = t(TIPS[index]);
  useEffect(() => { setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  useEffect(() => {
    if (still || shown >= text.length) {
      const next = window.setTimeout(() => { setIndex((value) => (value + 1) % TIPS.length); setShown(0); }, still ? 7000 : 4200);
      return () => window.clearTimeout(next);
    }
    const tick = window.setTimeout(() => setShown((value) => value + 1), 38);
    return () => window.clearTimeout(tick);
  }, [shown, still, text]);
  return (
    <div className="rail-tips">
      <LockyLogo size={44} />
      <p aria-live="off"><span className="eyebrow">{t('railTipLabel')}</span>{still ? text : text.slice(0, shown)}<i className="rail-caret" aria-hidden="true" /></p>
    </div>
  );
}

/** Dotted clouds drifting behind the page and a few twinkling dots: the claim-page sky. Decorative only. */
export function DotSky() {
  return (
    <div className="dot-sky" aria-hidden="true">
      <span className="sky-cloud sky-cloud-a" />
      <span className="sky-cloud sky-cloud-b" />
      <span className="sky-cloud sky-cloud-c" />
      {Array.from({ length: 14 }, (_, i) => <span key={i} className="sky-star" style={{ left: `${(i * 37 + 11) % 100}%`, top: `${(i * 53 + 7) % 92}%`, animationDelay: `${(i * 0.7) % 5}s` }} />)}
    </div>
  );
}
