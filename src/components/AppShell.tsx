'use client';

import TokenImage from './TokenImage';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ApiError,
  displaySymbol,
  fetchJson,
  orderedChains,
  type FeedResponse,
  type MeResponse,
  type MetaResponse,
} from './api';
import { LockyChat } from './LockyChat';
import { ChainIcon } from './ChainIcon';
import WalletConnectButton, { type WalletFamily } from './WalletConnectButton';
import { useT } from './i18n';
import { AGE_COOKIE } from './language';

type AppContextValue = {
  meta: MetaResponse | null;
  feed: FeedResponse | null;
  user: MeResponse['user'];
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
  refreshUser: () => Promise<MeResponse['user']>;
  showToast: (message: string) => void;
  setRevealPending: (pending: boolean) => void;
  walletDialog: WalletFamily | 'all' | null;
  openWallet: (family?: WalletFamily | 'all') => void;
  closeWallet: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppContext must be used inside AppShell');
  return value;
}

function usePersistedChain(meta: MetaResponse | null) {
  const [selected, setSelected] = useState('all');
  useEffect(() => {
    if (!meta) return;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem('lab_chain'); } catch { /* storage can be disabled */ }
    const valid = stored === 'all' || !!meta.chains.find((chain) => chain.id === stored);
    setSelected(valid && stored ? stored : meta.chains[0]?.id ?? 'all');
  }, [meta]);
  const set = useCallback((chain: string) => {
    setSelected(chain);
    try { window.localStorage.setItem('lab_chain', chain); } catch { /* storage can be disabled */ }
  }, []);
  return [selected, set] as const;
}

export default function AppShell({ children, ageConfirmed = false }: { children: React.ReactNode; ageConfirmed?: boolean }) {
  const { t } = useT();
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [user, setUser] = useState<MeResponse['user']>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [walletDialog, setWalletDialog] = useState<WalletFamily | 'all' | null>(null);
  const openWallet = useCallback((family: WalletFamily | 'all' = 'all') => setWalletDialog(family), []);
  const closeWallet = useCallback(() => setWalletDialog(null), []);
  const [selectedChain, setSelectedChain] = usePersistedChain(meta);
  const inviteAttempt = useRef<string | null>(null);
  const revealPending = useRef(false);
  const queuedFeed = useRef<FeedResponse | null>(null);
  const setRevealPending = useCallback((pending: boolean) => {
    revealPending.current = pending;
    if (!pending && queuedFeed.current) {
      setFeed(queuedFeed.current);
      queuedFeed.current = null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try { const current = (await fetchJson<MeResponse>('/api/auth/me')).user; setUser(current); return current; }
    catch { setUser(null); return null; }
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? null : current), 3200);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('ref');
    if (!code || !/^[0-9a-f]{10}$/i.test(code)) return;
    try { window.localStorage.setItem('lab_ref', code.toLowerCase()); } catch { /* storage can be disabled */ }
    url.searchParams.delete('ref');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchJson<MetaResponse>('/api/meta').then((value) => { if (active) setMeta(value); }).catch(() => undefined);
    void refreshUser();
    const loadFeed = () => void fetchJson<FeedResponse>('/api/feed').then((value) => {
      if (!active) return;
      if (revealPending.current) queuedFeed.current = value;
      else setFeed(value);
    }).catch(() => undefined);
    loadFeed();
    const timer = window.setInterval(loadFeed, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    try { code = window.localStorage.getItem('lab_ref'); } catch { /* storage can be disabled */ }
    if (!code || !/^[0-9a-f]{10}$/i.test(code)) return;
    const attemptKey = `${user.id}:${code.toLowerCase()}`;
    if (inviteAttempt.current === attemptKey) return;
    inviteAttempt.current = attemptKey;
    void fetchJson<{ ok: true }>('/api/invites/accept', { method: 'POST', body: JSON.stringify({ code: code.toLowerCase() }) })
      .then(() => {
        try { window.localStorage.removeItem('lab_ref'); } catch { /* storage can be disabled */ }
        showToast(t('inviteLinked'));
      })
      .catch((error: unknown) => {
        // An HTTP response, including a contract error, consumes the stored code.
        if (error instanceof ApiError) {
          try { window.localStorage.removeItem('lab_ref'); } catch { /* storage can be disabled */ }
        }
      });
  }, [showToast, t, user]);

  const context = useMemo(() => ({ meta, feed, user, selectedChain, setSelectedChain, refreshUser, showToast, setRevealPending, walletDialog, openWallet, closeWallet }), [meta, feed, user, selectedChain, refreshUser, showToast, setRevealPending, walletDialog, openWallet, closeWallet]);
  return (
    <AppContext.Provider value={context}>
      <AgeGate initiallyConfirmed={ageConfirmed} />
      <Header />
      <FeedTicker />
      {children}
      <Footer />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </AppContext.Provider>
  );
}

