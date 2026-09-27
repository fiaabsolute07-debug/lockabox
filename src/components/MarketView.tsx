'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  displaySymbol,
  fetchJson,
  formatAddress,
  formatCompactUsd,
  formatPercent,
  formatPrice,
  formatUsd,
  type AssetDetail,
  type BuyItem,
  tierColor,
  tierLabel,
} from './api';
import { useT } from './i18n';

export function TokenHeader({ asset, tier, rollId }: { asset: AssetDetail; tier: AssetDetail['tier']; rollId?: number }) {
  const { t, locale, age } = useT();
  const symbol = displaySymbol(asset);
  const pairAge = asset.pairCreatedAt ? age(asset.pairCreatedAt, true) : t('pairAgeUnavailable');
  return <section className="panel token-header">
    <div className="token-avatar token-avatar-large" style={{ background: tierColor(tier) }}>{symbol[0]}</div>
    <div className="token-heading"><h2>${symbol} <span>/ {asset.chainId.toUpperCase()}</span></h2><small>{asset.dexId ?? 'DEX'} · {t('pair')} {formatAddress(asset.pairAddress, 5)} · {t('created')} {pairAge}</small></div>
    {rollId && <span className="badge badge-pull">{t('yourPull')} #{rollId} · {tierLabel(tier)}</span>}
    {asset.lockaboxBuys24h > 0 && <span className="badge">{asset.lockaboxBuys24h} {t('todayBuys')}</span>}
    <div className="token-price"><b>{asset.stale ? '—' : formatPrice(asset.priceUsd, locale)} {asset.priceSource === 'dexpaprika' && <small className="price-source">{t('priceViaDexpaprika')}</small>}</b><span className={changeClass(asset.change.h24)}>{asset.stale ? t('staleSnapshot') : formatPercent(asset.change.h24, locale)} · 24h</span></div>
  </section>;
}

export function ChartEmbed({ asset }: { asset: AssetDetail }) {
  const { t } = useT();
  const [source, setSource] = useState<'dex' | 'gecko'>('dex');
  const [failed, setFailed] = useState(false);
  const dexLoadedRef = useRef(false);
  const manualSourceRef = useRef(false);
  useLayoutEffect(() => {
    dexLoadedRef.current = false;
    manualSourceRef.current = false;
    setSource(asset.chart.dexscreenerEmbed ? 'dex' : 'gecko');
    setFailed(false);
    if (!asset.chart.dexscreenerEmbed) return;
    const timeout = window.setTimeout(() => {
      if (dexLoadedRef.current || manualSourceRef.current) return;
      if (asset.chart.geckoterminalEmbed) setSource('gecko');
      else setFailed(true);
    }, 8_000);
    return () => window.clearTimeout(timeout);
  }, [asset.id, asset.chart.dexscreenerEmbed, asset.chart.geckoterminalEmbed]);

  const url = source === 'dex' ? asset.chart.dexscreenerEmbed : asset.chart.geckoterminalEmbed;
  return <section className="panel chart-panel">
    <div className="chart-tabs"><button className={source === 'dex' ? 'active' : ''} disabled={!asset.chart.dexscreenerEmbed} onClick={() => { manualSourceRef.current = true; setSource('dex'); setFailed(false); }}>DEX Screener</button><button className={source === 'gecko' ? 'active' : ''} disabled={!asset.chart.geckoterminalEmbed} onClick={() => { manualSourceRef.current = true; setSource('gecko'); setFailed(false); }}>GeckoTerminal</button><span className="chart-note">{t('officialEmbed')}</span></div>
    <div className="chart-frame">{url && !failed ? <iframe title={`${displaySymbol(asset)} chart`} src={url} onLoad={() => { if (source === 'dex') dexLoadedRef.current = true; }} /> : <div className="chart-empty">{t('chartUnavailable')}</div>}</div>
  </section>;
}

export function TradesTable({ asset }: { asset: AssetDetail }) {
  const { t, age } = useT();
  const [items, setItems] = useState<BuyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetchJson<{ items: BuyItem[] }>(`/api/assets/${asset.id}/buys`).then((value) => { if (active) setItems(value.items); }).catch(() => { if (active) setError(t('couldNotLoadBuys')); });
    return () => { active = false; };
  }, [asset.id, t]);
  return <section className="panel trades-panel">
    <div className="table-tabs"><button className="active">{t('buysViaLockabox')}</button><button disabled>{t('allTrades')} <small>{t('soon')}</small></button><button disabled>{t('topPullers')} <small>{t('soon')}</small></button><button disabled>{t('holders')} <small>{t('soon')}</small></button></div>
    {error ? <p className="inline-error">{error}</p> : items.length === 0 ? <p className="empty-table">{t('noBuys')}</p> : <div className="table-scroll"><table><thead><tr><th>{t('time')}</th><th>{t('type')}</th><th>{t('input')}</th><th>{t('outputMin')}</th><th>{t('maker')}</th><th>{t('txn')}</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.at}-${item.txHash ?? item.maker}`}><td className="muted mono">{age(item.at)}</td><td className="up-text">{t('buy')} <span className="mini-label">LOCKABOX</span></td><td className="up-text">{item.inputAmount} {item.inputSymbol}</td><td>{item.outAmountMin}</td><td className="muted mono">{item.maker}</td><td>{item.txUrl ? <a href={item.txUrl} target="_blank" rel="noreferrer">↗</a> : '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}

export function TokenInfo({ asset }: { asset: AssetDetail }) {
  const { t, locale } = useT();
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try { await navigator.clipboard.writeText(asset.address); setCopied(true); window.setTimeout(() => setCopied(false), 1_200); } catch { setCopied(false); }
  };
  const changes = [['5m', asset.change.m5], ['1h', asset.change.h1], ['6h', asset.change.h6], ['24h', asset.change.h24]] as const;
  return <section className="panel info-card">
    <div className="metric-grid two"><Metric label={t('priceUsd')} value={asset.stale ? '—' : <>{formatPrice(asset.priceUsd, locale)} {asset.priceSource === 'dexpaprika' && <small className="price-source">{t('priceViaDexpaprika')}</small>}</>} /><Metric label={t('volume24h')} value={formatCompactUsd(asset.volume24h, locale)} title={formatUsd(asset.volume24h, locale)} /></div>
    <div className="metric-grid three"><Metric label={t('liquidity')} value={formatCompactUsd(asset.liquidityUsd, locale)} title={formatUsd(asset.liquidityUsd, locale)} /><Metric label={t('fdv')} value={formatCompactUsd(asset.fdv, locale)} title={formatUsd(asset.fdv, locale)} /><Metric label={t('marketCap')} value={formatCompactUsd(asset.marketCap, locale)} title={formatUsd(asset.marketCap, locale)} /></div>
    <div className="change-grid">{changes.map(([label, value]) => <div key={label} className={value !== null && value !== undefined && value >= 0 ? 'up-text' : 'down-text'}><span>{label}</span><b>{formatPercent(value, locale)}</b></div>)}</div>
    <button className="address-row mono" onClick={() => void copyAddress()} title={t('copyContract')}><span>CA</span><b>{formatAddress(asset.address, 8)}</b><i>{copied ? t('copied') : '⧉'}</i></button>
    <div className="external-links">{asset.links.dexscreener && <a href={asset.links.dexscreener} target="_blank" rel="noreferrer">DEX Screener ↗</a>}{asset.links.explorer && <a href={asset.links.explorer} target="_blank" rel="noreferrer">{t('explorerLink')}</a>}{asset.links.websites[0] && <a href={asset.links.websites[0]} target="_blank" rel="noreferrer">Web ↗</a>}</div>
  </section>;
}

function Metric({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) { return <div className="metric" title={title}><span>{label}</span><b>{value}</b></div>; }
function changeClass(value: number | null) { return value !== null && value >= 0 ? 'up-text' : 'down-text'; }
