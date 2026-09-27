'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ApiError,
  displaySymbol,
  fetchJson,
  formatAge,
  formatAddress,
  formatPercent,
  formatUsd,
  tierColor,
  tierLabel,
  TIERS,
  type AssetDetail,
  type CaseResponse,
  type RollFilters,
  type RollResponse,
  type Tier,
} from './api';
import { useAppContext, Sidebar } from './AppShell';
import { LockyLogo } from './LockyLogo';
import { ChartEmbed, TokenHeader, TokenInfo, TradesTable } from './MarketView';
import { RollReel } from './RollReel';
import SwapBox from './SwapBox';
import ProofBox from './ProofBox';

type FilterDraft = { tiers: Tier[]; minLiquidityUsd: string; minVolume24h: string; maxAgeHours: string; change24h: '' | 'up' | 'down' };

const DEFAULT_FILTERS: FilterDraft = { tiers: [], minLiquidityUsd: '', minVolume24h: '', maxAgeHours: '', change24h: '' };

export default function CaseWorkspace() {
  const { meta, feed, selectedChain } = useAppContext();
  const [caseId, setCaseId] = useState('trending');
  const [summary, setSummary] = useState<CaseResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [result, setResult] = useState<RollResponse | null>(null);
  const [reelSettled, setReelSettled] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  useEffect(() => {
    const first = meta?.cases[0]?.id;
    if (first && (!meta.cases.some((item) => item.id === caseId))) setCaseId(first);
  }, [meta, caseId]);

  useEffect(() => {
    if (!meta?.cases.some((item) => item.id === caseId)) return;
    let active = true;
    setSummary(null); setSummaryError(null); setResult(null); setRollError(null);
    void fetchJson<CaseResponse>(`/api/cases/${encodeURIComponent(caseId)}?chain=${encodeURIComponent(selectedChain)}`).then((value) => { if (active) setSummary(value); }).catch((error: unknown) => { if (active) setSummaryError(error instanceof ApiError ? error.message : 'Could not load this case.'); });
    return () => { active = false; };
  }, [caseId, meta, selectedChain]);

  const filterPayload = useMemo<RollFilters>(() => {
    const payload: RollFilters = {};
    if (filters.tiers.length) payload.tiers = filters.tiers;
    const numeric = [['minLiquidityUsd', filters.minLiquidityUsd], ['minVolume24h', filters.minVolume24h], ['maxAgeHours', filters.maxAgeHours]] as const;
    for (const [key, value] of numeric) if (value && Number.isFinite(Number(value)) && Number(value) >= 0) payload[key] = Number(value);
    if (filters.change24h) payload.change24h = filters.change24h;
    return payload;
  }, [filters]);

  const handleRoll = useCallback(async () => {
    if (rolling || !summary?.pool || (result !== null && !reelSettled)) return;
    setRolling(true); setRollError(null);
    try {
      const value = await fetchJson<RollResponse>('/api/rolls', { method: 'POST', body: JSON.stringify({ caseId, chain: selectedChain, filters: filterPayload }) });
      const currentAsset = await fetchJson<AssetDetail>(`/api/assets/${value.roll.assetId}`);
      setReelSettled(false);
      setResult({ ...value, asset: currentAsset });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'pool_too_small') {
        const detail = error.detail as { size?: number } | undefined;
        setRollError(`Only ${detail?.size ?? 0} coins match your filters — loosen them`);
      } else if (error instanceof ApiError && error.code === 'no_pool') setRollError('This case is filling up, try All chains');
      else if (error instanceof ApiError && error.status === 429) setRollError('easy, one roll per second');
      else setRollError(error instanceof ApiError ? error.message : 'Could not open this case.');
    } finally { setRolling(false); }
  }, [caseId, filterPayload, reelSettled, result, rolling, selectedChain, summary?.pool]);

  const handleReelSettled = useCallback(() => setReelSettled(true), []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || event.repeat || target?.closest('button, a, input, select, textarea, [contenteditable]')) return;
      if (document.querySelector('dialog, [role="dialog"], .modal-backdrop, [data-modal="true"], .modal')) return;
      event.preventDefault(); void handleRoll();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [handleRoll]);

  const selectedCase = meta?.cases.find((item) => item.id === caseId);
  const chainName = selectedChain === 'all' ? 'ALL CHAINS' : meta?.chains.find((chain) => chain.id === selectedChain)?.name.toUpperCase() ?? 'SOLANA';

  return <div className="workspace-grid">
    <Sidebar />
    <main className="main-column">
      <section className="panel case-panel">
        <div className="case-hero">
          <div className="case-art"><div className="case-glow" /><LockyLogo size={150} /></div>
          <div className="case-copy"><span className="eyebrow">CASE · {chainName}</span><h1>{selectedCase?.title ?? 'Trending Case'}</h1><p>{summary?.pool ? `${summary.pool.size} tokens in this pool · #${formatAddress(summary.pool.hash, 5)} · refreshed ${formatAge(summary.pool.createdAt)}` : summary ? 'This case is filling up, try All chains' : summaryError ?? 'Loading the current pool…'}</p>
            <div className="case-tabs">{(meta?.cases ?? []).map((item) => <button key={item.id} className={item.id === caseId ? 'active' : ''} onClick={() => setCaseId(item.id)}>{item.title}</button>)}<button className={filterOpen ? 'active filter-button' : 'filter-button'} onClick={() => setFilterOpen((value) => !value)}>Filters <span>⌄</span></button></div>
            {filterOpen && <FilterPopover filters={filters} setFilters={setFilters} onClose={() => setFilterOpen(false)} />}
          </div>
          <div className="open-area"><button className="open-button" onClick={() => void handleRoll()} disabled={rolling || !summary?.pool || (result !== null && !reelSettled)}>{rolling ? <><strong>OPENING…</strong><small>finding your pull</small></> : result && !reelSettled ? <><strong>REVEALING…</strong><small>watch the reel</small></> : <><strong>OPEN CASE</strong><small>free · unlimited · SPACE</small></> }</button>{feed?.stats && (feed.stats.rolls1h > 0 || feed.stats.buysToday > 0 || feed.stats.lastTopPullAt) && <div className="case-stats"><span>● {feed.stats.rolls1h.toLocaleString()} opened / 1h</span>{feed.stats.buysToday > 0 && <span>{feed.stats.buysToday.toLocaleString()} buys today</span>}{feed.stats.lastTopPullAt && <span>last ★ top {formatAge(feed.stats.lastTopPullAt)}</span>}</div>}</div>
        </div>
        {rollError && <div className="roll-error" role="alert">{rollError}</div>}
        {result ? <RollReel cards={result.reel.cards} winIndex={result.reel.winIndex} tier={result.roll.tier} onSettled={handleReelSettled} /> : <div className="spinner empty-spinner"><div className="marker" aria-hidden="true" /><div className="empty-spinner-copy"><span className="empty-icon">✦</span><strong>Open the case to reveal a token</strong><small>Your first pull is waiting.</small></div></div>}
        {result && reelSettled && !rolling && <UnboxedBar result={result} onRollAgain={() => void handleRoll()} onBuy={() => document.getElementById('swap-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
        <CaseContents summary={summary} />
      </section>
      {result && reelSettled && !rolling ? <><TokenHeader asset={result.asset} tier={result.roll.tier} rollId={result.roll.rollId} /><ChartEmbed asset={result.asset} /><TradesTable asset={result.asset} /></> : <section className="panel pre-roll-card"><span className="eyebrow">NEXT UP</span><h2>Roll first, then inspect the market view.</h2><p>The chart, buys, and swap panel appear here after your pull.</p></section>}
    </main>
    <aside className="right-rail">{result && reelSettled && !rolling ? <><TokenInfo asset={result.asset} /><div id="swap-box"><SwapBox asset={result.asset} rollId={result.roll.rollId} onRollAgain={() => void handleRoll()} /></div><ProofBox result={result} /></> : <section className="panel rail-empty"><span className="empty-icon">◎</span><h3>Your pull will land here</h3><p>Open a case to unlock the token panel, chart, and proof.</p></section>}</aside>
  </div>;
}

function FilterPopover({ filters, setFilters, onClose }: { filters: FilterDraft; setFilters: React.Dispatch<React.SetStateAction<FilterDraft>>; onClose: () => void }) {
  const toggleTier = (tier: Tier) => setFilters((current) => ({ ...current, tiers: current.tiers.includes(tier) ? current.tiers.filter((item) => item !== tier) : [...current.tiers, tier] }));
  return <div className="filter-popover panel"><div className="filter-head"><strong>FILTER POOL</strong><button onClick={onClose}>×</button></div><div className="filter-group"><span className="filter-label">TIERS</span><div className="tier-checks">{TIERS.map((tier) => <label key={tier} style={{ color: tierColor(tier) }}><input type="checkbox" checked={filters.tiers.includes(tier)} onChange={() => toggleTier(tier)} /> {tierLabel(tier)}</label>)}</div></div><div className="filter-grid"><label>Min liquidity<input type="number" min="0" placeholder="USD" value={filters.minLiquidityUsd} onChange={(event) => setFilters((current) => ({ ...current, minLiquidityUsd: event.target.value }))} /></label><label>Min volume 24h<input type="number" min="0" placeholder="USD" value={filters.minVolume24h} onChange={(event) => setFilters((current) => ({ ...current, minVolume24h: event.target.value }))} /></label><label>Max age hours<input type="number" min="0" placeholder="hours" value={filters.maxAgeHours} onChange={(event) => setFilters((current) => ({ ...current, maxAgeHours: event.target.value }))} /></label></div><div className="filter-group"><span className="filter-label">24H CHANGE</span><div className="direction-buttons"><button className={filters.change24h === '' ? 'active' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: '' }))}>All</button><button className={filters.change24h === 'up' ? 'active up-text' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: 'up' }))}>Up</button><button className={filters.change24h === 'down' ? 'active down-text' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: 'down' }))}>Down</button></div></div><p className="filter-foot">Filters apply to the next roll.</p></div>;
}