const rememberAge = () => { document.cookie = `${AGE_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`; };

function AgeGate({ initiallyConfirmed }: { initiallyConfirmed: boolean }) {
  const { t } = useT();
  // Open on the server unless the cookie says 18+ was confirmed; confirmations stored before the cookie existed close it on mount.
  const [open, setOpen] = useState(!initiallyConfirmed);
  useEffect(() => {
    if (initiallyConfirmed) return;
    let stored = false;
    try { stored = window.localStorage.getItem('lab_age_confirmed') === '1'; } catch { /* storage can be disabled */ }
    if (stored) { rememberAge(); setOpen(false); }
  }, [initiallyConfirmed]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="age-modal panel">
        <span className="eyebrow">{t('entry')}</span>
        <h1 id="age-title">{t('ageTitle')}</h1>
        <p>{t('ageDescription')}</p>
        <button className="button button-primary age-confirm" onClick={() => {
          try { window.localStorage.setItem('lab_age_confirmed', '1'); } catch { /* the cookie still remembers it */ }
          rememberAge();
          setOpen(false);
        }}>{t('ageConfirm')}</button>
        <p className="fine-print">{t('ageFine')}</p>
      </div>
    </div>
  );
}

function Header() {
  const { t, locale } = useT();
  const { meta, selectedChain, setSelectedChain, user } = useAppContext();
  const [chainOpen, setChainOpen] = useState(false);
  const chainName = selectedChain === 'all' ? t('allChains') : meta?.chains.find((chain) => chain.id === selectedChain)?.name ?? 'Solana';
  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label={t('brandHome')}><LockyChat placement="below" /><span>lockabox<span className="brand-dot">.</span></span></Link>
      <div className="search-box"><span className="search-icon" aria-hidden="true">⌕</span><input aria-label={t('searchComingSoon')} disabled placeholder={t('searchComingSoon')} /><kbd>/</kbd></div>
      <div className="top-actions">
        <div className="chain-select-wrap">
          <button className="chip-button" onClick={() => setChainOpen((value) => !value)} aria-expanded={chainOpen}>
            <ChainIcon id={selectedChain} name={chainName} />{chainName}<span className="chevron">⌄</span>
          </button>
          {chainOpen && (
            <div className="chain-menu panel">
              <button className={selectedChain === 'all' ? 'selected' : ''} onClick={() => { setSelectedChain('all'); setChainOpen(false); }}>{t('allChains')}</button>
              {orderedChains(meta?.chains).map((chain) => <button key={chain.id} className={`${selectedChain === chain.id ? 'selected' : ''} ${chain.poolSize ? '' : 'chain-empty'}`} onClick={() => { setSelectedChain(chain.id); setChainOpen(false); }}><ChainIcon id={chain.id} name={chain.name} />{chain.name}{chain.poolSize ? <small className="chain-count">{chain.poolSize}</small> : null}</button>)}
            </div>
          )}
        </div>
        {user && <span className="points-pill mono">{new Intl.NumberFormat(locale).format(user.points)} {t('points')}</span>}
        <WalletConnectButton />
      </div>
    </header>
  );
}

