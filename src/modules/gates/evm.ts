import { getLifiQuote, LifiError, NATIVE } from '@/modules/swap/lifi';
import { getUniswapQuote, UNISWAP_NATIVE, UniswapError } from '@/modules/swap/uniswap';
import { MIN_ROUND_TRIP, type GateOutcome } from './index';

/**
 * EVM sell check (hidden gate, never shown as a risk label; LAB D3). Two sources:
 * - honeypot.is (Ethereum, BSC, Base): simulates a real buy and sell on a fork; fails honeypots and buy/sell tax > 50 %.
 * - Uniswap quote round trip on chains bought through Uniswap (DECISIONS #21), else LI.FI (Arc): buy a small amount, quote
 *   selling it back, keep ≥ 50 %. Weaker: a quote can't see transfer-time tricks, same limitation as the Solana gate (DECISIONS #5).
 * The probe address is a burn address; nothing is signed or sent.
 */
export const HONEYPOT_IS_CHAINS = new Set([1, 56, 8453]);
const PROBE_FROM = '0x000000000000000000000000000000000000dEaD';
const MAX_TAX_PCT = 50;
const NO_PAIR = 'honeypot.is: no pair found';

type HoneypotIs = {
  simulationSuccess?: boolean; honeypotResult?: { isHoneypot?: boolean; honeypotReason?: string };
  simulationResult?: { buyTax?: number; sellTax?: number; transferTax?: number };
};

export async function honeypotIsGate(chainId: number, token: string, fetchImpl: typeof fetch = fetch): Promise<GateOutcome> {
  const res = await fetchImpl(`https://api.honeypot.is/v2/IsHoneypot?address=${token}&chainID=${chainId}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return { passed: false, reason: NO_PAIR };
  if (!res.ok) throw new Error(`honeypot.is ${res.status}`); // leave unchecked, retry next cycle
  const b = (await res.json()) as HoneypotIs;
  if (b.honeypotResult?.isHoneypot) return { passed: false, reason: `honeypot.is: ${b.honeypotResult.honeypotReason ?? 'honeypot'}` };
  if (!b.simulationSuccess) return { passed: false, reason: 'honeypot.is: simulation failed' };
  const buy = b.simulationResult?.buyTax ?? 0, sell = b.simulationResult?.sellTax ?? 0, transfer = b.simulationResult?.transferTax ?? 0;
  if (Math.max(buy, sell, transfer) > MAX_TAX_PCT) return { passed: false, reason: `honeypot.is: tax buy ${buy}% sell ${sell}% transfer ${transfer}%` };
  return { passed: true, reason: `honeypot.is: sells, tax buy ${buy}% sell ${sell}%` };
}

export async function lifiRoundTripGate(chainId: number, token: string, probe: bigint, fetchImpl: typeof fetch = fetch): Promise<GateOutcome> {
  try {
    const buy = await getLifiQuote({ chainId, toToken: token, fromAmount: probe, fromAddress: PROBE_FROM, slippageBps: 500 }, fetchImpl);
    if (BigInt(buy.toAmountMin) === 0n) return { passed: false, reason: 'buy route returns nothing' };
    // Sell back into what we paid with (the native coin, or the USDC LI.FI used on Arc).
    const back = buy.fromToken.address.toLowerCase() === NATIVE ? NATIVE : buy.fromToken.address;
    const sell = await getLifiQuote({ chainId, fromToken: token, toToken: back, fromAmount: BigInt(buy.toAmountMin), fromAddress: PROBE_FROM, slippageBps: 500 }, fetchImpl);
    const kept = Number(BigInt(sell.toAmount) * 10_000n / probe) / 10_000;
    return kept >= MIN_ROUND_TRIP
      ? { passed: true, reason: `LI.FI round trip keeps ${(kept * 100).toFixed(1)}%` }
      : { passed: false, reason: `LI.FI round trip keeps only ${(kept * 100).toFixed(1)}%` };
  } catch (e) {
    if (e instanceof LifiError) return { passed: false, reason: `no route: ${e.message}` };
    throw e; // network: retry next cycle
  }
}

/** No verdict: the check could not run (no Uniswap pool path to buy through, API timeout, no key). Never a reason to kill a coin. */
export class SellCheckUnavailable extends Error {}

export async function uniswapRoundTripGate(chainId: number, token: string, probe: bigint, fetchImpl: typeof fetch = fetch): Promise<GateOutcome> {
  const noVerdict = (e: unknown): never => {
    if (e instanceof UniswapError) throw new SellCheckUnavailable(`Uniswap: ${e.message}`);
    throw e; // network: retry next cycle
  };
  const buy = await getUniswapQuote({ chainId, toToken: token, fromAmount: probe, swapper: PROBE_FROM, slippageBps: 500 }, fetchImpl).catch(noVerdict);
  if (BigInt(buy.toAmountMin) === 0n) return { passed: false, reason: 'buy route returns nothing' };
  let sell;
  try {
    sell = await getUniswapQuote({ chainId, fromToken: token, toToken: UNISWAP_NATIVE, fromAmount: BigInt(buy.toAmountMin), swapper: PROBE_FROM, slippageBps: 500 }, fetchImpl);
  } catch (e) {
    // Buyable through Uniswap but no way to sell it back there: that is the pattern the check exists for.
    if (e instanceof UniswapError && (e.kind === 'no_route' || e.kind === 'rejected')) return { passed: false, reason: `Uniswap: buys but cannot sell back (${e.message})` };
    return noVerdict(e);
  }
  const kept = Number(BigInt(sell.toAmount) * 10_000n / probe) / 10_000;
  return kept >= MIN_ROUND_TRIP
    ? { passed: true, reason: `Uniswap round trip keeps ${(kept * 100).toFixed(1)}%` }
    : { passed: false, reason: `Uniswap round trip keeps only ${(kept * 100).toFixed(1)}%` };
}

export type SwapProvider = 'jupiter' | 'lifi' | 'uniswap';

/** Picks the stronger check the chain supports. `probe` is in the smallest unit of the chain's input coin. */
export async function evmSellGate(chainId: number, token: string, probe: bigint, fetchImpl: typeof fetch = fetch, provider: SwapProvider | null = 'lifi'): Promise<GateOutcome> {
  const roundTrip = () => provider === 'uniswap' ? uniswapRoundTripGate(chainId, token, probe, fetchImpl) : lifiRoundTripGate(chainId, token, probe, fetchImpl);
  if (!HONEYPOT_IS_CHAINS.has(chainId)) return roundTrip();
  const out = await honeypotIsGate(chainId, token, fetchImpl);
  // honeypot.is does not index Uniswap v4 pools (32-byte pool ids): "no pair found" is not a verdict, so use the round trip.
  return !out.passed && out.reason === NO_PAIR ? roundTrip() : out;
}
