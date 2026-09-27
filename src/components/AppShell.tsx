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
  orderedChains,
  type FeedResponse,
  type MeResponse,
  type MetaResponse,
} from './api';
import { LockyLogo } from './LockyLogo';
import { ChainIcon } from './ChainIcon';
import { isUserRejection, useEvmWallet, type EvmProviderDetail } from './EvmWallet';
import { useT, translateApiError } from './i18n';
import { AGE_COOKIE } from './language';

type AppContextValue = {
  meta: MetaResponse | null;
  feed: FeedResponse | null;
  user: MeResponse['user'];
  selectedChain: string;
  setSelectedChain: (chain: string) => void;
  refreshUser: () => Promise<void>;
  showToast: (message: string) => void;
  setRevealPending: (pending: boolean) => void;
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

  const context = useMemo(() => ({ meta, feed, user, selectedChain, setSelectedChain, refreshUser, showToast, setRevealPending }), [meta, feed, user, selectedChain, refreshUser, showToast, setRevealPending]);
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
  const { meta, selectedChain, setSelectedChain, user, refreshUser } = useAppContext();
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const evm = useEvmWallet();
  const [chainOpen, setChainOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [hideFromBoard, setHideFromBoard] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHideFromBoard(user?.hideFromBoard ?? false), [user]);
  // Show the wallet this account signed in with: the connected one if it belongs to the account, else the first on record.
  const accountWallets = user?.wallets ?? [];
  const solanaAddress = publicKey?.toBase58();
  const signedInAddress = accountWallets.find((wallet) => wallet.family === 'evm' && wallet.address === evm.connection?.address)?.address
    ?? accountWallets.find((wallet) => wallet.family === 'solana' && wallet.address === solanaAddress)?.address
    ?? accountWallets[0]?.address;

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

  const chainName = selectedChain === 'all' ? t('allChains') : meta?.chains.find((chain) => chain.id === selectedChain)?.name ?? 'Solana';
  const chooserRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!evm.chooserOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!chooserRef.current?.contains(event.target as Node)) evm.setChooserOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') evm.setChooserOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [evm]);

  const connectEvm = async (detail: EvmProviderDetail) => {
    setAuthError(null); evm.setChooserOpen(false);
    try { await evm.connect(detail); }
    catch (error) { if (!isUserRejection(error)) setAuthError(t('evmConnectFailed')); }
  };

  // SIWE (AC-004): sign on the wallet's current chain when it is an enabled EVM chain, otherwise ask the wallet to move to Base.
  const signInEvm = async () => {
    const connection = evm.connection;
    if (!connection) return;
    setAuthBusy(true); setAuthError(null);
    try {
      const supported = (meta?.chains ?? []).filter((chain) => chain.family === 'evm' && chain.evmChainId).map((chain) => chain.evmChainId);
      let chainId = connection.chainId;
      if (!supported.includes(chainId)) { await evm.switchChain(BASE_CHAIN_ID); chainId = BASE_CHAIN_ID; }
      const address = connection.address;
      const nonce = await fetchJson<{ nonce: string; issuedAt: string; message: string }>('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ address, family: 'evm', chainId }) });
      const signature = await evm.signMessage(nonce.message);
      await fetchJson<{ userId: string }>('/api/auth/verify', { method: 'POST', body: JSON.stringify({ address, nonce: nonce.nonce, issuedAt: nonce.issuedAt, signature, family: 'evm', chainId }) });
      await refreshUser();
    } catch (error) {
      if (!isUserRejection(error)) setAuthError(translateApiError(error, t, 'signInNotCompleted'));
    } finally { setAuthBusy(false); }
  };

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
      setAuthError(translateApiError(error, t, 'signInNotCompleted'));
    } finally { setAuthBusy(false); }
  };

  const updatePrivacy = async (next: boolean) => {
    if (privacyBusy) return;
    setPrivacyBusy(true); setHideFromBoard(next);
    try {
      await fetchJson<{ hideFromBoard: boolean }>('/api/me/privacy', { method: 'POST', body: JSON.stringify({ hideFromBoard: next }) });
    } catch (error) {
      setHideFromBoard(user?.hideFromBoard ?? false);
      setAuthError(translateApiError(error, t, 'couldNotUpdatePrivacy'));
    } finally { setPrivacyBusy(false); }
  };

  const signOut = async () => {
    setAuthBusy(true); setAuthError(null);
    try {
      await fetchJson<{ ok: true }>('/api/auth/logout', { method: 'POST' });
      await refreshUser();
      await disconnect();
      evm.forget();
      setAccountOpen(false);
    } catch (error) {
      setAuthError(translateApiError(error, t, 'couldNotSignOut'));
    } finally { setAuthBusy(false); }
  };

  return (
    <header className="topbar">
      <Link href="/" className="brand" aria-label={t('brandHome')}><LockyLogo /><span>lockabox<span className="brand-dot">.</span></span></Link>
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
        {user ? <div className="account-menu-wrap" ref={accountMenuRef}><button className="chip-button wallet-button mono" title={signedInAddress} aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)}>{formatAddress(signedInAddress)}<span className="chevron">⌄</span></button>{accountOpen && <div className="account-menu panel" role="menu"><div className="account-summary"><span className="muted">{t('pointsLabel')}</span><strong>{new Intl.NumberFormat(locale).format(user.points)} {t('points')}</strong></div><Link className="account-link" role="menuitem" href="/earn" onClick={() => setAccountOpen(false)}>{t('inviteFriends')} <span>↗</span></Link><label className="privacy-toggle" role="menuitem"><input type="checkbox" checked={hideFromBoard} disabled={privacyBusy} onChange={(event) => void updatePrivacy(event.target.checked)} /><span><strong>{t('hideWallet')}</strong><small>{t('hideWalletHelp')}</small></span></label><div className="account-divider" /><button className="account-signout" role="menuitem" onClick={() => void signOut()} disabled={authBusy}>{authBusy ? t('signingOut') : t('signOut')}</button></div>}</div> : evm.connection ? <button className="chip-button wallet-button" title={evm.connection.address} onClick={() => void signInEvm()} disabled={authBusy}>{authBusy ? t('signingIn') : `${t('signIn')} · ${formatAddress(evm.connection.address)}`}</button> : connected ? <button className="chip-button wallet-button" onClick={() => void signIn()} disabled={authBusy}>{authBusy ? t('signingIn') : t('signIn')}</button> : <div className="account-menu-wrap" ref={chooserRef}><button className="chip-button wallet-button" aria-haspopup="menu" aria-expanded={evm.chooserOpen} onClick={() => evm.setChooserOpen(!evm.chooserOpen)}>{t('connectWallet')}</button>{evm.chooserOpen && <WalletChooser providers={evm.providers} onSolana={() => { evm.setChooserOpen(false); setVisible(true); }} onEvm={(detail) => void connectEvm(detail)} />}</div>}
      </div>
      {authError && <span className="header-error" role="status">{authError}</span>}
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
        {pulls.length ? pulls.map((item, index) => { const symbol = displaySymbol(item); return <Link className="hot-pull" href={`/verify/${item.ref}`} key={`${item.ref}-${item.assetId}`}><span className="rank">{index + 1}</span><span className="token-avatar" style={{ background: item.imageUrl ? `url(${item.imageUrl}) center/cover` : `var(--r-${item.tier ?? 'micro'})`, boxShadow: `0 0 0 2px var(--r-${item.tier ?? 'micro'})` }}>{item.imageUrl ? null : symbol[0]}{item.chainId ? <span className="avatar-chain"><ChainIcon id={item.chainId} size={11} /></span> : null}</span><span className="hot-name">${symbol}</span><span className="hot-tier">{item.tier ?? t('pull')}</span></Link>; }) : <p className="side-empty">{t('noPullsYet')}</p>}
      </div>
    </aside>
  );
}

