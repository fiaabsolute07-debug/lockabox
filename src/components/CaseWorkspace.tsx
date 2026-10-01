'use client';

import TokenImage from './TokenImage';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ApiError,
  displaySymbol,
  fetchJson,
  formatAddress,
  tierColor,
  tierLabel,
  TIERS,
  type CaseResponse,
  type RollFilters,
  type RollResponse,
  type SponsoredLiveItem,
  type SponsoredOpenResponse,
  type Tier,
} from './api';
import { caseTitle, useT, translateApiError } from './i18n';
import { useAppContext } from './AppShell';
import { LockyChat } from './LockyChat';
import { ChartEmbed, TokenHeader, TokenInfo, TradesTable } from './MarketView';
import { RollReel } from './RollReel';
import { nextMicroStreak, playRollStart, preloadRollSounds, rollSoundEnabled, setRollSoundEnabled, specialSoundFor, unlockRollAudio, type SpecialSound } from './rollAudio';
import SwapBox from './SwapBox';
import PullCard from './PullCard';
import ProofBox from './ProofBox';
import SharePullButton from './SharePullButton';

type FilterDraft = { tiers: Tier[]; minLiquidityUsd: string; minVolume24h: string; maxAgeHours: string; change24h: '' | 'up' | 'down' };

const AGE_PRESETS = [
  { hours: '1', label: '<1h' },
  { hours: '6', label: '<6h' },
  { hours: '24', label: '<24h' },
  { hours: '72', label: '<3d' },
  { hours: '168', label: '<7d' },
  { hours: '336', label: '<14d' },
  { hours: '720', label: '<30d' },
];
const DEFAULT_FILTERS: FilterDraft = { tiers: [], minLiquidityUsd: '', minVolume24h: '', maxAgeHours: '168', change24h: '' };

function pairAgeLabel(hours: string, all: string) {
  return AGE_PRESETS.find((preset) => preset.hours === hours)?.label ?? (Number(hours) > 0 ? `<${hours}h` : all);
}

