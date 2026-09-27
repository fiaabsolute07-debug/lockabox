/**
 * LI.FI quote API for EVM buys (DECISIONS #10). No API key; we never pass an integrator fee, and every fee LI.FI reports
 * (its own fixed 0.25 %, DEX protocol fees) is passed through to the quote the user sees. The transaction is built by LI.FI
 * and signed in the user's wallet; we only check it before handing it over.
 */

type Fetch = typeof fetch;
const BASE = 'https://li.quest/v1';
export const NATIVE = '0x0000000000000000000000000000000000000000';
export const MAX_LIFI_FEE_BPS = 25n;

export type LifiFee = { name: string; percentage: number | null; amountUsd: number | null; included: boolean };
export type LifiTx = { to: string; data: string; value: string; gasLimit: string | null; chainId: number; from: string | null };
export type LifiQuote = {
  tool: string; route: string[];
  /** Taken by LI.FI's fee-collection steps (labelled "Integrator Fee" in their API) before the swap, in the input coin. */
  feeCollected: bigint;
  fromToken: { address: string; symbol: string; decimals: number };
  toToken: { address: string; symbol: string; decimals: number };
  fromAmount: string; toAmount: string; toAmountMin: string; approvalAddress: string | null;
  fees: LifiFee[]; tx: LifiTx | null;
};

export class LifiError extends Error {}

type Raw = {
  tool?: string; toolDetails?: { name?: string };
  includedSteps?: { type?: string; tool?: string; toolDetails?: { name?: string }; action?: { fromAmount?: string }; estimate?: { toAmount?: string } }[];
  action?: { fromToken?: { address: string; symbol: string; decimals: number }; toToken?: { address: string; symbol: string; decimals: number }; fromAmount?: string };
  estimate?: { toAmount?: string; toAmountMin?: string; approvalAddress?: string; feeCosts?: { name?: string; percentage?: string; amountUSD?: string; included?: boolean }[] };
  transactionRequest?: { to?: string; data?: string; value?: string; gasLimit?: string; chainId?: number; from?: string };
  message?: string;
};

export function parseQuote(raw: Raw): LifiQuote {
  const a = raw.action, e = raw.estimate;
  if (!a?.fromToken || !a.toToken || !a.fromAmount || !e?.toAmount || !e.toAmountMin) throw new LifiError(raw.message ?? 'LI.FI returned no route');
  const tr = raw.transactionRequest;
  return {
    tool: raw.toolDetails?.name ?? raw.tool ?? 'LI.FI',
    route: (raw.includedSteps ?? []).filter((s) => s.type !== 'protocol').map((s) => s.toolDetails?.name).filter((x): x is string => !!x),
    feeCollected: (raw.includedSteps ?? []).filter((s) => s.tool === 'feeCollection')
      .reduce((sum, s) => sum + BigInt(s.action?.fromAmount ?? '0') - BigInt(s.estimate?.toAmount ?? s.action?.fromAmount ?? '0'), 0n),
    fromToken: a.fromToken, toToken: a.toToken, fromAmount: a.fromAmount, toAmount: e.toAmount, toAmountMin: e.toAmountMin,
    approvalAddress: e.approvalAddress ?? null,
    fees: (e.feeCosts ?? []).map((f) => ({ name: f.name ?? 'fee', percentage: f.percentage != null ? Number(f.percentage) : null, amountUsd: f.amountUSD != null ? Number(f.amountUSD) : null, included: f.included !== false })),
    tx: tr?.to && tr.data ? { to: tr.to, data: tr.data, value: tr.value ?? '0x0', gasLimit: tr.gasLimit ?? null, chainId: Number(tr.chainId), from: tr.from ?? null } : null,
  };
}

/**
 * Checks we run on every quote before a user signs anything:
 * right chain, right sender, value = amount for native input (0 otherwise), sent to LI.FI's own contract, no integrator fee.
 */
export function assertSafe(q: LifiQuote, expect: { chainId: number; from?: string; fromAmount: bigint; toToken: string }) {
  const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();
  if (lower(q.toToken.address) !== lower(expect.toToken)) throw new LifiError('route buys a different token');
  if (BigInt(q.fromAmount) !== expect.fromAmount) throw new LifiError('route spends a different amount');
  if (q.fees.some((f) => /integrator/i.test(f.name))) throw new LifiError('unexpected integrator fee in route');
  // LI.FI's own fixed fee is 0.25 %; anything more taken before the swap means someone added a fee.
  if (q.feeCollected * 10_000n > expect.fromAmount * MAX_LIFI_FEE_BPS) throw new LifiError('route takes more than LI.FI\'s fixed fee');
  if (!q.tx) return;
  if (q.tx.chainId !== expect.chainId) throw new LifiError('transaction is for another chain');
  if (expect.from && lower(q.tx.from) !== lower(expect.from)) throw new LifiError('transaction sender does not match your wallet');
  if (!q.approvalAddress || lower(q.tx.to) !== lower(q.approvalAddress)) throw new LifiError('transaction target is not the LI.FI contract');
  const value = BigInt(q.tx.value || '0x0');
  const native = lower(q.fromToken.address) === NATIVE;
  if (native ? value !== expect.fromAmount : value !== 0n) throw new LifiError('transaction value does not match the amount');
}

export async function getLifiQuote(
  p: { chainId: number; fromToken?: string; toToken: string; fromAmount: bigint; fromAddress: string; slippageBps: number },
  fetchImpl: Fetch = fetch,
): Promise<LifiQuote> {
  const qs = new URLSearchParams({
    fromChain: String(p.chainId), toChain: String(p.chainId), fromToken: p.fromToken ?? NATIVE, toToken: p.toToken,
    fromAmount: p.fromAmount.toString(), fromAddress: p.fromAddress, slippage: String(p.slippageBps / 10_000), integrator: 'lockabox',
  });
  const res = await fetchImpl(`${BASE}/quote?${qs}`, { signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok) throw new LifiError(body.message ?? `LI.FI quote failed (${res.status})`);
  return parseQuote(body);
}

/** ERC-20 `approve(spender, amount)` calldata, exact amount only (LAB §3c: never unlimited approvals). */
export function approveCalldata(spender: string, amount: bigint) {
  const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  return `0x095ea7b3${pad(spender)}${pad(amount.toString(16))}`;
}

/** Current ERC-20 allowance via `eth_call allowance(owner, spender)`. */
export async function allowance(rpcUrl: string, token: string, owner: string, spender: string, fetchImpl: Fetch = fetch): Promise<bigint> {
  const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
  const res = await fetchImpl(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data: `0xdd62ed3e${pad(owner)}${pad(spender)}` }, 'latest'] }) });
  const body = (await res.json()) as { result?: string };
  return body.result && body.result !== '0x' ? BigInt(body.result) : 0n;
}
