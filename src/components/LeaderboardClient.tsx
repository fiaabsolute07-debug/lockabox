'use client';

import TokenImage from './TokenImage';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { displaySymbol, fetchJson, formatPercent, formatPrice, tierColor, tierLabel, type LeaderboardResponse, type LeaderboardItem } from './api';
import { useT, translateApiError } from './i18n';

export default function LeaderboardClient() {
  const { t, locale } = useT();
  const [windowName, setWindowName] = useState<'24h' | '7d'>('24h');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    void fetchJson<LeaderboardResponse>(`/api/leaderboard?window=${windowName}`).then((value) => { if (active) setData(value); }).catch((reason: unknown) => { if (active) setError(translateApiError(reason, t, 'couldNotLoad')); });
    return () => { active = false; };
  }, [t, windowName]);

  return (
    <div className="workspace-grid leaderboard-layout">
      <main className="main-column leaderboard-main">
        <section className="panel leaderboard-card">
          <div className="leaderboard-heading">
            <div><span className="eyebrow">{t('bestPullsEyebrow')}</span><h1>{t('bestPulls')}</h1><p>{t('bestPullsIntro')}</p></div>
            <div className="window-toggle" role="group" aria-label={t('leaderboardWindow')}>
              {(['24h', '7d'] as const).map((value) => <button key={value} className={windowName === value ? 'active' : ''} onClick={() => setWindowName(value)}>{value === '24h' ? '24H' : '7D'}</button>)}
            </div>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {!data && !error && <p className="leaderboard-loading">{t('loadingPulls')}</p>}
          {data?.items.length ? <div className="table-scroll"><table className="leaderboard-table"><thead><tr><th>{t('rank')}</th><th>{t('coin')}</th><th>{t('tier')}</th><th>{t('priceAtPullNow')}</th><th>{t('change')}</th><th>{t('who')}</th><th /></tr></thead><tbody>{data.items.map((item, index) => <LeaderboardRow key={`${item.rollId}-${item.assetId}`} item={item} rank={index + 1} locale={locale} />)}</tbody></table></div> : data && <div className="leaderboard-empty">{t('noPullsWindow')}</div>}
        </section>
      </main>
    </div>
  );
}

function LeaderboardRow({ item, rank, locale }: { item: LeaderboardItem; rank: number; locale: string }) {
  const { t } = useT();
  const symbol = displaySymbol(item);
  const change = item.changePct;
  return <tr><td className="leaderboard-rank mono">{rank}</td><td><div className="leaderboard-coin"><div className="leaderboard-avatar" style={{ backgroundColor: tierColor(item.tier) }}><TokenImage src={item.imageUrl} symbol={symbol} identity={String(item.assetId)} /></div><strong>${symbol}</strong></div></td><td><span className="tier-text" style={{ color: tierColor(item.tier) }}>{tierLabel(item.tier)}</span></td><td className="mono price-pair"><span>{formatPrice(item.priceAtPull, locale)}</span><span className="muted">→</span><span>{formatPrice(item.priceNow, locale)}</span></td><td className={`mono ${change === null ? 'muted' : change >= 0 ? 'up-text' : 'down-text'}`}>{formatPercent(change, locale)}</td><td className="mono who-cell">{item.who || t('anonymous')}</td><td><Link className="verify-link compact-verify" href={`/verify/${item.rollId}`}>{t('verify')} ↗</Link></td></tr>;
}