function CaseContents({ summary }: { summary: CaseResponse | null }) {
  const contents = summary?.contents ?? [];
  const total = summary?.pool?.size ?? 0;
  return <div className="case-contents"><div className="contents-heading"><strong>Items in this case</strong><div className="odds-list">{TIERS.map((tier) => <span key={tier} style={{ color: tierColor(tier) }}><i style={{ background: tierColor(tier) }} />{tierLabel(tier)} {summary?.odds[tier] ? `${(summary.odds[tier]! / 100).toFixed(2)}%` : '—'}</span>)}</div><small>showing {contents.length} of {total}</small></div>{contents.length ? <div className="contents-grid">{contents.map((item) => { const symbol = displaySymbol(item); return <div className="content-card" key={item.id} style={{ '--rarity': tierColor(item.tier) } as React.CSSProperties}><div className="content-art" style={{ background: item.imageUrl ? `url(${item.imageUrl}) center/cover` : undefined }}>{item.imageUrl ? null : symbol[0]}</div><b>${symbol}</b><span>{tierLabel(item.tier)}</span></div>; })}</div> : <div className="contents-empty">The case contents are loading.</div>}</div>;
}

function UnboxedBar({ result, onRollAgain, onBuy }: { result: RollResponse; onRollAgain: () => void; onBuy: () => void }) {
  const symbol = displaySymbol(result.asset);
  return <div className="unboxed-bar" style={{ '--rarity': tierColor(result.roll.tier) } as React.CSSProperties}><div className="unboxed-art">{symbol[0]}</div><div><span>YOU UNBOXED · {tierLabel(result.roll.tier)}</span><strong>${symbol}</strong></div><span className="seed-badge mono">seed {formatAddress(result.roll.serverSeedHash, 5)} · nonce {result.roll.nonce}</span><Link className="unboxed-verify" href={`/verify/${result.roll.rollId}`}>Verify ↗</Link><div className="unboxed-actions"><button className="button button-outline" onClick={onRollAgain}>Open again</button><button className="button button-buy" onClick={onBuy}>Buy ${symbol}</button></div></div>;
}
