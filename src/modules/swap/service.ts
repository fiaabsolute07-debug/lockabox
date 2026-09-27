import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { audit } from '@/modules/admin/service';
import { isSolanaAddress } from '@/modules/auth/session';
import { recordGate, solanaHoneypotGate, type GateOutcome } from '@/modules/gates';
import { evmSellGate } from '@/modules/gates/evm';
import { buildSwapTransaction, getQuote, SOL_MINT, type JupiterQuote } from './jupiter';
import { allowance, approveCalldata, assertSafe, getLifiQuote, LifiError, NATIVE, type LifiQuote } from './lifi';

/**
 * In-app buy (LAB §3c). Solana through Jupiter, EVM through LI.FI (DECISIONS #10, off unless `chains.swap_enabled`).
 * Lockabox never signs, never holds funds and adds no fee; route costs (DEX fees, LI.FI's own fee) are shown in the quote.
 */

export const MAX_SLIPPAGE_BPS = 4900;
export const DEFAULT_SLIPPAGE_BPS = 300;
const PROBE_FROM = '0x000000000000000000000000000000000000dEaD';

export class SwapError extends Error {
  constructor(public code: 'not_found' | 'swap_disabled' | 'bad_amount' | 'sell_check_failed' | 'quote_failed', message: string) { super(message); }
}

type AssetRow = {
  id: number; chain_id: string; address: string; symbol: string | null; decimals: number | null; swap_enabled: boolean; family: string; killed: boolean;
  evm_chain_id: number | null; rpc_url: string | null; native_symbol: string | null; native_decimals: number;
};

async function loadAsset(assetId: number, sql: postgres.Sql): Promise<AssetRow> {
  const [a] = await sql<AssetRow[]>`
    select a.id, a.chain_id, a.address, a.symbol, a.decimals, ch.swap_enabled, ch.family, exists(select 1 from moderation m where m.asset_id = a.id) as killed,
           ch.evm_chain_id, ch.rpc_url, ch.native_symbol, ch.native_decimals
    from assets a join chains ch on ch.id = a.chain_id where a.id = ${assetId}`;
  if (!a) throw new SwapError('not_found', 'unknown asset');
  const supported = a.family === 'solana' || (a.family === 'evm' && !!a.evm_chain_id);
  if (!a.swap_enabled || !supported || a.killed) throw new SwapError('swap_disabled', 'in-app swap is not available for this coin; use View on DEX');
  return a;
}

/** Token decimals from chain RPC (getTokenSupply), cached on the asset row. */
export async function tokenDecimals(a: Pick<AssetRow, 'id' | 'address' | 'decimals'>, sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  if (a.decimals !== null) return a.decimals;
  const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  try {
    const res = await fetchImpl(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [a.address] }) });
    const body = (await res.json()) as { result?: { value?: { decimals?: number } } };
    const d = body.result?.value?.decimals;
    if (typeof d === 'number') { await sql`update assets set decimals = ${d} where id = ${a.id}`; return d; }
  } catch { /* shown as raw units */ }
  return null;
}

