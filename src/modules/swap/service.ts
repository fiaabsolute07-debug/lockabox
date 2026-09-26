import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { recordGate, solanaHoneypotGate } from '@/modules/gates';
import { buildSwapTransaction, getQuote, SOL_MINT, type JupiterQuote } from './jupiter';

export const MAX_SLIPPAGE_BPS = 4900;
export const DEFAULT_SLIPPAGE_BPS = 300;
const LAMPORTS = 1_000_000_000;

export class SwapError extends Error {
  constructor(public code: 'not_found' | 'swap_disabled' | 'bad_amount' | 'sell_check_failed' | 'quote_failed', message: string) { super(message); }
}

type AssetRow = { id: number; chain_id: string; address: string; symbol: string | null; decimals: number | null; swap_enabled: boolean; family: string; killed: boolean };

async function loadAsset(assetId: number, sql: postgres.Sql): Promise<AssetRow> {
  const [a] = await sql<AssetRow[]>`
    select a.id, a.chain_id, a.address, a.symbol, a.decimals, ch.swap_enabled, ch.family, exists(select 1 from moderation m where m.asset_id = a.id) as killed
    from assets a join chains ch on ch.id = a.chain_id where a.id = ${assetId}`;
  if (!a) throw new SwapError('not_found', 'unknown asset');
  if (!a.swap_enabled || a.family !== 'solana' || a.killed) throw new SwapError('swap_disabled', 'in-app swap is not available for this coin; use View on DEX');
  return a;
}

/** Token decimals from chain RPC (getTokenSupply), cached on the asset row. */
export async function tokenDecimals(a: AssetRow, sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch): Promise<number | null> {
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

export function solToLamports(amountSol: string): bigint {
  if (!/^\d+(\.\d{1,9})?$/.test(amountSol)) throw new SwapError('bad_amount', 'amount must be a positive number with at most 9 decimals');
  const [whole, frac = ''] = amountSol.split('.');
  const lamports = BigInt(whole) * BigInt(LAMPORTS) + BigInt(frac.padEnd(9, '0'));
  if (lamports <= 0n) throw new SwapError('bad_amount', 'amount must be greater than zero');
  return lamports;
}

export type QuoteView = {
  assetId: number; symbol: string | null; inputSymbol: 'SOL'; inputAmount: string; outAmount: string; outAmountMin: string; decimals: number | null;
  priceImpactPct: number; slippageBps: number; route: string[]; lockaboxFee: 0; sellCheck: 'passed';
};

function view(a: AssetRow, amountSol: string, q: JupiterQuote, decimals: number | null): QuoteView {
  return { assetId: a.id, symbol: a.symbol, inputSymbol: 'SOL', inputAmount: amountSol, outAmount: q.outAmount, outAmountMin: q.otherAmountThreshold, decimals,
    priceImpactPct: Number(q.priceImpactPct) * 100, slippageBps: q.slippageBps, route: q.routePlan.map((r) => r.swapInfo.label ?? 'AMM'), lockaboxFee: 0, sellCheck: 'passed' };
}

function clampSlippage(bps: unknown) {
  const n = Number(bps ?? DEFAULT_SLIPPAGE_BPS);
  return Number.isInteger(n) && n >= 10 && n <= MAX_SLIPPAGE_BPS ? n : DEFAULT_SLIPPAGE_BPS;
}

/** LAB-AC-039: re-run the sell check right before quoting; a failure quarantines the coin (kill switch) at once. */
async function sellCheck(a: AssetRow, sql: postgres.Sql, fetchImpl: typeof fetch) {
  const out = await solanaHoneypotGate(a.address, fetchImpl);
  await recordGate(a.id, 'honeypot', out, sql);
  if (!out.passed) {
    await sql`insert into moderation (asset_id, reason, actor) values (${a.id}, ${`pre-trade sell check: ${out.reason}`}, 'system') on conflict do nothing`;
    throw new SwapError('sell_check_failed', 'this coin failed the pre-trade sell check and was removed from all cases');
  }
}

export async function quote(p: { assetId: number; amountSol: string; slippageBps?: unknown }, sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch): Promise<QuoteView> {
  const a = await loadAsset(p.assetId, sql);
  const lamports = solToLamports(p.amountSol);
  await sellCheck(a, sql, fetchImpl);
  const q = await getQuote({ inputMint: SOL_MINT, outputMint: a.address, amount: lamports.toString(), slippageBps: clampSlippage(p.slippageBps) }, fetchImpl)
    .catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  return view(a, p.amountSol, q, await tokenDecimals(a, sql, fetchImpl));
}

/** Builds an unsigned transaction for the user's wallet from a fresh server-side quote (never a client-supplied quote). */
export async function build(p: { assetId: number; amountSol: string; slippageBps?: unknown; userPublicKey: string; rollId?: number | null; userId?: string | null }, sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch) {
  const a = await loadAsset(p.assetId, sql);
  const lamports = solToLamports(p.amountSol);
  await sellCheck(a, sql, fetchImpl);
  const q = await getQuote({ inputMint: SOL_MINT, outputMint: a.address, amount: lamports.toString(), slippageBps: clampSlippage(p.slippageBps) }, fetchImpl)
    .catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  const tx = await buildSwapTransaction(q, p.userPublicKey, fetchImpl).catch((e) => { throw new SwapError('quote_failed', (e as Error).message); });
  const [row] = await sql<{ id: number }[]>`
    insert into trades (roll_id, user_id, wallet, chain_id, asset_id, input_symbol, input_amount, out_amount_min, quote, status)
    values (${p.rollId ?? null}, ${p.userId ?? null}, ${p.userPublicKey}, ${a.chain_id}, ${a.id}, 'SOL', ${p.amountSol}, ${q.otherAmountThreshold}, ${sql.json(q as never)}, 'built')
    returning id`;
  return { tradeId: Number(row.id), swapTransaction: tx.swapTransaction, lastValidBlockHeight: tx.lastValidBlockHeight, quote: view(a, p.amountSol, q, await tokenDecimals(a, sql, fetchImpl)) };
}

export async function markSubmitted(tradeId: number, txHash: string, wallet: string, sql: postgres.Sql = defaultSql) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(txHash)) throw new SwapError('bad_amount', 'invalid transaction signature');
  const [row] = await sql`update trades set tx_hash = ${txHash}, status = 'submitted', updated_at = now() where id = ${tradeId} and wallet = ${wallet} and status = 'built' returning id`;
  return !!row;
}

/** Worker: confirms submitted Solana trades via getSignatureStatuses (only confirmed trades ever reach the feed). */
export async function confirmSubmitted(sql: postgres.Sql = defaultSql, fetchImpl: typeof fetch = fetch) {
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
