'use client';

import { useEffect, useState } from 'react';
import { ApiError, displaySymbol, explorerTxLink, fetchJson, formatPrice, formatRawAmount, type AssetDetail, type Chain, type EvmBuildResponse, type QuoteView } from './api';
import { isUserRejection, useEvmWallet } from './EvmWallet';
import { useT, translateApiError } from './i18n';
import { useTradeStatus } from './useTradeStatus';
import { useAppContext } from './AppShell';

/**
 * EVM buy through Uniswap (DECISIONS #21) or LI.FI (AC-038, DECISIONS #10), per chain. Rendered only when the coin's chain has
 * swap switched on; a coin Uniswap has no pool path for falls back to "Buy on DEX". Every route fee is shown
 * on its own line next to "Lockabox fee 0"; an ERC-20 input (USDC on Arc) is approved for exactly the amount, and the swap is sent
 * only after that approval is mined. Nothing is sent without the user's click (AC-040).
 */

const QUICK_AMOUNTS: Record<string, string[]> = {
  ETH: ['0.002', '0.005', '0.01', '0.05'], BNB: ['0.01', '0.05', '0.1', '0.5'], USDC: ['5', '10', '25', '50'],
  POL: ['10', '25', '50', '100'], AVAX: ['0.2', '0.5', '1', '2'], CELO: ['10', '25', '50', '100'], OKB: ['0.1', '0.2', '0.5', '1'], MON: ['5', '10', '25', '50'],
};

type Status = { kind: 'approve' | 'approvalPending' | 'confirm' | 'pending' | 'submitted'; hash?: string; tradeId?: number };

