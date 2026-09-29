/**
 * Uniswap API (Trading API) for EVM buys on chains Uniswap covers (DECISIONS #21). Docs read 2026-09-29:
 * developers.uniswap.org/docs/trading/swapping-api (integration guide, supported chains, OpenAPI at /v1/api.json).
 * - Free, API key server-side only (`UNISWAP_API_KEY`), 6 requests/s per key.
 * - We ask for Uniswap pools only (`protocols` V2/V3/V4 → `routing: CLASSIC`, one transaction to the Universal Router);
 *   no UniswapX orders, no integrator fee. Input is the chain's native coin, so no approval or Permit2 signature is needed.
 * - The Universal Router version is pinned with `x-universal-router-version` and every transaction's `to` must be that
 *   router's published address on the chain; the transaction is built by Uniswap and signed in the user's wallet.
 */

type Fetch = typeof fetch;
const BASE = 'https://trade-api.gateway.uniswap.org/v1';
export const UNISWAP_NATIVE = '0x0000000000000000000000000000000000000000';
export const UNIVERSAL_ROUTER_VERSION = '2.1.2';

/** Universal Router 2.1.2 by chain id (docs "Supported Chains & Tokens", 2026-09-29). zkSync (2.0 only) is left out. */
export const UNIVERSAL_ROUTERS: Record<number, string> = {
  1: '0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85',
  10: '0xC09255D86DB563cBc11C2fCf4a0C512e160111B4',
  56: '0xDc264714F68d84CF29BC605589405E78bDBE7C9f',
  130: '0xD1b797D92d87B688193A2B976eFc8D577D204343',
  137: '0xDc264714F68d84CF29BC605589405E78bDBE7C9f',
  143: '0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e',
  196: '0x1cd182C94fcF42277B80DBB9060F88024809E61E',
  480: '0xF025e0Fe9E331A0eF05c2ad3C4E9C64b625cda6f',
  1868: '0x661E93cca42AfacB172121EF892830cA3b70F08d',
  4326: '0xAedd1CF4C14e833140A61E9C0d2b73a64795c823',
  4663: '0x204FAca1764B154221e35c0d20aBb3c525710498',
  5042: '0x8702463e73f74d0b6765aBceb314Ef07aCb92650',
  8453: '0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40',
  42161: '0x2d01411773c8C24805306E89A41F7855C3c4Fe65',
  42220: '0xe2023F3FA515cF070e07fD9d51c1d236e07843f4',
  43114: '0x661E93cca42AfacB172121EF892830cA3b70F08d',
  57073: '0x661E93cca42AfacB172121EF892830cA3b70F08d',
  59144: '0xDc264714F68d84CF29BC605589405E78bDBE7C9f',
  7777777: '0xF025e0Fe9E331A0eF05c2ad3C4E9C64b625cda6f',
};

/** Universal Router `execute(bytes,bytes[],uint256)` and `execute(bytes,bytes[])`. */
const EXECUTE_SELECTORS = ['0x3593564c', '0x24856bc3'];

export class UniswapError extends Error {
  /** `no_route`: Uniswap has no pool path for this coin (the UI falls back to "Buy on DEX"); `transient`: timeout, rate limit or
   *  server error, worth retrying; `unavailable`: no or bad API key. */
  constructor(message: string, public kind: 'no_route' | 'transient' | 'rejected' | 'unavailable' = 'rejected') { super(message); }
}

type Amount = { amount?: string; token?: string; minimumAmount?: string; recipient?: string };
export type UniswapRawQuote = {
  input?: Amount; output?: Amount; chainId?: number; swapper?: string; routeString?: string; priceImpact?: number; gasFeeUSD?: string;
  aggregatedOutputs?: { token?: string; amount?: string; minAmount?: string; recipient?: string; bps?: number }[];
  route?: { type?: string; fee?: string }[][];
};
export type UniswapQuote = {
  raw: UniswapRawQuote; routing: string; chainId: number;
  fromAmount: string; toToken: string; toAmount: string; toAmountMin: string;
  route: string[]; priceImpactPct: number | null; gasFeeUsd: number | null;
};
export type UniswapTx = { to: string; data: string; value: string; gasLimit: string | null; chainId: number; from: string | null };

function headers(apiKey: string) {
  return { 'x-api-key': apiKey, 'content-type': 'application/json', accept: 'application/json', 'x-universal-router-version': UNIVERSAL_ROUTER_VERSION };
}

function apiKey() {
  const key = process.env.UNISWAP_API_KEY;
  if (!key) throw new UniswapError('Uniswap API key is not configured', 'unavailable');
  return key;
}

