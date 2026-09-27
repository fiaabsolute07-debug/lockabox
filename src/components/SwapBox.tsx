'use client';

import { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { VersionedTransaction } from '@solana/web3.js';
import { ApiError, displaySymbol, fetchJson, formatPrice, formatRawAmount, type AssetDetail, type QuoteView } from './api';
import { useT, translateApiError } from './i18n';

const QUICK_AMOUNTS = ['0.01', '0.05', '0.1', '0.5', '1'];

export default function SwapBox({ asset, rollId, onRollAgain }: { asset: AssetDetail; rollId?: number; onRollAgain?: () => void }) {
  const { t, locale } = useT();
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [amount, setAmount] = useState('0.05');
  const [slippage, setSlippage] = useState('3');
  const [confirmHighSlippage, setConfirmHighSlippage] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRollAgain, setShowRollAgain] = useState(false);
  const [status, setStatus] = useState<{ kind: 'pending' | 'submitted'; signature?: string } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [swapAvailable, setSwapAvailable] = useState(asset.swapEnabled);

  useEffect(() => {
    setSwapAvailable(asset.swapEnabled); setQuote(null); setError(null); setShowRollAgain(false); setStatus(null);
  }, [asset.id, asset.swapEnabled]);

  useEffect(() => {
    const parsed = Number(amount);
    const slippageNumber = Number(slippage);
    if (!swapAvailable || !Number.isFinite(parsed) || parsed <= 0 || !Number.isFinite(slippageNumber) || slippageNumber <= 0 || slippageNumber > 49) { setQuote(null); return; }
    setQuoteBusy(true); setError(null); setShowRollAgain(false);
    const timer = window.setTimeout(() => {
      void fetchJson<QuoteView>('/api/swap/quote', { method: 'POST', body: JSON.stringify({ assetId: asset.id, amountSol: amount, slippageBps: Math.round(slippageNumber * 100) }) })
        .then(setQuote)
        .catch((reason: unknown) => {
          setQuote(null);
          if (reason instanceof ApiError && reason.code === 'swap_disabled') setSwapAvailable(false);
          else if (reason instanceof ApiError && reason.code === 'sell_check_failed') { setError(t('sellCheckFailed')); setShowRollAgain(true); }
          else setError(translateApiError(reason, t, 'couldNotQuote'));
        })
        .finally(() => setQuoteBusy(false));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [amount, asset.id, slippage, swapAvailable]);

  const symbol = displaySymbol(asset);
  if (!swapAvailable) return <section className="panel swap-card"><div className="card-heading"><h3>{t('buy')} ${symbol}</h3><span>{t('viaDex')} · {formatPrice(asset.priceUsd, locale)}</span></div><p className="muted">{t('inAppSwapUnavailable')}</p>{asset.links.dexscreener ? <a className="button button-outline full-width" href={asset.links.dexscreener} target="_blank" rel="noreferrer">{t('viewOnDex')}</a> : <button className="button button-outline full-width" disabled>{t('viewOnDex')}</button>}</section>;

  const highSlippage = Number(slippage) > 10;
  const buy = async () => {
    if (!publicKey || !sendTransaction) { setVisible(true); return; }
    if (!quote || (highSlippage && !confirmHighSlippage)) return;
    setError(null); setStatus(null);
    try {
      const built = await fetchJson<{ tradeId: number; swapTransaction: string; quote: QuoteView }>('/api/swap/build', { method: 'POST', body: JSON.stringify({ assetId: asset.id, amountSol: amount, slippageBps: quote.slippageBps, userPublicKey: publicKey.toBase58(), rollId }) });
      const tx = VersionedTransaction.deserialize(decodeBase64(built.swapTransaction));
      const signature = await sendTransaction(tx, connection);
      setStatus({ kind: 'pending', signature });
      await fetchJson<{ ok: boolean; status: 'submitted' }>(`/api/trades/${built.tradeId}`, { method: 'PATCH', body: JSON.stringify({ txHash: signature, wallet: publicKey.toBase58() }) });
      setStatus({ kind: 'submitted', signature });
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'swap_disabled') setSwapAvailable(false);
      else if (reason instanceof ApiError && reason.code === 'sell_check_failed') { setError(t('sellCheckFailed')); setShowRollAgain(true); }
      else setError(translateApiError(reason, t, 'walletDidNotComplete'));
    }
  };

  return <section className="panel swap-card">
    <div className="card-heading"><h3>{t('buy')} ${symbol}</h3><span>{t('viaJupiter')} · {formatPrice(asset.priceUsd, locale)}</span></div>
    <div className="amount-box"><div className="amount-label"><span>{t('youPay')}</span><span>SOL</span></div><div className="amount-line"><input aria-label={t('amountIn', { symbol: 'SOL' })} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /><span className="token-pill sol-pill">◎ SOL</span></div></div>
    <div className="quick-amounts">{QUICK_AMOUNTS.map((value) => <button key={value} className={value === amount ? 'active' : ''} onClick={() => setAmount(value)}>{value}</button>)}</div>
    <div className="slippage-row"><label htmlFor="slippage">{t('slippage')}</label><div className="slippage-input"><input id="slippage" type="number" min="1" max="49" step="1" value={slippage} onChange={(event) => { const next = Number(event.target.value); setSlippage(event.target.value === '' ? '' : String(Math.min(49, Math.max(1, Number.isFinite(next) ? next : 3)))); }} /><span>%</span></div></div>
    {highSlippage && <label className="confirm-row"><input type="checkbox" checked={confirmHighSlippage} onChange={(event) => setConfirmHighSlippage(event.target.checked)} /> {t('higherSlippage')}</label>}
    <div className="amount-box output-box"><div className="amount-label"><span>{t('youGetAtLeast')}</span><span>{quote ? `${t('slippage')} ${quote.slippageBps / 100}%` : t('quoteLoading')}</span></div><div className="amount-line"><b>{quote ? formatRawAmount(quote.outAmountMin, quote.decimals, locale) : '—'}</b><span className="token-pill token-out">{symbol.toUpperCase()}</span></div></div>
    <div className="quote-details"><div><span>{t('route')}</span><b>{quote?.route.length ? `SOL → ${quote.route.join(' → ')} → ${symbol}` : '—'}</b></div><div><span>{t('lockaboxFee')}</span><b className="up-text">0</b></div><div><span>{t('sellCheck')}</span><b className="up-text">{quote ? t('passed') : '—'}</b></div></div>
    {quoteBusy && <p className="quote-status">{t('updatingQuote')}</p>}
    {error && <div className="inline-error" role="alert">{error} {showRollAgain && onRollAgain && <button onClick={onRollAgain}>{t('rollAgain')}</button>}</div>}
    {status && <div className="trade-status" role="status">{status.kind === 'submitted' ? t('swapSubmitted') : t('swapPending')} · <a href={`https://solscan.io/tx/${status.signature}`} target="_blank" rel="noreferrer">{t('viewOnSolscan')}</a></div>}
    <button className="button button-buy full-width" onClick={() => void buy()} disabled={!quote || quoteBusy || (highSlippage && !confirmHighSlippage)}>{publicKey ? `${t('buy')} ${symbol.toUpperCase()} · ${t('reviewInWallet')}` : t('connectToBuy')}</button>
    <p className="disclaimer">{t('ownWalletDisclaimer')}</p>
  </section>;
}

function decodeBase64(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
