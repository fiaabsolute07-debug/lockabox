import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkCampaignTxs, sponsorConfig, tokenReceived, USDC_MINT } from '@/modules/sponsors/verify';

// A real mainnet USDC transfer (recorded 2026-09-27): dyMyXM2E… received 33.022469 USDC.
const tx = readFileSync('tests/fixtures/solana-usdc-transfer.json', 'utf8');
const SIG = '3sWZkDS8qkAXhmstffaxYgNjeVyLUZyJEmqfvLpLcbGjzUXbDGeLhQ2pzMCdYDoQ8RwtajknYwhtrLhgHX4SfQgQ';
const TO = 'dyMyXM2EfVfMZWHBKfwrybSiPMsRLmas4ycrMRJDCg7';
const rpc = (body: string) => (async () => new Response(body)) as typeof fetch;

describe('sponsor transaction checks (AC-063/067)', () => {
  it('reads what a wallet received from token-balance deltas', async () => {
    expect(await tokenReceived(SIG, { mint: USDC_MINT, to: TO }, 'http://rpc', rpc(tx))).toMatchObject({ ok: true, received: 33_022_469n });
    expect(await tokenReceived(SIG, { mint: USDC_MINT, to: 'SomeoneElse1111111111111111111111111111111' }, 'http://rpc', rpc(tx))).toMatchObject({ ok: false });
    expect(await tokenReceived('not-a-signature', { mint: USDC_MINT, to: TO }, 'http://rpc', rpc(tx))).toMatchObject({ ok: false });
    expect(await tokenReceived(SIG, { mint: USDC_MINT, to: TO }, 'http://rpc', rpc('{"result":null}'))).toMatchObject({ ok: false, reason: /not found/ });
    const failed = JSON.parse(tx); failed.result.meta.err = { InstructionError: [0, 'Custom'] };
    expect(await tokenReceived(SIG, { mint: USDC_MINT, to: TO }, 'http://rpc', rpc(JSON.stringify(failed)))).toMatchObject({ ok: false, reason: /failed/ });
  });

  it('approves only when the fee reached the treasury and the full budget reached the vault', async () => {
    const cfg = { treasury: TO, vault: TO, feeUsdcRaw: 30_000_000n, rpcUrl: 'http://rpc' };
    const c = { fee_tx_hash: SIG, deposit_tx_hash: SIG, token_mint: USDC_MINT, amount_per_open: '1000000', total_opens: 30 };
    expect(await checkCampaignTxs(c, cfg, rpc(tx))).toEqual({ feeOk: true, depositOk: true, reasons: [] });
    const short = await checkCampaignTxs({ ...c, total_opens: 40 }, { ...cfg, feeUsdcRaw: 40_000_000n }, rpc(tx));
    expect(short.feeOk).toBe(false);
    expect(short.depositOk).toBe(false);
    expect(short.reasons.join(' ')).toMatch(/fee 33022469 < 40000000/);
  });

  it('config comes from env and is required', () => {
    expect(sponsorConfig({})).toBeNull();
    expect(sponsorConfig({ SPONSOR_TREASURY: 'T', SPONSOR_VAULT: 'V', SPONSOR_FEE_USDC: '499.5' })).toMatchObject({ feeUsdcRaw: 499_500_000n });
  });
});