export default function EvmSwapBox({ asset, chain, rollId, onRollAgain }: { asset: AssetDetail; chain: Chain; rollId?: number; onRollAgain?: () => void }) {
  const { t, locale, number } = useT();
  const evm = useEvmWallet();
  const { openWallet } = useAppContext();
  const inputSymbol = chain.nativeSymbol ?? 'ETH';
  const quick = QUICK_AMOUNTS[inputSymbol] ?? QUICK_AMOUNTS.ETH;
  const [amount, setAmount] = useState(quick[1]);
  const [slippage, setSlippage] = useState('3');
  const [confirmHighSlippage, setConfirmHighSlippage] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRollAgain, setShowRollAgain] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapAvailable, setSwapAvailable] = useState(asset.swapEnabled);
  const [retry, setRetry] = useState(0);
  const final = useTradeStatus(status?.kind === 'submitted' ? status.tradeId ?? null : null);

  useEffect(() => {
    setSwapAvailable(asset.swapEnabled); setQuote(null); setError(null); setShowRollAgain(false); setStatus(null); setAmount(quick[1]);
  }, [asset.id, asset.swapEnabled, quick]);

  useEffect(() => {
    const parsed = Number(amount);
    const slippageNumber = Number(slippage);
    if (!swapAvailable || !Number.isFinite(parsed) || parsed <= 0 || !Number.isFinite(slippageNumber) || slippageNumber <= 0 || slippageNumber > 49) { setQuote(null); return; }
    setQuoteBusy(true); setError(null); setShowRollAgain(false);
    const timer = window.setTimeout(() => {
      void fetchJson<QuoteView>('/api/swap/quote', { method: 'POST', body: JSON.stringify({ assetId: asset.id, amount, slippageBps: Math.round(slippageNumber * 100) }) })
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
  }, [amount, asset.id, slippage, swapAvailable, retry, t]);

  const viaUniswap = (quote?.provider ?? chain.swapProvider) === 'uniswap';
  const symbol = displaySymbol(asset);
  if (!swapAvailable) return <section className="panel swap-card"><div className="card-heading"><h3>{t('buy')} ${symbol}</h3><span>{t('viaDex')} · {formatPrice(asset.priceUsd, locale)}</span></div><p className="muted">{t(chain.swapEnabled ? 'buyOnDexCoinNote' : 'buyOnDexNote')}</p>{asset.links.dexscreener ? <a className="button button-buy full-width" href={asset.links.dexscreener} target="_blank" rel="noreferrer">{t('buyOnDex')}</a> : null}</section>;

  const highSlippage = Number(slippage) > 10;
  const connection = evm.connection;

  const buy = async () => {
    if (!connection) { openWallet('evm'); return; }
    if (!quote || busy || (highSlippage && !confirmHighSlippage)) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      const built = await fetchJson<EvmBuildResponse>('/api/swap/build', { method: 'POST', body: JSON.stringify({ assetId: asset.id, amount, slippageBps: quote.slippageBps, userAddress: connection.address, rollId }) });
      await evm.switchChain(built.evm.chainId);
      if (built.evm.approval) {
        setStatus({ kind: 'approve' });
        const approvalHash = await evm.sendTransaction(built.evm.approval);
        setStatus({ kind: 'approvalPending', hash: approvalHash });
        if (await evm.waitForReceipt(approvalHash) !== 'success') { setStatus(null); setError(t('approvalFailed')); return; }
      }
      setStatus({ kind: 'confirm' });
      const hash = await evm.sendTransaction(built.evm.transaction);
      setStatus({ kind: 'pending', hash });
      await fetchJson<{ ok: boolean; status: 'submitted' }>(`/api/trades/${built.tradeId}`, { method: 'PATCH', body: JSON.stringify({ txHash: hash, wallet: connection.address }) });
      setStatus({ kind: 'submitted', hash, tradeId: built.tradeId });
    } catch (reason) {
      setStatus((current) => current?.hash && current.kind !== 'approvalPending' ? current : null);
      if (isUserRejection(reason)) return;
      if (reason instanceof ApiError && reason.code === 'swap_disabled') setSwapAvailable(false);
      else if (reason instanceof ApiError && reason.code === 'sell_check_failed') { setError(t('sellCheckFailed')); setShowRollAgain(true); }
      else setError(translateApiError(reason, t, 'walletDidNotComplete'));
    } finally { setBusy(false); }
  };

  const percent = (value: number | null) => value === null ? '' : `${number(value * 100, { maximumFractionDigits: 2 })} %`;
  const usd = (value: number | null) => value === null ? '' : ` · $${number(value, { maximumFractionDigits: value < 1 ? 4 : 2 })}`;
  const link = status?.hash ? explorerTxLink(chain.explorerTxUrl, status.hash) : null;
  const statusText = status && ({
    approve: t('approveInWallet', { amount, symbol: inputSymbol }),
    approvalPending: t('waitingApproval'),
    confirm: t('confirmBuyInWallet'),
    pending: t('swapPending'),
    submitted: final === 'confirmed' ? t('swapConfirmed') : final === 'failed' ? t('swapFailed') : t('swapSubmitted'),
  })[status.kind];

  return <section className="panel swap-card evm-swap">
    <div className="card-heading"><h3>{t('buy')} ${symbol}</h3><span>{t(viaUniswap ? 'viaUniswap' : 'viaLifi')} · {formatPrice(asset.priceUsd, locale)}</span></div>
    <div className="amount-box"><div className="amount-label"><span>{t('youPay')}</span><span>{inputSymbol} · {chain.name}</span></div><div className="amount-line"><input aria-label={t('amountIn', { symbol: inputSymbol })} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} /><span className="token-pill">{inputSymbol}</span></div></div>
    <div className="quick-amounts">{quick.map((value) => <button key={value} className={value === amount ? 'active' : ''} onClick={() => setAmount(value)}>{value}</button>)}</div>
    <div className="slippage-row"><label htmlFor="evm-slippage">{t('slippage')}</label><div className="slippage-input"><input id="evm-slippage" type="number" min="1" max="49" step="1" value={slippage} onChange={(event) => { const next = Number(event.target.value); setSlippage(event.target.value === '' ? '' : String(Math.min(49, Math.max(1, Number.isFinite(next) ? next : 3)))); }} /><span>%</span></div></div>
    {highSlippage && <label className="confirm-row"><input type="checkbox" checked={confirmHighSlippage} onChange={(event) => setConfirmHighSlippage(event.target.checked)} /> {t('higherSlippage')}</label>}
    <div className="amount-box output-box"><div className="amount-label"><span>{t('youGetAtLeast')}</span><span>{quote ? `${t('slippage')} ${quote.slippageBps / 100}%` : t('quoteLoading')}</span></div><div className="amount-line"><b>{quote ? formatRawAmount(quote.outAmountMin, quote.decimals, locale) : '—'}</b><span className="token-pill token-out">{symbol.toUpperCase()}</span></div></div>
    <div className="quote-details">
      <div><span>{t('route')}</span><b>{quote?.route.length ? `${quote.inputSymbol} → ${quote.route.join(' → ')} → ${symbol}` : '—'}</b></div>
      {(quote?.routeFees ?? []).map((fee, index) => <div key={`${fee.name}-${index}`} className="route-fee"><span>{fee.name}</span><b>{percent(fee.percentage)}{usd(fee.amountUsd)}</b></div>)}
      <div><span>{t('lockaboxFee')}</span><b className="up-text">0</b></div>
      <div><span>{t('sellCheck')}</span><b className="up-text">{quote ? t('passed') : '—'}</b></div>
    </div>
    {inputSymbol === 'USDC' && <p className="quote-status">{t('approveExactNote')}</p>}
    {quoteBusy && <p className="quote-status">{t('updatingQuote')}</p>}
    {error && <div className="inline-error" role="alert">{error} {showRollAgain && onRollAgain ? <button onClick={onRollAgain}>{t('rollAgain')}</button> : !status && <button onClick={() => setRetry((n) => n + 1)}>{t('tryAgain')}</button>}</div>}
    {statusText && <div className="trade-status" role="status">{statusText}{link && <> · <a href={link} target="_blank" rel="noreferrer">{t('viewOnExplorer')}</a></>}</div>}
    <button className="button button-buy full-width" onClick={() => void buy()} disabled={busy || (!!connection && (!quote || quoteBusy || (highSlippage && !confirmHighSlippage)))}>{connection ? `${t('buy')} ${symbol.toUpperCase()} · ${t('reviewInWallet')}` : t('connectEvmToBuy')}</button>
    <p className="disclaimer">{t(viaUniswap ? 'uniswapNote' : 'lifiNote')} {t('ownWalletDisclaimer')}</p>
  </section>;
}
