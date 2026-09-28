'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAppKitAccount, useAppKitState, useDisconnect } from '@reown/appkit/react';
import bs58 from 'bs58';
import { walletKit } from './reown';
import { useEvmWallet, isUserRejection } from './EvmWallet';
import { useSolanaWallet } from './useSolanaWallet';
import { useAppContext } from './AppShell';
import { fetchJson, formatAddress } from './api';
import { useT } from './i18n';
import '@/styles/wallet-flow.css';

export type WalletFamily = 'solana' | 'evm';

export default function WalletConnectButton() {
  const { t } = useT();
  const { user, refreshUser, walletDialog, closeWallet, openWallet, meta, showToast } = useAppContext();
  const evm = useEvmWallet();
  const sol = useSolanaWallet();
  const evmAccount = useAppKitAccount({ namespace: 'eip155' });
  const solAccount = useAppKitAccount({ namespace: 'solana' });
  const { open: modalOpen } = useAppKitState();
  const { disconnect } = useDisconnect();
  const [panel, setPanel] = useState(false);
  const [family, setFamily] = useState<WalletFamily>('evm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const awaiting = useRef<WalletFamily | 'all' | null>(null);
  const invalidation = useRef<string | null>(null);
  const previous = useRef<string[]>([]);
  const latest = useRef({ evm: '', solana: '' });
  const evmAddress = evmAccount.isConnected ? evmAccount.address?.toLowerCase() ?? '' : '';
  const solAddress = solAccount.isConnected ? solAccount.address ?? '' : '';
  latest.current = { evm: evmAddress, solana: solAddress };
  const address = family === 'evm' ? evmAddress : solAddress;
  const signedIn = !!address && !!user?.wallets.some(w => w.family === family && (family === 'evm' ? w.address.toLowerCase() : w.address) === address);
  const displayAddress = user?.wallets[0]?.address ?? (evmAddress || solAddress);
  const connected = !!(evmAddress || solAddress);

  // AppKit owns wallet discovery, QR pairing, deep links and session restoration.
  useEffect(() => {
    if (!walletDialog) return;
    const requested = walletDialog;
    closeWallet();
    setError(null);
    const target = requested === 'all' ? (evmAddress ? 'evm' : 'solana') : requested;
    setFamily(target);
    if ((target === 'evm' && evmAddress) || (target === 'solana' && solAddress) || (requested === 'all' && user)) {
      setPanel(true);
      return;
    }
    awaiting.current = requested;
    void walletKit.open({ view: 'Connect', ...(requested === 'all' ? {} : { namespace: requested === 'evm' ? 'eip155' : 'solana' }) })
      .catch(() => { awaiting.current = null; setError('Could not open WalletConnect. Please retry.'); });
  }, [walletDialog, closeWallet, evmAddress, solAddress, user]);

  useEffect(() => {
    if (modalOpen || !awaiting.current) return;
    const wanted = awaiting.current;
    const target = wanted === 'all' ? (evmAddress ? 'evm' : 'solana') : wanted;
    if (!(target === 'evm' ? evmAddress : solAddress)) return;
    awaiting.current = null;
    setFamily(target); setPanel(true);
  }, [modalOpen, evmAddress, solAddress]);

  useEffect(() => {
    if (panel) dialog.current?.showModal();
    else dialog.current?.close();
  }, [panel]);

  // A restored server session remains usable, but a connected account changing revokes it.
  useEffect(() => {
    const identities = [evmAddress && 'evm:' + evmAddress, solAddress && 'solana:' + solAddress].filter(Boolean);
    const before = previous.current;
    previous.current = identities;
    if (!user || busy) return;
    const owned = user.wallets.map(w => w.family + ':' + (w.family === 'evm' ? w.address.toLowerCase() : w.address));
    const removed = before.some(id => owned.includes(id) && !identities.includes(id));
    const foreign = identities.length > 0 && !identities.some(id => owned.includes(id));
    const key = user.id + ':' + identities.join(',');
    if ((!removed && !foreign) || invalidation.current === key) return;
    invalidation.current = key;
    setBusy(true);
    void fetchJson('/api/auth/logout', { method: 'POST' }).then(refreshUser)
      .catch(() => setError('Wallet changed. Please sign out before continuing.'))
      .finally(() => setBusy(false));
  }, [evmAddress, solAddress, user, busy, refreshUser]);

  const signIn = async () => {
    if (busy || !address) return;
    const signingAddress = address;
    const signingFamily = family;
    const provider = sol.walletProvider;
    let chainId = evm.getConnection()?.chainId;
    const sameWallet = () => latest.current[signingFamily] === signingAddress &&
      (signingFamily === 'solana' ? sol.walletProvider === provider : evm.getConnection()?.address === signingAddress && evm.getConnection()?.chainId === chainId);
    setBusy(true); setError(null);
    try {
      if (signingFamily === 'evm' && !meta?.chains.some(c => c.family === 'evm' && c.evmChainId === chainId)) {
        const target = meta?.chains.find(c => c.family === 'evm' && c.evmChainId === 8453) ?? meta?.chains.find(c => c.family === 'evm' && c.evmChainId);
        if (!target?.evmChainId) throw new Error('Supported networks are loading. Please retry.');
        await evm.switchChain(target.evmChainId);
        chainId = target.evmChainId;
      }
      const body = { address: signingAddress, family: signingFamily, ...(signingFamily === 'evm' ? { chainId } : {}) };
      const nonce = await fetchJson<{ nonce: string; issuedAt: string; message: string }>('/api/auth/nonce', { method: 'POST', body: JSON.stringify(body) });
      if (!sameWallet()) throw new Error('Wallet changed. Please try again.');
      const signature = signingFamily === 'evm' ? await evm.signMessage(nonce.message)
        : provider ? bs58.encode(await provider.signMessage(new TextEncoder().encode(nonce.message))) : '';
      if (!signature || !sameWallet()) throw new Error('Wallet changed or disconnected. Please try again.');
      await fetchJson('/api/auth/verify', { method: 'POST', body: JSON.stringify({ ...body, nonce: nonce.nonce, issuedAt: nonce.issuedAt, signature }) });
      if (!sameWallet()) {
        await fetchJson('/api/auth/logout', { method: 'POST' }); await refreshUser();
        throw new Error('Wallet changed during sign-in. Please retry.');
      }
      const account = await refreshUser();
      if (!account?.wallets.some(w => w.family === signingFamily && (w.family === 'evm' ? w.address.toLowerCase() : w.address) === signingAddress)) throw new Error('Could not load the signed-in account. Please retry.');
      setPanel(false); showToast('Signed in to Lockabox.');
    } catch (e) {
      setError(isUserRejection(e) ? 'Signature cancelled. No transaction was sent.' : e instanceof Error ? e.message : 'Could not sign in.');
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await fetchJson('/api/auth/logout', { method: 'POST' });
      await refreshUser();
      await disconnect();
      evm.forget();
      invalidation.current = null; awaiting.current = null; setPanel(false);
    } catch { setError('Could not fully disconnect. Please retry.'); }
    finally { setBusy(false); }
  };

  const manage = async () => {
    setPanel(false); setError(null);
    try { await walletKit.open({ view: connected ? 'Account' : 'Connect', namespace: family === 'evm' ? 'eip155' : 'solana' }); }
    catch { setError('Could not open WalletConnect. Please retry.'); }
  };

  return <>
    <button className="chip-button wallet-button" aria-haspopup="dialog" disabled={busy} onClick={() => openWallet()}>
      {user ? formatAddress(displayAddress) : connected ? 'Sign in · ' + formatAddress(evmAddress || solAddress) : t('connectWallet')}
    </button>
    {!panel && error && <span className="header-error" role="alert">{error}</span>}
    <dialog ref={dialog} className="wallet-dialog" aria-labelledby="wallet-title" onCancel={e => { e.preventDefault(); if (!busy) setPanel(false); }}>
      <div className="wallet-dialog-top"><span className="eyebrow">LOCKABOX · WALLETCONNECT</span><button className="wallet-close" aria-label="Close wallet dialog" disabled={busy} onClick={() => setPanel(false)}>×</button></div>
      <div className="wallet-dialog-heading"><h2 id="wallet-title">{signedIn || user ? 'Your wallet' : 'Sign in to Lockabox'}</h2>
        <p>Your wallet is connected through Reown. Signing in is a separate, optional step.</p></div>
      {evmAddress && solAddress && <div className="wallet-family-tabs">{(['evm', 'solana'] as const).map(f => <button key={f} disabled={busy} aria-pressed={family === f} onClick={() => setFamily(f)}>{f === 'evm' ? 'EVM' : 'Solana'}</button>)}</div>}
      <div className="wallet-identity"><strong>{family === 'evm' ? 'EVM' : 'Solana'}</strong><code>{address || user?.wallets[0]?.address}</code></div>
      {!signedIn && address && <><div className="wallet-permissions"><strong>Just a sign-in message</strong><p>No transaction. No gas fee. No permission to move your tokens.</p></div>
        <button className="button button-primary full-width" disabled={busy || (family === 'evm' && !evm.connection)} onClick={() => void signIn()}>{busy ? 'Confirm in your wallet…' : 'Sign in to Lockabox'}</button>
        <button className="wallet-text-button" disabled={busy} onClick={() => setPanel(false)}>Continue without signing</button></>}
      {user && <><Link className="wallet-text-button" href="/earn" onClick={() => setPanel(false)}>{t('inviteFriends')}</Link>
        <label className="privacy-toggle"><input type="checkbox" checked={user.hideFromBoard} disabled={busy} onChange={e => {
          setBusy(true); setError(null);
          void fetchJson('/api/me/privacy', { method: 'POST', body: JSON.stringify({ hideFromBoard: e.target.checked }) }).then(refreshUser).catch(() => setError('Could not update privacy.')).finally(() => setBusy(false));
        }} /><span>{t('hideWallet')}</span></label></>}
      <button className="wallet-text-button" disabled={busy} onClick={() => void manage()}>Manage wallet / change network</button>
      <button className="wallet-text-button" disabled={busy} onClick={() => void signOut()}>{t('signOut')} / Disconnect</button>
      {error && <div className="wallet-flow-error" role="alert">{error}</div>}
      <p className="wallet-safety-note">Never share your seed phrase or private key.</p>
    </dialog>
  </>;
}