function Footer() {
  const { t } = useT();
  return <footer className="footer"><span>{t('footerDisclaimer')}</span><span><Link href="/verify">{t('verifyRolls')}</Link><Link href="/earn">{t('earnPoints')}</Link><Link href="/sponsor">{t('forProjects')}</Link><Link href="/legal/terms">{t('terms')}</Link><Link href="/legal/privacy">{t('privacy')}</Link><Link href="/legal/disclaimer">{t('disclaimer')}</Link><Link href="/legal/sponsored">{t('sponsoredPolicy')}</Link></span></footer>;
}

const BASE_CHAIN_ID = 8453;

function WalletChooser({ providers, onSolana, onEvm }: { providers: EvmProviderDetail[]; onSolana: () => void; onEvm: (detail: EvmProviderDetail) => void }) {
  const { t } = useT();
  return <div className="account-menu panel wallet-chooser" role="menu" aria-label={t('chooseWallet')}>
    <button className="account-link" role="menuitem" onClick={onSolana}>{t('solanaWallet')} <span>◎</span></button>
    <div className="account-divider" />
    <span className="chooser-label muted">{t('evmWallet')}</span>
    {providers.length ? providers.map((detail) => <button key={detail.info.uuid} className="account-link" role="menuitem" onClick={() => onEvm(detail)}>
      <span className="chooser-wallet">{/* eslint-disable-line @next/next/no-img-element -- wallet icons are data: URIs announced by the wallet (EIP-6963) */}{detail.info.icon ? <img src={detail.info.icon} alt="" width={18} height={18} /> : <i aria-hidden="true">⬡</i>}{detail.info.name}</span><span>↗</span>
    </button>) : <p className="chooser-empty muted">{t('noEvmWallet')}</p>}
  </div>;
}
