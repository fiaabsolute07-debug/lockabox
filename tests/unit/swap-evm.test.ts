import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { honeypotIsGate, lifiRoundTripGate } from '@/modules/gates/evm';
import { approveCalldata, assertSafe, LifiError, parseQuote } from '@/modules/swap/lifi';
import { evmProbe, parseAmount } from '@/modules/swap/service';

// Recorded from li.quest / api.honeypot.is on 2026-09-27 (tests/fixtures/{lifi,honeypot}).
const fx = (p: string) => JSON.parse(readFileSync(`tests/fixtures/${p}`, 'utf8'));
const BNKR = '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b';
const DEAD = '0x000000000000000000000000000000000000dEaD';
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('LI.FI quote guards (DECISIONS #10)', () => {
  const base = parseQuote(fx('lifi/quote-base-native.json'));
  const ok = { chainId: 8453, from: DEAD, fromAmount: 10n ** 16n, toToken: BNKR };

  it('parses the route, fees and transaction', () => {
    expect(base.fromToken.symbol).toBe('ETH');
    expect(base.fees.map((f) => f.name)).toEqual(['LIFI Fixed Fee']);
    expect(base.fees[0].percentage).toBe(0.0025);
    expect(base.tx!.chainId).toBe(8453);
    expect(base.feeCollected).toBe(25n * 10n ** 12n); // 0.25 % of 0.01 ETH, LI.FI's own fee
    expect(base.route).toEqual(['Kyberswap']); // the fee-collection step isn't a route hop
    expect(() => assertSafe(base, ok)).not.toThrow();
  });

  it('rejects a route that differs from what the user asked for', () => {
    expect(() => assertSafe(base, { ...ok, chainId: 1 })).toThrow(LifiError);
    expect(() => assertSafe(base, { ...ok, from: '0x1111111111111111111111111111111111111111' })).toThrow(/sender/);
    expect(() => assertSafe(base, { ...ok, fromAmount: 10n ** 17n })).toThrow(/amount/);
    expect(() => assertSafe(base, { ...ok, toToken: DEAD })).toThrow(/different token/);
    expect(() => assertSafe({ ...base, tx: { ...base.tx!, value: '0x1' } }, ok)).toThrow(/value/);
    expect(() => assertSafe({ ...base, tx: { ...base.tx!, to: DEAD } }, ok)).toThrow(/LI.FI contract/);
    expect(() => assertSafe({ ...base, fees: [...base.fees, { name: 'Integrator Fee', percentage: 0.01, amountUsd: 1, included: true }] }, ok)).toThrow(/integrator/);
    expect(() => assertSafe({ ...base, feeCollected: 10n ** 14n }, ok)).toThrow(/fixed fee/); // 1 % taken before the swap
  });

  it('Arc pays in USDC (6 decimals): value 0, needs an exact-amount approval', () => {
    const arc = parseQuote(fx('lifi/quote-arc-usdc.json'));
    expect(arc.fromToken).toMatchObject({ symbol: 'USDC', decimals: 6 });
    expect(arc.tx!.value).toBe('0x0');
    expect(() => assertSafe(arc, { chainId: 5042, from: DEAD, fromAmount: 1_000_000n, toToken: arc.toToken.address })).not.toThrow();
    const data = approveCalldata(arc.approvalAddress!, 1_000_000n);
    expect(data).toHaveLength(2 + 8 + 64 + 64);
    expect(data.startsWith('0x095ea7b3')).toBe(true);
    expect(data.endsWith('f4240')).toBe(true); // 1 000 000, never unlimited
  });

  it('parses amounts in the chain coin, and sizes the probe', () => {
    expect(parseAmount('0.05', 18)).toBe(5n * 10n ** 16n);
    expect(parseAmount('2.5', 6)).toBe(2_500_000n);
    expect(() => parseAmount('0.0000001', 6)).toThrow();
    expect(evmProbe(18)).toBe(10n ** 16n);
    expect(evmProbe(6)).toBe(1_000_000n);
  });
});

describe('EVM sell check (hidden gate)', () => {
  it('honeypot.is: passes a normal token, fails honeypots, high tax and missing pairs', async () => {
    const good = fx('honeypot/base-bnkr.json');
    expect((await honeypotIsGate(8453, BNKR, (async () => respond(good)) as typeof fetch)).passed).toBe(true);
    const trap = { ...good, honeypotResult: { isHoneypot: true, honeypotReason: 'sell reverts' } };
    expect(await honeypotIsGate(8453, BNKR, (async () => respond(trap)) as typeof fetch)).toMatchObject({ passed: false });
    const taxed = { ...good, simulationResult: { buyTax: 0, sellTax: 60, transferTax: 0 } };
    expect(await honeypotIsGate(8453, BNKR, (async () => respond(taxed)) as typeof fetch)).toMatchObject({ passed: false });
    expect(await honeypotIsGate(8453, BNKR, (async () => respond({}, 404)) as typeof fetch)).toMatchObject({ passed: false });
    await expect(honeypotIsGate(8453, BNKR, (async () => respond({}, 503)) as typeof fetch)).rejects.toThrow(); // retried next cycle
  });

  it('LI.FI round trip on Robinhood: buy then quote selling back, keep ≥ 50 %', async () => {
    const buy = fx('lifi/quote-robinhood-buy.json'), sell = fx('lifi/quote-robinhood-sell.json');
    const seq = [buy, sell];
    const out = await lifiRoundTripGate(4663, buy.action.toToken.address, 10n ** 16n, (async () => respond(seq.shift())) as typeof fetch);
    expect(out.passed).toBe(true);
    expect(out.reason).toMatch(/98\.9%/);
    const dump = { ...sell, estimate: { ...sell.estimate, toAmount: '1000' } };
    const seq2 = [buy, dump];
    expect(await lifiRoundTripGate(4663, buy.action.toToken.address, 10n ** 16n, (async () => respond(seq2.shift())) as typeof fetch)).toMatchObject({ passed: false });
    expect(await lifiRoundTripGate(4663, BNKR, 10n ** 16n, (async () => respond({ message: 'No available quotes' }, 404)) as typeof fetch)).toMatchObject({ passed: false });
  });
});