function FeedTicker() {
  const { t, time } = useT();
  const { feed } = useAppContext();
  if (!feed?.items.length) return null;
  return <div className="feed-ticker" aria-label={t('liveFeed')}>{feed.items.slice(0, 8).map((item) => { const symbol = item.symbol ? `$${displaySymbol(item)}` : t('aToken'); const who = item.who ?? t('aWallet'); return <span key={`${item.kind}-${item.ref}`}><i className={item.kind === 'buy' ? 'feed-buy' : 'feed-pull'} />{item.kind === 'buy' ? t('walletBought', { who, symbol }) : t('tokenPulled', { symbol })}<small>{time(item.at)}</small></span>; })}</div>;
}

export function Sidebar() {
  const { t } = useT();
  const { meta, feed, selectedChain, setSelectedChain } = useAppContext();
  const pathname = usePathname();
  const pulls = feed?.items.filter((item) => item.kind === 'pull').slice(0, 5) ?? [];
  return (
    <aside className="sidebar">
      <nav className="side-nav" aria-label={t('primaryNavigation')}>
        <Link className={`nav-item ${pathname === '/' ? 'active' : ''}`} href="/"><span>▣</span>{t('roll')}</Link>
        <Link className={`nav-item ${pathname === '/leaderboard' ? 'active' : ''}`} href="/leaderboard"><span>↗</span>{t('bestPulls')}</Link>
        <Link className={`nav-item ${pathname === '/earn' ? 'active' : ''}`} href="/earn"><span>◎</span>{t('earnPoints')}</Link>
        <Link className={`nav-item ${pathname.startsWith('/verify') ? 'active' : ''}`} href="/verify"><span>✓</span>{t('verifyRolls')}</Link>
      </nav>
      <div className="side-section">{t('chains')}</div>
      <div className="chain-list">
        <button className={`chain-row ${selectedChain === 'all' ? 'active' : ''}`} onClick={() => setSelectedChain('all')}><ChainIcon id="all" />{t('allChains')}</button>
        {orderedChains(meta?.chains).map((chain) => <button key={chain.id} className={`chain-row ${selectedChain === chain.id ? 'active' : ''} ${chain.poolSize ? '' : 'chain-empty'}`} onClick={() => setSelectedChain(chain.id)}><ChainIcon id={chain.id} name={chain.name} />{chain.name}{chain.poolSize ? <small className="chain-count">{chain.poolSize}</small> : null}</button>)}
      </div>
      <div className="side-section">{t('hotPulls')}</div>
      <div className="hot-pulls">
        {pulls.length ? pulls.map((item, index) => { const symbol = displaySymbol(item); return <Link className="hot-pull" href={`/verify/${item.ref}`} key={`${item.ref}-${item.assetId}`}><span className="rank">{index + 1}</span><span className="token-avatar" style={{ background: `var(--r-${item.tier ?? 'micro'})`, boxShadow: `0 0 0 2px var(--r-${item.tier ?? 'micro'})` }}><TokenImage src={item.imageUrl} symbol={symbol} identity={String(item.assetId)} />{item.chainId ? <span className="avatar-chain"><ChainIcon id={item.chainId} size={11} /></span> : null}</span><span className="hot-name">${symbol}</span><span className="hot-tier">{item.tier ?? t('pull')}</span></Link>; }) : <p className="side-empty">{t('noPullsYet')}</p>}
      </div>
    </aside>
  );
}

function Footer() {
  const { t } = useT();
  return <footer className="footer"><span>{t('footerDisclaimer')}</span><span><Link href="/verify">{t('verifyRolls')}</Link><Link href="/earn">{t('earnPoints')}</Link><Link href="/sponsor">{t('forProjects')}</Link><Link href="/legal/terms">{t('terms')}</Link><Link href="/legal/privacy">{t('privacy')}</Link><Link href="/legal/disclaimer">{t('disclaimer')}</Link><Link href="/legal/sponsored">{t('sponsoredPolicy')}</Link></span></footer>;
}