export default function CaseWorkspace() {
  const { t, locale, age } = useT();
  const { meta, feed, selectedChain, user, refreshUser, setRevealPending } = useAppContext();
  const [caseId, setCaseId] = useState('trending');
  const [summary, setSummary] = useState<CaseResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterDraft>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  useEffect(() => { setSoundEnabled(rollSoundEnabled()); void preloadRollSounds(); }, []);
  const contentsDialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<RollResponse | null>(null);
  const [special, setSpecial] = useState<SpecialSound | undefined>();
  const [streakShown, setStreakShown] = useState(0);
  const microStreak = useRef(0); // counted once per roll that comes back from the API
  const rollsThisVisit = useRef(0);
  const [reelSettled, setReelSettled] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);
  const [sponsoredLive, setSponsoredLive] = useState<SponsoredLiveItem[]>([]);
  const [sponsoredSelected, setSponsoredSelected] = useState(false);
  const [sponsoredResult, setSponsoredResult] = useState<SponsoredOpenResponse | null>(null);
  const [sponsoredBusy, setSponsoredBusy] = useState(false);
  const [sponsoredError, setSponsoredError] = useState<string | null>(null);

  useEffect(() => () => setRevealPending(false), [caseId, selectedChain, sponsoredSelected, setRevealPending]);

  useEffect(() => {
    const first = meta?.cases[0]?.id;
    if (first && (!meta.cases.some((item) => item.id === caseId))) setCaseId(first);
  }, [meta, caseId]);

  // Switching language must not reload the case or drop the current pull, so `t` is read through a ref here.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!meta?.cases.some((item) => item.id === caseId)) return;
    let active = true;
    setSummary(null); setSummaryError(null); setResult(null); setRollError(null);
    void fetchJson<CaseResponse>(`/api/cases/${encodeURIComponent(caseId)}?chain=${encodeURIComponent(selectedChain)}`).then((value) => { if (active) setSummary(value); }).catch((error: unknown) => { if (active) setSummaryError(translateApiError(error, tRef.current, 'couldNotLoad')); });
    return () => { active = false; };
  }, [caseId, meta, selectedChain]);

  useEffect(() => {
    let active = true;
    void fetchJson<{ items?: SponsoredLiveItem[] }>('/api/sponsored/live').then((value) => {
      if (active) setSponsoredLive(value.items ?? []);
    }).catch(() => { if (active) setSponsoredLive([]); });
    return () => { active = false; };
  }, []);

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
    unlockRollAudio();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) playRollStart(); // latch now, not after the API round trip
    setRevealPending(true);
    setResult(null);
    setReelSettled(false);
    setRolling(true); setRollError(null);
    try {
      const value = await fetchJson<RollResponse>('/api/rolls', { method: 'POST', body: JSON.stringify({ caseId, chain: selectedChain, filters: filterPayload }) });
      microStreak.current = nextMicroStreak(microStreak.current, value.roll.tier);
      rollsThisVisit.current += 1;
      setStreakShown(microStreak.current);
      setSpecial(specialSoundFor({ tier: value.roll.tier, rollsThisVisit: rollsThisVisit.current, microStreak: microStreak.current, asset: value.asset }));
      setReelSettled(false);
      setResult(value);
    } catch (error) {
      setRevealPending(false);
      if (error instanceof ApiError && error.code === 'pool_too_small') {
        const detail = error.detail as { size?: number } | undefined;
        setRollError(t('onlyCoins', { size: detail?.size ?? 0 }));
      } else if (error instanceof ApiError && error.code === 'no_pool') setRollError(t('caseFilling'));
      else if (error instanceof ApiError && error.status === 429) setRollError(t('easyOneRoll'));
      else setRollError(translateApiError(error, t, 'couldNotOpen'));
    } finally { setRolling(false); }
  }, [caseId, filterPayload, reelSettled, result, rolling, selectedChain, summary?.pool, t, setRevealPending]);

  const handleReelSettled = useCallback(() => { setReelSettled(true); setRevealPending(false); }, [setRevealPending]);

  const handleSponsoredOpen = useCallback(async () => {
    if (!user) { setSponsoredError(t('signInToOpen')); return; }
    if (sponsoredBusy) return;
    setSponsoredBusy(true); setSponsoredError(null);
    try {
      const opened = await fetchJson<SponsoredOpenResponse>('/api/sponsored/open', { method: 'POST' });
      setSponsoredResult(opened);
      await refreshUser();
      void fetchJson<{ items?: SponsoredLiveItem[] }>('/api/sponsored/live').then((value) => setSponsoredLive(value.items ?? [])).catch(() => undefined);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'empty') setSponsoredError(t('noSponsoredDrops'));
      else if (error instanceof ApiError && error.code === 'needs_wallet') setSponsoredError(t('signInSolana'));
      else if (error instanceof ApiError && error.code === 'insufficient_points') setSponsoredError(t('insufficientPoints'));
      else setSponsoredError(translateApiError(error, t, 'couldNotOpen'));
    } finally { setSponsoredBusy(false); }
  }, [refreshUser, sponsoredBusy, t, user]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code !== 'Space' || event.repeat || target?.closest('button, a, input, select, textarea, [contenteditable]')) return;
      if (document.querySelector('dialog[open], [role="dialog"], .modal-backdrop, [data-modal="true"], .modal')) return;
      event.preventDefault(); void handleRoll();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [handleRoll]);

  const selectedCase = meta?.cases.find((item) => item.id === caseId);
  const chainName = selectedChain === 'all' ? t('allChains').toUpperCase() : meta?.chains.find((chain) => chain.id === selectedChain)?.name.toUpperCase() ?? 'SOLANA';
  // Locky naps until the first case of the visit is opened.
  const napping = !result && !rolling;
  const liveCost = sponsoredLive.reduce((max, item) => Math.max(max, item.costPoints), 0);

  return <div className={`workspace-grid ${sponsoredSelected ? 'workspace-sponsored' : ''}`}>
    <main className="main-column">
      <section className="panel case-panel">
        <div className="sound-row"><button type="button" className="button button-outline sound-toggle" aria-pressed={soundEnabled} aria-label={t('soundLabel')} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); setRollSoundEnabled(next); }}><span aria-hidden="true">{soundEnabled ? '♪' : '♩'}</span> {soundEnabled ? t('soundOn') : t('soundOff')}</button></div>
        <div className="case-hero">
          {sponsoredSelected ? <div className="case-art"><div className="case-glow" /><LockyChat size={150} /></div> : <button type="button" className="case-art case-contents-trigger" aria-label={t('itemsInCase')} aria-haspopup="dialog" aria-controls="case-contents-dialog" onClick={() => contentsDialog.current?.showModal()}><span className="case-glow" /><LockyChat size={150} sleeping={napping} />{napping && <span className="case-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>}<span className="case-contents-hint">{t('itemsInCase')} <span aria-hidden="true">↗</span></span></button>}
      <div className="case-copy"><span className="eyebrow">{sponsoredSelected ? t('sponsoredDropsLabel') : t('caseLabel', { chain: chainName })}</span><h1>{sponsoredSelected ? t('sponsoredDropsHeading') : selectedCase ? caseTitle(selectedCase, t) : t('trendingCase')}</h1><p>{sponsoredSelected ? t('sponsoredCaseIntro') : summary?.pool ? t('currentPool', { size: summary.pool.size, hash: formatAddress(summary.pool.hash, 5), age: age(summary.pool.createdAt) }) : summary ? t('caseFilling') : summaryError ?? t('loadingPool')}</p>
            <div className="case-tabs">{(meta?.cases ?? []).map((item) => <button key={item.id} className={!sponsoredSelected && item.id === caseId ? 'active' : ''} onClick={() => { setCaseId(item.id); setSponsoredSelected(false); }}>{caseTitle(item, t)}</button>)}{sponsoredLive.length > 0 && <button className={sponsoredSelected ? 'active sponsored-tab' : 'sponsored-tab'} onClick={() => { setSponsoredSelected(true); setSponsoredError(null); }}>{t('sponsored')}</button>}<button className={!sponsoredSelected && filterOpen ? 'active filter-button' : 'filter-button'} aria-expanded={!sponsoredSelected && filterOpen} aria-controls="case-filters" onClick={() => setFilterOpen((value) => !value)} disabled={sponsoredSelected}>{t('filters')} <span>⌄</span></button></div>
            {!sponsoredSelected && <p className="filter-summary">{t('pairAgeSelection', { age: pairAgeLabel(filters.maxAgeHours, t('all')) })}</p>}
            {!sponsoredSelected && filterOpen && <FilterPopover applied={filters} onApply={(next) => { setFilters(next); setRollError(null); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}
          </div>
          {!sponsoredSelected && <div className={`open-area${result && reelSettled && !rolling ? ' after-pull' : ''}`}><button className="open-button" onClick={() => void handleRoll()} disabled={rolling || !summary?.pool || (result !== null && !reelSettled)}>{rolling ? <><strong>{t('opening')}</strong><small>{t('findingPull')}</small></> : result && !reelSettled ? <><strong>{t('revealing')}</strong><small>{t('watchReel')}</small></> : <><strong>{t('openCase')}</strong><small>{t('freeUnlimited')}</small></> }</button>{feed?.stats && (feed.stats.rolls1h > 0 || feed.stats.buysToday > 0 || feed.stats.lastTopPullAt) && <div className="case-stats"><span>● {new Intl.NumberFormat(locale).format(feed.stats.rolls1h)} {t('openedHour')}</span>{feed.stats.buysToday > 0 && <span>{new Intl.NumberFormat(locale).format(feed.stats.buysToday)} {t('buysToday')}</span>}{feed.stats.lastTopPullAt && <span>{t('lastTopPull', { age: age(feed.stats.lastTopPullAt) })}</span>}</div>}</div>}
        </div>
        {sponsoredSelected ? <SponsoredDrops items={sponsoredLive} user={!!user} cost={liveCost} busy={sponsoredBusy} error={sponsoredError} result={sponsoredResult} onOpen={() => void handleSponsoredOpen()} /> : <>
          {rollError && <div className="roll-error" role="alert">{rollError}</div>}
          {result ? <RollReel cards={result.reel.cards} winIndex={result.reel.winIndex} tier={result.roll.tier} special={special} microStreak={streakShown} odds={result.roll.odds} onSettled={handleReelSettled} onRollAgain={() => void handleRoll()} reveal={({ close, again, againRef }) => <PullCard asset={result.asset} tier={result.roll.tier} chance={result.roll.odds?.[result.roll.tier]} rollId={result.roll.rollId} chain={meta?.chains.find((chain) => chain.id === result.asset.chainId)} againRef={againRef} onAgain={again} onClose={close} />} /> : rolling ? <div className="spinner roll-stage roll-charging roll-fullscreen" aria-busy="true"><div className="reel-overlay-title"><span>LOCKABOX</span><strong>{t('reelOpening')}</strong></div><div className="marker" aria-hidden="true" /></div> : <div className="spinner empty-spinner"><div className="marker" aria-hidden="true" /><div className="empty-spinner-copy"><span className="empty-icon">✦</span><strong>{t('openToReveal')}</strong><small>{t('firstPullWaiting')}</small></div></div>}
          {result && reelSettled && !rolling && <UnboxedBar result={result} onRollAgain={() => void handleRoll()} onBuy={() => document.getElementById('swap-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
        </>}
      </section>
      <dialog ref={contentsDialog} id="case-contents-dialog" className="case-contents-dialog" aria-label={t('itemsInCase')} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close(); } }}>
        <div className="contents-dialog-toolbar"><span className="eyebrow">{selectedCase ? caseTitle(selectedCase, t) : t('trendingCase')}</span><button type="button" className="contents-dialog-close" aria-label={t('close')} onClick={() => contentsDialog.current?.close()}>×</button></div>
        <CaseContents summary={summary} />
      </dialog>
      {!sponsoredSelected && (result && reelSettled && !rolling ? <><TokenHeader asset={result.asset} tier={result.roll.tier} rollId={result.roll.rollId} /><ChartEmbed asset={result.asset} /><TradesTable asset={result.asset} /></> : <section className="panel pre-roll-card"><span className="eyebrow">{t('nextUp')}</span><h2>{t('rollFirst')}</h2><p>{t('chartBuysSwap')}</p></section>)}
    </main>
    {!sponsoredSelected && <aside className="right-rail">{result && reelSettled && !rolling ? <><TokenInfo asset={result.asset} /><div id="swap-box"><SwapBox asset={result.asset} rollId={result.roll.rollId} onRollAgain={() => void handleRoll()} /></div><ProofBox result={result} /></> : <section className="panel rail-empty"><span className="empty-icon">◎</span><h3>{t('pullWillLand')}</h3><p>{t('unlockTokenPanel')}</p></section>}</aside>}
  </div>;
}

// Edits stay in a local draft; only Apply changes the filters the next roll uses. Closing discards the draft.
function FilterPopover({ applied, onApply, onClose }: { applied: FilterDraft; onApply: (next: FilterDraft) => void; onClose: () => void }) {
  const { t } = useT();
  const [filters, setFilters] = useState<FilterDraft>(applied);
  const changed = JSON.stringify(filters) !== JSON.stringify(applied);
  const toggleTier = (tier: Tier) => setFilters((current) => ({ ...current, tiers: current.tiers.includes(tier) ? current.tiers.filter((item) => item !== tier) : [...current.tiers, tier] }));
  return <div id="case-filters" className="filter-popover panel"><div className="filter-head"><strong>{t('filterPool')}</strong><button type="button" aria-label={t('closeFilters')} onClick={onClose}>×</button></div>
    <div className="filter-group">
      <span className="filter-label" id="pair-age-label">{t('pairAge')}</span>
      <div className="age-presets" role="group" aria-labelledby="pair-age-label" aria-describedby="pair-age-help">
        {AGE_PRESETS.map((preset) => <button type="button" key={preset.hours} aria-pressed={filters.maxAgeHours === preset.hours} onClick={() => setFilters((current) => ({ ...current, maxAgeHours: preset.hours }))}>{preset.label}</button>)}
        <button type="button" aria-pressed={!Number(filters.maxAgeHours)} onClick={() => setFilters((current) => ({ ...current, maxAgeHours: '' }))}>{t('all')}</button>
      </div>
      <p className="filter-help" id="pair-age-help">{t('pairAgeHelp')}</p>
    </div>
    <div className="filter-group"><span className="filter-label">{t('tiers')}</span><div className="tier-checks">{TIERS.map((tier) => <label key={tier} style={{ color: tierColor(tier) }}><input type="checkbox" checked={filters.tiers.includes(tier)} onChange={() => toggleTier(tier)} /> {tierLabel(tier)}</label>)}</div></div><div className="filter-grid"><label>{t('minLiquidity')}<input type="number" min="0" placeholder="USD" value={filters.minLiquidityUsd} onChange={(event) => setFilters((current) => ({ ...current, minLiquidityUsd: event.target.value }))} /></label><label>{t('minVolume')}<input type="number" min="0" placeholder="USD" value={filters.minVolume24h} onChange={(event) => setFilters((current) => ({ ...current, minVolume24h: event.target.value }))} /></label><label>{t('maxAge')}<input type="number" min="0" placeholder={t('hours')} value={filters.maxAgeHours} onChange={(event) => setFilters((current) => ({ ...current, maxAgeHours: event.target.value }))} /></label></div><div className="filter-group"><span className="filter-label">{t('change24h')}</span><div className="direction-buttons"><button className={filters.change24h === '' ? 'active' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: '' }))}>{t('all')}</button><button className={filters.change24h === 'up' ? 'active up-text' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: 'up' }))}>{t('up')}</button><button className={filters.change24h === 'down' ? 'active down-text' : ''} onClick={() => setFilters((current) => ({ ...current, change24h: 'down' }))}>{t('down')}</button></div></div><div className="filter-actions"><button type="button" className="filter-apply" disabled={!changed} onClick={() => onApply(filters)}>{t('applyFilters')}</button></div><p className="filter-foot">{t('filtersNextRoll')}</p></div>;
}