/** "0.05" in a coin with `decimals` decimals → smallest units. */
export function parseAmount(amount: string, decimals: number): bigint {
  const re = new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`);
  if (!re.test(amount)) throw new SwapError('bad_amount', `amount must be a positive number with at most ${decimals} decimals`);
  const [whole, frac = ''] = amount.split('.');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  if (units <= 0n) throw new SwapError('bad_amount', 'amount must be greater than zero');
  return units;
}

export function solToLamports(amountSol: string): bigint {
  return parseAmount(amountSol, 9);
}

export type RouteFee = { name: string; percentage: number | null; amountUsd: number | null };
export type QuoteView = {
  assetId: number; symbol: string | null; inputSymbol: string; inputAmount: string; outAmount: string; outAmountMin: string; decimals: number | null;
  priceImpactPct: number | null; slippageBps: number; route: string[]; provider: 'jupiter' | 'lifi'; routeFees: RouteFee[];
  lockaboxFee: 0; sellCheck: 'passed';
};

function jupiterView(a: AssetRow, amount: string, q: JupiterQuote, decimals: number | null): QuoteView {
  return { assetId: a.id, symbol: a.symbol, inputSymbol: 'SOL', inputAmount: amount, outAmount: q.outAmount, outAmountMin: q.otherAmountThreshold, decimals,
    priceImpactPct: Number(q.priceImpactPct) * 100, slippageBps: q.slippageBps, route: q.routePlan.map((r) => r.swapInfo.label ?? 'AMM'),
    provider: 'jupiter', routeFees: [], lockaboxFee: 0, sellCheck: 'passed' };
}

function lifiView(a: AssetRow, amount: string, q: LifiQuote, slippageBps: number): QuoteView {
  return { assetId: a.id, symbol: a.symbol, inputSymbol: q.fromToken.symbol, inputAmount: amount, outAmount: q.toAmount, outAmountMin: q.toAmountMin,
    decimals: q.toToken.decimals, priceImpactPct: null, slippageBps, route: q.route.length ? q.route : [q.tool],
    provider: 'lifi', routeFees: q.fees.map(({ name, percentage, amountUsd }) => ({ name, percentage, amountUsd })), lockaboxFee: 0, sellCheck: 'passed' };
}

function clampSlippage(bps: unknown) {
  const n = Number(bps ?? DEFAULT_SLIPPAGE_BPS);
  return Number.isInteger(n) && n >= 10 && n <= MAX_SLIPPAGE_BPS ? n : DEFAULT_SLIPPAGE_BPS;
}

/** Probe size for the EVM sell check: 0.01 of an 18-decimal native coin, 1 unit of a 6-decimal one (Arc USDC). */
export function evmProbe(nativeDecimals: number) {
  return nativeDecimals >= 18 ? 10n ** BigInt(nativeDecimals - 2) : 10n ** BigInt(nativeDecimals);
}

/** LAB-AC-039: re-run the sell check right before quoting; a failure quarantines the coin (kill switch) at once. */
async function sellCheck(a: AssetRow, sql: postgres.Sql, fetchImpl: typeof fetch) {
  const out: GateOutcome = a.family === 'solana'
    ? await solanaHoneypotGate(a.address, fetchImpl)
    : await evmSellGate(a.evm_chain_id!, a.address, evmProbe(a.native_decimals), fetchImpl);
  await recordGate(a.id, 'honeypot', out, sql);
  if (!out.passed) {
    await sql.begin(async (tx) => {
      const [m] = await tx`insert into moderation (asset_id, reason, actor) values (${a.id}, ${`pre-trade sell check: ${out.reason}`}, 'system') on conflict do nothing returning asset_id`;
      if (m) await audit(tx, 'system', 'kill', a.id, { reason: `pre-trade sell check: ${out.reason}` });
    });
    throw new SwapError('sell_check_failed', 'this coin failed the pre-trade sell check and was removed from all cases');
  }
}

/** Quotes re-run as the user types; a sell check that passed in the last 2 minutes is reused. Build always re-checks. */
async function sellCheckRecent(a: AssetRow, sql: postgres.Sql, fetchImpl: typeof fetch) {
  const [g] = await sql<{ fresh: boolean }[]>`
    select passed and checked_at > now() - interval '2 minutes' as fresh from gate_results where asset_id = ${a.id} and gate = 'honeypot'`;
  if (!g?.fresh) await sellCheck(a, sql, fetchImpl);
}

async function lifiQuoteFor(a: AssetRow, units: bigint, from: string, slippageBps: number, fetchImpl: typeof fetch, checkSender: boolean) {
  const q = await getLifiQuote({ chainId: a.evm_chain_id!, toToken: a.address, fromAmount: units, fromAddress: from, slippageBps }, fetchImpl)
    .catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  try { assertSafe(q, { chainId: a.evm_chain_id!, fromAmount: units, toToken: a.address, from: checkSender ? from : undefined }); }
  catch (e) { throw new SwapError('quote_failed', e instanceof LifiError ? e.message : 'route rejected'); }
  return q;
}

/** `amount` is in the chain's input coin (SOL, ETH, BNB, or USDC on Arc); `amountSol` is the older name for Solana. */
export async function quote(p: { assetId: number; amount?: string; amountSol?: string; slippageBps?: unknown }, sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch): Promise<QuoteView> {
  const a = await loadAsset(p.assetId, sql);
  const amount = p.amount ?? p.amountSol ?? '';
  const units = parseAmount(amount, a.family === 'solana' ? 9 : a.native_decimals);
  const slippageBps = clampSlippage(p.slippageBps);
  await sellCheckRecent(a, sql, fetchImpl);
  if (a.family === 'evm') return lifiView(a, amount, await lifiQuoteFor(a, units, PROBE_FROM, slippageBps, fetchImpl, false), slippageBps);
  const q = await getQuote({ inputMint: SOL_MINT, outputMint: a.address, amount: units.toString(), slippageBps }, fetchImpl)
    .catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  return jupiterView(a, amount, q, await tokenDecimals(a, sql, fetchImpl));
}

export type EvmTx = { to: string; data: string; value: string; gasLimit: string | null; chainId: number };

/** Builds an unsigned transaction for the user's wallet from a fresh server-side quote (never a client-supplied quote). */
export async function build(
  p: { assetId: number; amount?: string; amountSol?: string; slippageBps?: unknown; wallet: string; rollId?: number | null; userId?: string | null },
  sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch,
) {
  const a = await loadAsset(p.assetId, sql);
  const amount = p.amount ?? p.amountSol ?? '';
  const slippageBps = clampSlippage(p.slippageBps);
  if (a.family === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(p.wallet)) throw new SwapError('bad_amount', 'an EVM wallet address is required');
    const wallet = p.wallet.toLowerCase();
    const units = parseAmount(amount, a.native_decimals);
    await sellCheck(a, sql, fetchImpl);
    const q = await lifiQuoteFor(a, units, wallet, slippageBps, fetchImpl, true);
    if (!q.tx) throw new SwapError('quote_failed', 'LI.FI returned no transaction');
    // ERC-20 input (Arc pays in USDC): approve exactly this amount to LI.FI's contract first, only if the allowance is short.
    let approval: EvmTx | null = null;
    if (q.fromToken.address.toLowerCase() !== NATIVE && q.approvalAddress && a.rpc_url) {
      const have = await allowance(a.rpc_url, q.fromToken.address, wallet, q.approvalAddress, fetchImpl).catch(() => 0n);
      if (have < units) approval = { to: q.fromToken.address, data: approveCalldata(q.approvalAddress, units), value: '0x0', gasLimit: null, chainId: a.evm_chain_id! };
    }
    const [row] = await sql<{ id: number }[]>`
      insert into trades (roll_id, user_id, wallet, chain_id, asset_id, input_symbol, input_amount, out_amount_min, quote, status)
      values (${p.rollId ?? null}, ${p.userId ?? null}, ${wallet}, ${a.chain_id}, ${a.id}, ${q.fromToken.symbol}, ${amount}, ${q.toAmountMin}, ${sql.json({ ...q, feeCollected: q.feeCollected.toString() } as never)}, 'built')
      returning id`;
    const transaction: EvmTx = { to: q.tx.to, data: q.tx.data, value: q.tx.value, gasLimit: q.tx.gasLimit, chainId: q.tx.chainId };
    return { tradeId: Number(row.id), evm: { chainId: a.evm_chain_id!, approval, transaction }, quote: lifiView(a, amount, q, slippageBps) };
  }
  if (!isSolanaAddress(p.wallet)) throw new SwapError('bad_amount', 'a Solana wallet address is required');
  const units = parseAmount(amount, 9);
  await sellCheck(a, sql, fetchImpl);
  const q = await getQuote({ inputMint: SOL_MINT, outputMint: a.address, amount: units.toString(), slippageBps }, fetchImpl)
    .catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  const tx = await buildSwapTransaction(q, p.wallet, fetchImpl).catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  const [row] = await sql<{ id: number }[]>`
    insert into trades (roll_id, user_id, wallet, chain_id, asset_id, input_symbol, input_amount, out_amount_min, quote, status)
    values (${p.rollId ?? null}, ${p.userId ?? null}, ${p.wallet}, ${a.chain_id}, ${a.id}, 'SOL', ${amount}, ${q.otherAmountThreshold}, ${sql.json(q as never)}, 'built')
    returning id`;
  return { tradeId: Number(row.id), swapTransaction: tx.swapTransaction, lastValidBlockHeight: tx.lastValidBlockHeight, quote: jupiterView(a, amount, q, await tokenDecimals(a, sql, fetchImpl)) };
}

export async function markSubmitted(tradeId: number, txHash: string, wallet: string, sql: postgres.Sql = defaultSql) {
  const [t] = await sql<{ family: string }[]>`select ch.family from trades t join chains ch on ch.id = t.chain_id where t.id = ${tradeId}`;
  if (!t) return false;
  const evm = t.family === 'evm';
  const ok = evm ? /^0x[0-9a-fA-F]{64}$/.test(txHash) : /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txHash);
  if (!ok) throw new SwapError('bad_amount', 'invalid transaction hash');
  const w = evm ? wallet.toLowerCase() : wallet;
  const h = evm ? txHash.toLowerCase() : txHash;
  const [row] = await sql`update trades set tx_hash = ${h}, status = 'submitted', updated_at = now() where id = ${tradeId} and wallet = ${w} and status = 'built' returning id`;
  return !!row;
}

export async function tradeStatus(tradeId: number, sql: postgres.Sql = defaultSql) {
  const [t] = await sql<{ id: number; status: string; tx_hash: string | null; chain_id: string }[]>`select id, status, tx_hash, chain_id from trades where id = ${tradeId}`;
  return t ? { id: Number(t.id), status: t.status as 'built' | 'submitted' | 'confirmed' | 'failed', txHash: t.tx_hash, chainId: t.chain_id } : null;
}

/** Worker: confirms submitted trades on-chain (only confirmed trades ever reach the feed). */
export async function confirmSubmitted(sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch) {
  return (await confirmSolana(sql, fetchImpl)) + (await confirmEvm(sql, fetchImpl));
}

async function confirmSolana(sql: postgres.Sql, fetchImpl: typeof fetch) {
  const rows = await sql<{ id: number; tx_hash: string; created_at: Date }[]>`select id, tx_hash, created_at from trades where status = 'submitted' and chain_id = 'solana' limit 100`;
  if (!rows.length) return 0;
  const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const res = await fetchImpl(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [rows.map((r) => r.tx_hash), { searchTransactionHistory: true }] }) });
  const body = (await res.json()) as { result?: { value?: ({ err: unknown; confirmationStatus?: string } | null)[] } };
  let n = 0;
  for (const [i, st] of (body.result?.value ?? []).entries()) {
    const r = rows[i];
    if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) { await sql`update trades set status = 'confirmed', updated_at = now() where id = ${r.id}`; n++; }
    else if (st?.err || (!st && Date.now() - r.created_at.getTime() > 10 * 60_000)) await sql`update trades set status = 'failed', updated_at = now() where id = ${r.id}`;
  }
  return n;
}

/** EVM: `eth_getTransactionReceipt` status 0x1 = confirmed, 0x0 = failed; no receipt after 30 min = failed. */
async function confirmEvm(sql: postgres.Sql, fetchImpl: typeof fetch) {
  const rows = await sql<{ id: number; tx_hash: string; created_at: Date; rpc_url: string | null }[]>`
    select t.id, t.tx_hash, t.created_at, ch.rpc_url from trades t join chains ch on ch.id = t.chain_id
    where t.status = 'submitted' and ch.family = 'evm' limit 100`;
  let n = 0;
  for (const r of rows) {
    if (!r.rpc_url) continue;
    try {
      const res = await fetchImpl(r.rpc_url, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [r.tx_hash] }) });
      const receipt = ((await res.json()) as { result?: { status?: string } | null }).result;
      if (receipt?.status === '0x1') { await sql`update trades set status = 'confirmed', updated_at = now() where id = ${r.id}`; n++; }
      else if (receipt?.status === '0x0' || (!receipt && Date.now() - r.created_at.getTime() > 30 * 60_000)) await sql`update trades set status = 'failed', updated_at = now() where id = ${r.id}`;
    } catch { /* retry next cycle */ }
  }
  return n;
}
