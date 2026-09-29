import { z } from 'zod';

/**
 * Jupiter (Solana) swap API, free tier at lite-api.jup.ag. LAB D5: platform fee is never set, so the quote the user
 * sees is Jupiter's quote. The server builds nothing it signs: `/swap` returns an unsigned transaction for the user's wallet.
 */
export const JUPITER_BASE = 'https://lite-api.jup.ag/swap/v1';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

const RoutePlan = z.object({ swapInfo: z.object({ label: z.string().nullish(), ammKey: z.string(), inputMint: z.string(), outputMint: z.string() }).passthrough(), percent: z.number().nullish() }).passthrough();
export const QuoteSchema = z.object({
  inputMint: z.string(), inAmount: z.string(), outputMint: z.string(), outAmount: z.string(), otherAmountThreshold: z.string(),
  swapMode: z.string(), slippageBps: z.number(), platformFee: z.unknown().nullable(), priceImpactPct: z.string(),
  routePlan: z.array(RoutePlan),
}).passthrough();
export type JupiterQuote = z.infer<typeof QuoteSchema>;

export class JupiterError extends Error {
  constructor(public code: string, message: string, public status?: number) { super(message); }
}

type Fetch = typeof globalThis.fetch;

/**
 * `legacy`: a legacy (non-versioned) transaction for wallets that can't sign v0 transactions over WalletConnect (OKX, Trust…).
 * Jupiter then only uses routes that fit without address lookup tables, so some coins have a worse route or none.
 */
export async function getQuote(p: { inputMint: string; outputMint: string; amount: string; slippageBps: number; legacy?: boolean }, fetchImpl: Fetch = fetch): Promise<JupiterQuote> {
  const qs = new URLSearchParams({ inputMint: p.inputMint, outputMint: p.outputMint, amount: p.amount, slippageBps: String(p.slippageBps), restrictIntermediateTokens: 'true', ...(p.legacy ? { asLegacyTransaction: 'true' } : {}) });
  const res = await fetchImpl(`${JUPITER_BASE}/quote?${qs}`, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body as { error?: string }).error) {
    const b = body as { error?: string; errorCode?: string };
    throw new JupiterError(b.errorCode ?? `HTTP_${res.status}`, b.error ?? `quote failed (${res.status})`, res.status);
  }
  const quote = QuoteSchema.parse(body);
  if (quote.platformFee) throw new JupiterError('UNEXPECTED_FEE', 'quote carries a platform fee; Lockabox never charges one');
  return quote;
}

/** Unsigned transaction (base64; versioned unless `legacy`) for the user's wallet to sign. No fee account is ever passed. */
export async function buildSwapTransaction(quote: JupiterQuote, userPublicKey: string, fetchImpl: Fetch = fetch, legacy = false): Promise<{ swapTransaction: string; lastValidBlockHeight: number | null }> {
  const res = await fetchImpl(`${JUPITER_BASE}/swap`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ quoteResponse: quote, userPublicKey, dynamicComputeUnitLimit: true, wrapAndUnwrapSol: true, prioritizationFeeLamports: 'auto', ...(legacy ? { asLegacyTransaction: true } : {}) }),
  });
  const body = (await res.json().catch(() => ({}))) as { swapTransaction?: string; lastValidBlockHeight?: number; error?: string };
  if (!res.ok || !body.swapTransaction) throw new JupiterError('SWAP_BUILD_FAILED', body.error ?? `swap build failed (${res.status})`, res.status);
  return { swapTransaction: body.swapTransaction, lastValidBlockHeight: body.lastValidBlockHeight ?? null };
}