function CaseContents({ summary }: { summary: CaseResponse | null }) {
  const { t, locale } = useT();
  const contents = summary?.contents ?? [];
  const total = summary?.pool?.size ?? 0;
  const percent = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <div className="case-contents"><div className="contents-heading"><strong>{t('itemsInCase')}</strong><div className="odds-list">{TIERS.map((tier) => <span key={tier} style={{ color: tierColor(tier) }}><i style={{ background: tierColor(tier) }} />{tierLabel(tier)} {summary?.odds[tier] ? `${percent.format(summary.odds[tier]! / 100)}%` : '—'}</span>)}</div><small>{t('showingItems', { shown: contents.length, total })} · {t('beforeFilters')}</small></div>{contents.length ? <div className="contents-grid">{contents.map((item) => { const symbol = displaySymbol(item); return <div className="content-card" key={item.id} style={{ '--rarity': tierColor(item.tier) } as React.CSSProperties}><div className="content-art"><TokenImage src={item.imageUrl} symbol={symbol} identity={item.address} /></div><b>${symbol}</b><span>{tierLabel(item.tier)}</span></div>; })}</div> : <div className="contents-empty">{t('contentsLoading')}</div>}</div>;
}

function UnboxedBar({ result, onRollAgain, onBuy }: { result: RollResponse; onRollAgain: () => void; onBuy: () => void }) {
  const { t } = useT();
  const symbol = displaySymbol(result.asset);
  return <div className="unboxed-bar" style={{ '--rarity': tierColor(result.roll.tier) } as React.CSSProperties}><div className="unboxed-art"><TokenImage src={result.asset.imageUrl} symbol={symbol} identity={`${result.asset.chainId}:${result.asset.address}`} /></div><div><span>{t('youUnboxed', { tier: tierLabel(result.roll.tier) })}</span><strong>${symbol}</strong></div><span className="seed-badge mono">seed {formatAddress(result.roll.serverSeedHash, 5)} · {t('nonce')} {result.roll.nonce}</span><Link className="unboxed-verify" href={`/verify/${result.roll.rollId}`}>{t('verify')} ↗</Link><div className="unboxed-actions"><SharePullButton rollId={result.roll.rollId} symbol={symbol} /><button className="button button-outline" onClick={onRollAgain}>{t('openAgain')}</button><button className="button button-buy" onClick={onBuy}>{t('buy')} ${symbol}</button></div></div>;
}

