'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import bs58 from 'bs58';
import {
  ApiError,
  displaySymbol,
  fetchJson,
  formatAddress,
  type FeedResponse,
  type MeResponse,
  type MetaResponse,
} from './api';
import { LockyLogo } from './LockyLogo';

type AppContextValue = {
  meta: MetaResponse | null;
  feed: FeedResponse | null;
  user: MeResponse['user'];
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
  refreshUser: () => Promise<void>;
  showToast: (message: string) => void;
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
  const set = (chain: string) => {
    setSelected(chain);
    try { window.localStorage.setItem('lab_chain', chain); } catch { /* storage can be disabled */ }
  };
  return [selected, set] as const;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [user, setUser] = useState<MeResponse['user']>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = usePersistedChain(meta);
  const inviteAttempt = useRef<string | null>(null);

  const refreshUser = useCallback(async () => {
    try { setUser((await fetchJson<MeResponse>('/api/auth/me')).user); } catch { setUser(null); }
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
    const loadFeed = () => void fetchJson<FeedResponse>('/api/feed').then((value) => { if (active) setFeed(value); }).catch(() => undefined);
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
        showToast('Invite linked');
      })
      .catch((error: unknown) => {
        // An HTTP response, including a contract error, consumes the stored code.
        if (error instanceof ApiError) {
          try { window.localStorage.removeItem('lab_ref'); } catch { /* storage can be disabled */ }
        }
      });
  }, [showToast, user]);

  const context = useMemo(() => ({ meta, feed, user, selectedChain, setSelectedChain, refreshUser, showToast }), [meta, feed, user, selectedChain, refreshUser, showToast]);
  return (
    <AppContext.Provider value={context}>
      <AgeGate />
      <Header />
      <FeedTicker />
      {children}
      <Footer />
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </AppContext.Provider>
  );
}

function AgeGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(window.localStorage.getItem('lab_age_confirmed') !== '1'); } catch { setOpen(true); }
  }, []);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-title">
      <div className="age-modal panel">
        <span className="eyebrow">LOCKABOX · ENTRY</span>
        <h1 id="age-title">Are you 18 or older?</h1>
        <p>Lockabox is a random discovery app for digital assets. Please confirm your age before entering.</p>
        <button className="button button-primary age-confirm" onClick={() => {
          try { window.localStorage.setItem('lab_age_confirmed', '1'); } catch { /* continue for this visit */ }
          setOpen(false);
        }}>I am 18 or older</button>
        <p className="fine-print">You can leave at any time. Nothing here is investment advice.</p>
      </div>
    </div>
  );
}

function Header() {
  const { meta, selectedChain, setSelectedChain, user, refreshUser } = useAppContext();
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [chainOpen, setChainOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [hideFromBoard, setHideFromBoard] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHideFromBoard(user?.hideFromBoard ?? false), [user]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [accountOpen]);

  const chainName = selectedChain === 'all' ? 'All chains' : meta?.chains.find((chain) => chain.id === selectedChain)?.name ?? 'Solana';
  const signIn = async () => {
    if (!publicKey || !signMessage) return;
    setAuthBusy(true); setAuthError(null);
    try {
      const address = publicKey.toBase58();
      const nonce = await fetchJson<{ nonce: string; issuedAt: string; message: string }>('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) });
      const signature = await signMessage(new TextEncoder().encode(nonce.message));
      await fetchJson<{ userId: string }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ address, nonce: nonce.nonce, issuedAt: nonce.issuedAt, signature: bs58.encode(signature) }) });
      await refreshUser();
    } catch (error) {
      setAuthError(error instanceof ApiError ? error.message : 'Sign in was not completed');
    } finally { setAuthBusy(false); }
  };

  const updatePrivacy = async (next: boolean) => {
    if (privacyBusy) return;
    setPrivacyBusy(true); setHideFromBoard(next);
    try {
      await fetchJson<{ hideFromBoard: boolean }>('/api/me/privacy', { method: 'POST', body: JSON.stringify({ hideFromBoard: next }) });
    } catch (error) {
      setHideFromBoard(user?.hideFromBoard ?? false);
      setAuthError(error instanceof ApiError ? error.message : 'Could not update privacy settings');
    } finally { setPrivacyBusy(false); }
  };

  const signOut = async () => {
    setAuthBusy(true); setAuthError(null);
    try {
      await fetchJson<{ ok: true }>('/api/auth/logout', { method: 'POST' });
      await refreshUser();
      await disconnect();
      setAccountOpen(false);
    } catch (error) {
      setAuthError(error instanceof ApiError ? error.message : 'Could not sign out');
    } finally { setAuthBusy(false); }
  };

  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label="Lockabox home"><LockyLogo /><span>lockabox<span className="brand-dot">.</span></span></Link>
      <div className="search-box"><span className="search-icon" aria-hidden="true">⌕</span><input aria-label="Search coming soon" disabled placeholder="Search coming soon" /><kbd>/</kbd></div>
      <div className="top-actions">
        <div className="chain-select-wrap">
          <button className="chip-button" onClick={() => setChainOpen((value) => !value)} aria-expanded={chainOpen}>
            <span className={`chain-dot ${selectedChain === 'all' ? 'all' : selectedChain}`} />{chainName}<span className="chevron">⌄</span>
          </button>
          {chainOpen && (
            <div className="chain-menu panel">
              <button className={selectedChain === 'all' ? 'selected' : ''} onClick={() => { setSelectedChain('all'); setChainOpen(false); }}>All chains</button>
              {(meta?.chains ?? []).map((chain) => <button key={chain.id} className={selectedChain === chain.id ? 'selected' : ''} onClick={() => { setSelectedChain(chain.id); setChainOpen(false); }}><span className={`chain-dot ${chain.id}`} />{chain.name}</button>)}
            </div>
          )}
        </div>
        {user && <span className="points-pill mono">{user.points.toLocaleString('en-US')} pts</span>}
        {user ? <div className="account-menu-wrap" ref={accountMenuRef}><button className="chip-button wallet-button mono" title={publicKey?.toBase58() ?? user.wallets?.[0]?.address} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>{formatAddress(publicKey?.toBase58() ?? user.wallets?.[0]?.address)}<span className="chevron">⌄</span></button>{accountOpen && <div className="account-menu panel" role="menu"><div className="account-summary"><span className="muted">POINTS</span><strong>{user.points.toLocaleString('en-US')} pts</strong></div><Link className="account-link" role="menuitem" href="/earn" onClick={() => setAccountOpen(false)}>Invite friends <span>↗</span></Link><label className="privacy-toggle" role="menuitem"><input type="checkbox" checked={hideFromBoard} disabled={privacyBusy} onChange={(event) => void updatePrivacy(event.target.checked)} /><span><strong>Hide my wallet</strong><small>from Best pulls, feed and buys</small></span></label><div className="account-divider" /><button className="account-signout" role="menuitem" onClick={() => void signOut()} disabled={authBusy}>{authBusy ? 'Signing out…' : 'Sign out'}</button></div>}</div> : !connected ? <button className="chip-button wallet-button" onClick={() => setVisible(true)}>Connect wallet</button> : <button className="chip-button wallet-button" onClick={() => void signIn()} disabled={authBusy}>{authBusy ? 'Signing…' : 'Sign in'}</button>}
      </div>
      {authError && <span className="header-error" role="status">{authError}</span>}
    </header>
  );
}

