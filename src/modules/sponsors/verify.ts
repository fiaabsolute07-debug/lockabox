/**
 * On-chain checks for sponsored campaigns (AC-063, AC-067): before approval, the fee transaction must have paid the treasury
 * at least the sponsorship fee in USDC, and the deposit transaction must have put at least `amount_per_open × total_opens` of the
 * campaign token into the vault. Read-only (`getTransaction`); nothing is signed. Amounts come from the token-balance deltas
 * Solana records for the receiving owner, so any transfer instruction shape counts.
 */

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type TokenBalance = { owner?: string; mint: string; uiTokenAmount: { amount: string } };
type TxResult = { meta?: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null } | null;

export type Received = { ok: boolean; received: bigint; reason: string };

/** How much of `mint` the owner `to` gained in transaction `signature` (confirmed, not failed). */
export async function tokenReceived(signature: string, p: { mint: string; to: string }, rpcUrl: string, fetchImpl: typeof fetch = fetch): Promise<Received> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) return { ok: false, received: 0n, reason: 'not a Solana transaction signature' };
  const res = await fetchImpl(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] }) });
  const tx = ((await res.json()) as { result?: TxResult }).result;
  if (!tx?.meta) return { ok: false, received: 0n, reason: 'transaction not found or not confirmed yet' };
  if (tx.meta.err) return { ok: false, received: 0n, reason: 'transaction failed on-chain' };
  const sum = (list: TokenBalance[] = []) => list.filter((b) => b.owner === p.to && b.mint === p.mint).reduce((s, b) => s + BigInt(b.uiTokenAmount.amount), 0n);
  const received = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
  return received > 0n ? { ok: true, received, reason: `received ${received}` } : { ok: false, received: 0n, reason: 'nothing received by that wallet' };
}

export type SponsorConfig = { treasury: string; vault: string; feeUsdcRaw: bigint; rpcUrl: string };

/** From env: SPONSOR_TREASURY, SPONSOR_VAULT, SPONSOR_FEE_USDC (e.g. "500"). Null when not set up: approvals are then refused. */
export function sponsorConfig(env: NodeJS.ProcessEnv = process.env): SponsorConfig | null {
  const fee = env.SPONSOR_FEE_USDC ?? '';
  if (!env.SPONSOR_TREASURY || !env.SPONSOR_VAULT || !/^\d+(\.\d{1,6})?$/.test(fee)) return null;
  const [w, f = ''] = fee.split('.');
  return { treasury: env.SPONSOR_TREASURY, vault: env.SPONSOR_VAULT, feeUsdcRaw: BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0')),
    rpcUrl: env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com' };
}

export type CampaignTxCheck = { feeOk: boolean; depositOk: boolean; reasons: string[] };

export async function checkCampaignTxs(
  c: { fee_tx_hash: string; deposit_tx_hash: string; token_mint: string; amount_per_open: string; total_opens: number },
  cfg: SponsorConfig, fetchImpl: typeof fetch = fetch,
): Promise<CampaignTxCheck> {
  const fee = await tokenReceived(c.fee_tx_hash, { mint: USDC_MINT, to: cfg.treasury }, cfg.rpcUrl, fetchImpl);
  const need = BigInt(c.amount_per_open) * BigInt(c.total_opens);
  const dep = await tokenReceived(c.deposit_tx_hash, { mint: c.token_mint, to: cfg.vault }, cfg.rpcUrl, fetchImpl);
  const feeOk = fee.ok && fee.received >= cfg.feeUsdcRaw;
  const depositOk = dep.ok && dep.received >= need;
  const reasons = [];
  if (!feeOk) reasons.push(fee.ok ? `fee ${fee.received} < ${cfg.feeUsdcRaw} USDC units` : `fee: ${fee.reason}`);
  if (!depositOk) reasons.push(dep.ok ? `deposit ${dep.received} < ${need} token units` : `deposit: ${dep.reason}`);
  return { feeOk, depositOk, reasons };
}