function SponsoredDrops({ items, user, cost, busy, error, result, onOpen }: { items: SponsoredLiveItem[]; user: boolean; cost: number; busy: boolean; error: string | null; result: SponsoredOpenResponse | null; onOpen: () => void }) {
  const { t, locale, date } = useT();
  return <div className="sponsored-panel"><div className="sponsored-intro"><div><span className="eyebrow">{t('pointsCase')}</span><h2>{t('liveSponsoredDrops')}</h2><p>{t('sponsoredIntro')}</p></div><span className="sponsored-badge">{t('sponsored')}</span></div>{items.length ? <div className="sponsored-list">{items.map((item) => { const symbol = displaySymbol(item); return <article className="sponsored-item" key={item.id}><div className="sponsored-art"><TokenImage src={item.imageUrl} symbol={symbol} identity={item.address} /></div><div className="sponsored-copy"><div className="sponsored-meta"><strong>{item.projectName}</strong><span className="sponsored-badge">{t('sponsored')}</span></div><h3>${symbol}</h3><p>{item.description}</p><div className="sponsored-stats"><span>{new Intl.NumberFormat(locale).format(item.remaining)} {t('opensRemaining')}</span><span>{t('ends', { date: date(item.endsAt) })}</span></div></div></article>})}</div> : <p className="sponsored-empty">{t('noSponsoredDrops')}</p>}{error && <p className="inline-error sponsored-error" role="alert">{error}</p>}{result ? <div className="sponsored-result"><div className="sponsored-meta"><span className="sponsored-badge">{t('sponsored')}</span><strong>${displaySymbol(result.asset)}</strong></div><p><strong>{tierLabel(result.tier)}</strong> · {t('dropPending')}</p><Link className="verify-link" href={`/verify/${result.rollId}`}>{t('verify')} ↗</Link></div> : <button className="button button-primary sponsored-open" onClick={onOpen} disabled={busy}>{user ? t('openForPoints', { points: new Intl.NumberFormat(locale).format(cost) }) : t('signInToOpen')}</button>}</div>;
}
