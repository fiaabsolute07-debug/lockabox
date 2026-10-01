'use client';

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
import { useIdleSound } from './useIdleSound';
import { DISCLAIMER_COOKIE } from './language';
import { LockyLogo } from './LockyLogo';
import { AdSlot } from './AdSlot';
import { donateOn } from './donate';
import { DotSky, SideRails } from './SideRails';

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

export default function AppShell({ children, disclaimerSeen = false }: { children: React.ReactNode; disclaimerSeen?: boolean }) {
  useIdleSound();
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
      <DisclaimerIntro initiallySeen={disclaimerSeen} />
      <DotSky />
      <Header />
      <TopNav />
      <FeedTicker />
      <SideRails />
      {children}
      <AdSlot />
      <Footer />
      <MobileTabBar />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </AppContext.Provider>
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
  const items = feed.items.slice(0, 8).map((item) => { const symbol = item.symbol ? `$${displaySymbol(item)}` : t('aToken'); const who = item.who ?? t('aWallet'); return <span key={`${item.kind}-${item.ref}`}><i className={item.kind === 'buy' ? 'feed-buy' : 'feed-pull'} />{item.kind === 'buy' ? t('walletBought', { who, symbol }) : t('tokenPulled', { symbol })}<small>{time(item.at)}</small></span>; });
  // The items run twice so the marquee loops without a gap; the copy is hidden from screen readers.
  return <div className="feed-ticker" aria-label={t('liveFeed')}><div className="feed-track">{items}<span className="feed-copy" aria-hidden="true">{items}</span></div></div>;
}

/** The claim-page look (DECISIONS #26): one row of text links under the header instead of a sidebar. Phones use MobileTabBar. */
function TopNav() {
  const { t } = useT();
  const pathname = usePathname();
  const links = [
    { href: '/', label: t('roll'), active: pathname === '/' },
    { href: '/leaderboard', label: t('bestPulls'), active: pathname === '/leaderboard' },
    { href: '/earn', label: t('earnPoints'), active: pathname === '/earn' },
    { href: '/verify', label: t('verifyRolls'), active: pathname.startsWith('/verify') },
    ...(donateOn ? [{ href: '/support', label: `♥ ${t('supportLocky')}`, active: pathname === '/support' }] : []),
  ];
  return <nav className="top-nav" aria-label={t('primaryNavigation')}>
    {links.map((link) => <Link key={link.href} href={link.href} className={link.active ? 'active' : ''} aria-current={link.active ? 'page' : undefined}>{link.label}</Link>)}
  </nav>;
}

const DISCLAIMER_KEY = 'lab_disclaimer_seen';

/** First visit: Locky says this is not financial advice (owner decision 2026-09-29, DECISIONS #20; replaces the 18+ gate). */
function DisclaimerIntro({ initiallySeen }: { initiallySeen: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(!initiallySeen);
  useEffect(() => {
    if (initiallySeen) return;
    let stored = false;
    try { stored = window.localStorage.getItem(DISCLAIMER_KEY) === '1'; } catch { /* storage can be disabled */ }
    if (stored) setOpen(false);
  }, [initiallySeen]);
  if (!open) return null;
  const close = () => {
    try { window.localStorage.setItem(DISCLAIMER_KEY, '1'); } catch { /* the cookie still remembers it */ }
    document.cookie = `${DISCLAIMER_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
    setOpen(false);
  };
  return (
    <div className="modal-backdrop nfa-backdrop" role="dialog" aria-modal="true" aria-labelledby="nfa-title">
      <div className="nfa-modal panel">
        <div className="nfa-locky">
          <span className="locky-bubble nfa-bubble" aria-hidden="true">{t('nfaBubble')}</span>
          <LockyLogo size={132} />
        </div>
        <span className="eyebrow">{t('nfaEyebrow')}</span>
        <h1 id="nfa-title">{t('nfaTitle')}</h1>
        <p>{t('nfaBody')}</p>
        <ul className="nfa-points">
          <li>{t('nfaPointRandom')}</li>
          <li>{t('nfaPointZero')}</li>
          <li>{t('nfaPointDyor')}</li>
        </ul>
        <button className="button button-primary nfa-confirm" autoFocus onClick={close}>{t('nfaConfirm')}</button>
      </div>
    </div>
  );
}

/** Phones hide the sidebar, so its four links live in a bottom tab bar within thumb reach (≤ 800 px, see globals.css). */
function MobileTabBar() {
  const { t } = useT();
  const pathname = usePathname();
  const tabs = [
    { href: '/', icon: '▣', label: t('roll'), active: pathname === '/' },
    { href: '/leaderboard', icon: '↗', label: t('bestPulls'), active: pathname === '/leaderboard' },
    { href: '/earn', icon: '◎', label: t('earnPoints'), active: pathname === '/earn' },
    { href: '/verify', icon: '✓', label: t('verifyRolls'), active: pathname.startsWith('/verify') },
  ];
  return <nav className="mobile-tabbar" aria-label={t('primaryNavigation')}>
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} className={tab.active ? 'active' : ''} aria-current={tab.active ? 'page' : undefined}><span aria-hidden="true">{tab.icon}</span>{tab.label}</Link>)}
  </nav>;
}

function Footer() {
  const { t } = useT();
  return <footer className="footer"><span>{t('footerDisclaimer')}</span><span>{donateOn && <Link href="/support">♥ {t('supportLocky')}</Link>}<Link href="/verify">{t('verifyRolls')}</Link><Link href="/earn">{t('earnPoints')}</Link><Link href="/sponsor">{t('forProjects')}</Link><Link href="/legal/terms">{t('terms')}</Link><Link href="/legal/privacy">{t('privacy')}</Link><Link href="/legal/disclaimer">{t('disclaimer')}</Link><Link href="/legal/sponsored">{t('sponsoredPolicy')}</Link></span></footer>;
}
