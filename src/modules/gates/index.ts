import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';
import { getQuote, JupiterError, SOL_MINT } from '@/modules/swap/jupiter';

/**
 * Hidden gates (LAB §2.3). They remove assets that cannot possibly be a win for the buyer; they are never shown
 * to users as risk labels (LAB D3).
 */
export const MIN_LIQUIDITY_USD = 1_000;
/** Round trip SOL → token → SOL keeping less than this share means a sell tax / honeypot. */
export const MIN_ROUND_TRIP = 0.5;
const PROBE_LAMPORTS = 10_000_000; // 0.01 SOL

export type GateOutcome = { passed: boolean; reason: string };

export function liquidityGate(liquidityUsd: number | null): GateOutcome {
  if (liquidityUsd === null || !Number.isFinite(liquidityUsd)) return { passed: false, reason: 'no liquidity data' };
  return liquidityUsd >= MIN_LIQUIDITY_USD
    ? { passed: true, reason: `liquidity $${Math.round(liquidityUsd)}` }
    : { passed: false, reason: `liquidity $${Math.round(liquidityUsd)} < $${MIN_LIQUIDITY_USD}` };
}

/**
 * Solana honeypot probe using quotes only (no wallet, no signing): buy 0.01 SOL of the token, then quote selling
 * everything back. No sell route, or a round trip keeping < 50 %, fails the gate. Limitation (recorded in
 * DECISIONS.md): quotes cannot see freeze-authority tricks that only bite at transfer time; the pre-trade check in
 * the swap flow re-quotes the sell right before the user signs.
 */
export async function solanaHoneypotGate(mint: string, fetchImpl: typeof fetch = fetch): Promise<GateOutcome> {
  try {
    const buy = await getQuote({ inputMint: SOL_MINT, outputMint: mint, amount: String(PROBE_LAMPORTS), slippageBps: 500 }, fetchImpl);
    if (buy.outAmount === '0') return { passed: false, reason: 'buy route returns nothing' };
    const sell = await getQuote({ inputMint: mint, outputMint: SOL_MINT, amount: buy.outAmount, slippageBps: 500 }, fetchImpl);
    const kept = Number(sell.outAmount) / PROBE_LAMPORTS;
    return kept >= MIN_ROUND_TRIP
      ? { passed: true, reason: `round trip keeps ${(kept * 100).toFixed(1)}%` }
      : { passed: false, reason: `round trip keeps only ${(kept * 100).toFixed(1)}%` };
  } catch (e) {
    if (e instanceof JupiterError && (e.code === 'TOKEN_NOT_TRADABLE' || e.code === 'COULD_NOT_FIND_ANY_ROUTE' || e.status === 400)) {
      return { passed: false, reason: `no route: ${e.code}` };
    }
    throw e; // network / 429: leave the asset unchecked, retry next cycle
  }
}

export async function recordGate(assetId: number, gate: 'honeypot' | 'liquidity', out: GateOutcome, sql: postgres.Sql = defaultSql) {
  await sql`
    insert into gate_results (asset_id, gate, passed, reason, checked_at) values (${assetId}, ${gate}, ${out.passed}, ${out.reason}, now())
    on conflict (asset_id, gate) do update set passed = excluded.passed, reason = excluded.reason, checked_at = excluded.checked_at`;
}
