'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  displaySymbol,
  fetchJson,
  formatAddress,
  formatAge,
  formatCompactUsd,
  formatPercent,
  formatUsd,
  type AssetDetail,
  type BuyItem,
  tierColor,
  tierLabel,
} from './api';

export function TokenHeader({ asset, tier, rollId }: { asset: AssetDetail; tier: AssetDetail['tier']; rollId?: number }) {
  const symbol = displaySymbol(asset);
  const pairAge = asset.pairCreatedAt ? formatAge(asset.pairCreatedAt, true) : 'pair age unavailable';
  return <section className="panel token-header">
    <div className="token-avatar token-avatar-large" style={{ background: tierColor(tier) }}>{symbol[0]}</div>
    <div className="token-heading"><h2>${symbol} <span>/ {asset.chainId.toUpperCase()}</span></h2><small>{asset.dexId ?? 'DEX'} · pair {formatAddress(asset.pairAddress, 5)} · created {pairAge}</small></div>
    {rollId && <span className="badge badge-pull">YOUR PULL #{rollId} · {tierLabel(tier)}</span>}
    {asset.lockaboxBuys24h > 0 && <span className="badge">{asset.lockaboxBuys24h} buys via Lockabox today</span>}
    <div className="token-price"><b>{asset.stale ? '—' : formatUsd(asset.priceUsd)}</b><span className={changeClass(asset.change.h24)}>{asset.stale ? 'stale snapshot' : formatPercent(asset.change.h24)} · 24h</span></div>
  </section>;
}

export function ChartEmbed({ asset }: { asset: AssetDetail }) {
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
    <div className="chart-tabs"><button className={source === 'dex' ? 'active' : ''} disabled={!asset.chart.dexscreenerEmbed} onClick={() => { manualSourceRef.current = true; setSource('dex'); setFailed(false); }}>DEX Screener</button><button className={source === 'gecko' ? 'active' : ''} disabled={!asset.chart.geckoterminalEmbed} onClick={() => { manualSourceRef.current = true; setSource('gecko'); setFailed(false); }}>GeckoTerminal</button><span className="chart-note">official embed</span></div>
    <div className="chart-frame">{url && !failed ? <iframe title={`${displaySymbol(asset)} chart`} src={url} onLoad={() => { if (source === 'dex') dexLoadedRef.current = true; }} /> : <div className="chart-empty">Chart unavailable right now.</div>}</div>
  </section>;
}

export function TradesTable({ asset }: { asset: AssetDetail }) {
  const [items, setItems] = useState<BuyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void fetchJson<{ items: BuyItem[] }>(`/api/assets/${asset.id}/buys`).then((value) => { if (active) setItems(value.items); }).catch(() => { if (active) setError('Could not load buys right now.'); });
    return () => { active = false; };
  }, [asset.id]);
  return <section className="panel trades-panel">
    <div className="table-tabs"><button className="active">Buys via Lockabox</button><button disabled>All trades <small>soon</small></button><button disabled>Top pullers <small>soon</small></button><button disabled>Holders <small>soon</small></button></div>
    {error ? <p className="inline-error">{error}</p> : items.length === 0 ? <p className="empty-table">No buys through Lockabox yet</p> : <div className="table-scroll"><table><thead><tr><th>Time</th><th>Type</th><th>Input</th><th>Output min</th><th>Maker</th><th>Txn</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.at}-${item.txHash ?? item.maker}`}><td className="muted mono">{relativeTime(item.at)}</td><td className="up-text">Buy <span className="mini-label">LOCKABOX</span></td><td className="up-text">{item.inputAmount} {item.inputSymbol}</td><td>{item.outAmountMin}</td><td className="muted mono">{item.maker}</td><td>{item.txUrl ? <a href={item.txUrl} target="_blank" rel="noreferrer">↗</a> : '—'}</td></tr>)}</tbody></table></div>}
  </section>;
}

export function TokenInfo({ asset }: { asset: AssetDetail }) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    try { await navigator.clipboard.writeText(asset.address); setCopied(true); window.setTimeout(() => setCopied(false), 1_200); } catch { setCopied(false); }
  };
  const changes = [['5m', asset.change.m5], ['1h', asset.change.h1], ['6h', asset.change.h6], ['24h', asset.change.h24]] as const;
  return <section className="panel info-card">
    <div className="metric-grid two"><Metric label="Price USD" value={asset.stale ? '—' : formatUsd(asset.priceUsd)} /><Metric label="Volume 24h" value={formatCompactUsd(asset.volume24h)} title={formatUsd(asset.volume24h)} /></div>
    <div className="metric-grid three"><Metric label="Liquidity" value={formatCompactUsd(asset.liquidityUsd)} title={formatUsd(asset.liquidityUsd)} /><Metric label="FDV" value={formatCompactUsd(asset.fdv)} title={formatUsd(asset.fdv)} /><Metric label="Mkt cap" value={formatCompactUsd(asset.marketCap)} title={formatUsd(asset.marketCap)} /></div>
    <div className="change-grid">{changes.map(([label, value]) => <div key={label} className={value !== null && value !== undefined && value >= 0 ? 'up-text' : 'down-text'}><span>{label}</span><b>{formatPercent(value)}</b></div>)}</div>
    <button className="address-row mono" onClick={() => void copyAddress()} title="Copy contract address"><span>CA</span><b>{formatAddress(asset.address, 8)}</b><i>{copied ? 'copied' : '⧉'}</i></button>
    <div className="external-links">{asset.links.dexscreener && <a href={asset.links.dexscreener} target="_blank" rel="noreferrer">DEX Screener ↗</a>}{asset.links.explorer && <a href={asset.links.explorer} target="_blank" rel="noreferrer">Explorer ↗</a>}{asset.links.websites[0] && <a href={asset.links.websites[0]} target="_blank" rel="noreferrer">Web ↗</a>}</div>
  </section>;
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) { return <div className="metric" title={title}><span>{label}</span><b>{value}</b></div>; }
function changeClass(value: number | null) { return value !== null && value >= 0 ? 'up-text' : 'down-text'; }
function relativeTime(value: string) { const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1_000)); return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`; }