function FeedTicker() {
  const { feed } = useAppContext();
  if (!feed?.items.length) return null;
  return <div className="feed-ticker" aria-label="Live Lockabox feed">{feed.items.slice(0, 8).map((item) => { const symbol = item.symbol ? `$${displaySymbol(item)}` : 'a token'; return <span key={`${item.kind}-${item.ref}`}><i className={item.kind === 'buy' ? 'feed-buy' : 'feed-pull'} />{item.kind === 'buy' ? `${item.who ?? 'A wallet'} bought ${symbol}` : `${symbol === 'a token' ? 'A token' : symbol} was pulled`}<small>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>; })}</div>;
}

export function Sidebar() {
  const { meta, feed, selectedChain, setSelectedChain } = useAppContext();
  const pathname = usePathname();
  const pulls = feed?.items.filter((item) => item.kind === 'pull').slice(0, 5) ?? [];
  return (
    <aside className="sidebar">
      <nav className="side-nav" aria-label="Primary navigation">
        <Link className={`nav-item ${pathname === '/' ? 'active' : ''}`} href="/"><span>▣</span>Roll</Link>
        <Link className={`nav-item ${pathname === '/leaderboard' ? 'active' : ''}`} href="/leaderboard"><span>↗</span>Best pulls</Link>
        <Link className={`nav-item ${pathname === '/earn' ? 'active' : ''}`} href="/earn"><span>◎</span>Earn points</Link>
        <Link className={`nav-item ${pathname.startsWith('/verify') ? 'active' : ''}`} href="/verify"><span>✓</span>Verify rolls</Link>
      </nav>
      <div className="side-section">CHAINS</div>
      <div className="chain-list">
        <button className={`chain-row ${selectedChain === 'all' ? 'active' : ''}`} onClick={() => setSelectedChain('all')}><span className="chain-dot all" />All chains</button>
        {(meta?.chains ?? []).map((chain) => <button key={chain.id} className={`chain-row ${selectedChain === chain.id ? 'active' : ''}`} onClick={() => setSelectedChain(chain.id)}><span className={`chain-dot ${chain.id}`} />{chain.name}</button>)}
      </div>
      <div className="side-section">HOT PULLS · 24H</div>
      <div className="hot-pulls">
        {pulls.length ? pulls.map((item, index) => { const symbol = displaySymbol(item); return <Link className="hot-pull" href={`/verify/${item.ref}`} key={`${item.ref}-${item.assetId}`}><span className="rank">{index + 1}</span><span className="token-avatar" style={{ background: `var(--r-${item.tier ?? 'micro'})` }}>{symbol[0]}</span><span className="hot-name">${symbol}</span><span className="hot-tier">{item.tier ?? 'pull'}</span></Link>; }) : <p className="side-empty">No pulls yet</p>}
      </div>
    </aside>
  );
}

function Footer() {
  return <footer className="footer"><span>18+ · Not investment advice · Random pick, not advice. Memecoins can go to zero.</span><span><Link href="/verify">Verify rolls</Link><Link href="/earn">Earn points</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/disclaimer">Disclaimer</Link><Link href="/legal/sponsored">Sponsored policy</Link></span></footer>;
}
