'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, displaySymbol, fetchJson, formatPercent, formatUsd, tierColor, tierLabel, type LeaderboardResponse, type LeaderboardItem } from './api';
import { Sidebar } from './AppShell';

export default function LeaderboardClient() {
  const [windowName, setWindowName] = useState<'24h' | '7d'>('24h');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    void fetchJson<LeaderboardResponse>(`/api/leaderboard?window=${windowName}`).then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof ApiError ? reason.message : 'Could not load Best pulls.'); });
    return () => { active = false; };
  }, [windowName]);

  return <div className="workspace-grid leaderboard-layout"><Sidebar /><main className="main-column leaderboard-main"><section className="panel leaderboard-card"><div className="leaderboard-heading"><div><span className="eyebrow">LOCKABOX BOARD</span><h1>Best pulls</h1><p>Random pulls from real rolls. Past moves don't predict anything.</p></div><div className="window-toggle" role="group" aria-label="Leaderboard window">{(['24h', '7d'] as const).map((value) => <button key={value} className={windowName === value ? 'active' : ''} onClick={() => setWindowName(value)}>{value === '24h' ? '24H' : '7D'}</button>)}</div></div>{error && <p className="inline-error" role="alert">{error}</p>}{!data && !error && <p className="leaderboard-loading">Loading pulls…</p>}{data?.items.length ? <div className="table-scroll"><table className="leaderboard-table"><thead><tr><th>Rank</th><th>Coin</th><th>Tier</th><th>Price at pull → now</th><th>Change</th><th>Who</th><th /></tr></thead><tbody>{data.items.map((item, index) => <LeaderboardRow key={`${item.rollId}-${item.assetId}`} item={item} rank={index + 1} />)}</tbody></table></div> : data && <div className="leaderboard-empty">No pulls yet in this window</div>}</section></main></div>;
}

function LeaderboardRow({ item, rank }: { item: LeaderboardItem; rank: number }) {
  const symbol = displaySymbol(item);
  const change = item.changePct;
  return <tr><td className="leaderboard-rank mono">{rank}</td><td><div className="leaderboard-coin"><div className="leaderboard-avatar" style={{ backgroundColor: tierColor(item.tier), ...(item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', color: 'transparent' } : {}) }}>{item.imageUrl ? null : symbol[0]}</div><strong>${symbol}</strong></div></td><td><span className="tier-text" style={{ color: tierColor(item.tier) }}>{tierLabel(item.tier)}</span></td><td className="mono price-pair"><span>{formatUsd(item.priceAtPull)}</span><span className="muted">→</span><span>{formatUsd(item.priceNow)}</span></td><td className={`mono ${change === null ? 'muted' : change >= 0 ? 'up-text' : 'down-text'}`}>{formatPercent(change)}</td><td className="mono who-cell">{item.who || 'anon'}</td><td><Link className="verify-link compact-verify" href={`/verify/${item.rollId}`}>Verify ↗</Link></td></tr>;
}