async function post<T>(path: string, body: unknown, fetchImpl: Fetch): Promise<T> {
  const res = await fetchImpl(`${BASE}${path}`, { method: 'POST', headers: headers(apiKey()), body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as T & { errorCode?: string; detail?: string; message?: string };
  if (res.ok) return json;
  const detail = json.detail ?? json.message ?? `Uniswap API ${res.status}`;
  if (res.status === 404) throw new UniswapError(detail, json.errorCode === 'UpstreamTimeoutError' ? 'transient' : 'no_route');
  if (res.status === 429 || res.status >= 500) throw new UniswapError(detail, 'transient');
  throw new UniswapError(detail, res.status === 401 || res.status === 403 ? 'unavailable' : 'rejected');
}

/** "[v3] 100.00% = [0.05%] 0xab… -> [0.3%] 0xcd…" → ["Uniswap v3 0.05%", "Uniswap v3 0.3%"] (one label per hop). */
export function routeLabels(routeString: string | undefined): string[] {
  if (!routeString) return ['Uniswap'];
  const out: string[] = [];
  for (const part of routeString.split(',')) {
    const version = /\[(v\d)\]/i.exec(part)?.[1]?.toLowerCase() ?? '';
    // v4 pools with a dynamic fee carry the 0x800000 flag, which reads as "[838.8608%]".
    for (const m of part.matchAll(/\[(\d+(?:\.\d+)?)%\]/g)) out.push(`Uniswap ${version} ${Number(m[1]) > 100 ? 'dynamic fee' : `${m[1]}%`}`.replace(/\s+/g, ' ').trim());
  }
  return out.length ? out : ['Uniswap'];
}

export function parseUniswapQuote(body: { routing?: string; quote?: UniswapRawQuote }): UniswapQuote {
  const q = body.quote;
  if (!q?.input?.amount || !q.output?.amount || !q.output.token || !q.chainId) throw new UniswapError('Uniswap returned no quote');
  return {
    raw: q, routing: body.routing ?? '', chainId: q.chainId,
    fromAmount: q.input.amount, toToken: q.output.token, toAmount: q.output.amount, toAmountMin: q.output.minimumAmount ?? q.output.amount,
    route: routeLabels(q.routeString), priceImpactPct: typeof q.priceImpact === 'number' ? q.priceImpact : null,
    gasFeeUsd: q.gasFeeUSD != null && Number.isFinite(Number(q.gasFeeUSD)) ? Number(q.gasFeeUSD) : null,
  };
}

/**
 * Checks on every quote (and its transaction) before a user signs anything: Uniswap pools only (CLASSIC), right chain, native
 * input of exactly the amount, the coin we asked for, every output going to the buyer (no fee taker), and a transaction that
 * calls the published Universal Router's `execute` from the buyer's wallet with value = amount.
 */
export function assertUniswapSafe(q: UniswapQuote, expect: { chainId: number; fromAmount: bigint; toToken: string; swapper?: string }, tx?: UniswapTx) {
  const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();
  if (q.routing !== 'CLASSIC') throw new UniswapError(`unexpected routing ${q.routing || 'none'}`);
  if (q.chainId !== expect.chainId) throw new UniswapError('quote is for another chain');
  if (lower(q.raw.input?.token) !== UNISWAP_NATIVE) throw new UniswapError('route pays with a different coin');
  if (BigInt(q.fromAmount) !== expect.fromAmount) throw new UniswapError('route spends a different amount');
  if (lower(q.toToken) !== lower(expect.toToken)) throw new UniswapError('route buys a different token');
  if (BigInt(q.toAmountMin) <= 0n) throw new UniswapError('route returns nothing');
  const buyer = lower(expect.swapper ?? q.raw.swapper);
  for (const o of q.raw.aggregatedOutputs ?? []) if (lower(o.recipient) !== buyer) throw new UniswapError('part of the output goes to someone else');
  if (!tx) return;
  const router = UNIVERSAL_ROUTERS[expect.chainId];
  if (!router || lower(tx.to) !== lower(router)) throw new UniswapError('transaction target is not the Uniswap Universal Router');
  if (tx.chainId !== expect.chainId) throw new UniswapError('transaction is for another chain');
  if (expect.swapper && lower(tx.from) !== lower(expect.swapper)) throw new UniswapError('transaction sender does not match your wallet');
  if (!EXECUTE_SELECTORS.includes(lower(tx.data).slice(0, 10))) throw new UniswapError('transaction is not a Universal Router swap');
  if (BigInt(tx.value || '0x0') !== expect.fromAmount) throw new UniswapError('transaction value does not match the amount');
}

export async function getUniswapQuote(
  p: { chainId: number; toToken: string; fromAmount: bigint; swapper: string; slippageBps: number; fromToken?: string },
  fetchImpl: Fetch = fetch,
): Promise<UniswapQuote> {
  const body = await post<{ routing?: string; quote?: UniswapRawQuote }>('/quote', {
    type: 'EXACT_INPUT', amount: p.fromAmount.toString(), tokenInChainId: p.chainId, tokenOutChainId: p.chainId,
    tokenIn: p.fromToken ?? UNISWAP_NATIVE, tokenOut: p.toToken, swapper: p.swapper,
    slippageTolerance: p.slippageBps / 100, protocols: ['V2', 'V3', 'V4'], routingPreference: 'BEST_PRICE', permitAmount: 'EXACT',
  }, fetchImpl);
  return parseUniswapQuote(body);
}

/** Turns a checked CLASSIC quote into the unsigned transaction (`/swap`); the caller checks it again before use. */
export async function buildUniswapTx(q: UniswapQuote, fetchImpl: Fetch = fetch): Promise<UniswapTx> {
  const body = await post<{ swap?: { to?: string; data?: string; value?: string; gasLimit?: string; chainId?: number; from?: string } }>('/swap', { quote: q.raw }, fetchImpl);
  const s = body.swap;
  if (!s?.to || !s.data || s.data === '0x') throw new UniswapError('Uniswap returned no transaction');
  return { to: s.to, data: s.data, value: s.value ?? '0x0', gasLimit: s.gasLimit ?? null, chainId: Number(s.chainId), from: s.from ?? null };
}
