import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sql } from '@/lib/db';
import { build, confirmSubmitted, markSubmitted, quote, tradeStatus } from '@/modules/swap/service';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;
const fx = (p: string) => JSON.parse(readFileSync(`tests/fixtures/${p}`, 'utf8'));
const WALLET = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const BNKR = '0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b';
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function reset() {
  await sql.unsafe(`truncate trades, rolls, case_pools, gate_results, moderation, asset_snapshots, assets restart identity cascade`);
}

async function evmAsset(chain: string, address: string, symbol: string) {
  const [a] = await sql<{ id: number }[]>`insert into assets (chain_id, address, symbol, sources) values (${chain}, ${address}, ${symbol}, ${['ds:boost']}) returning id`;
  await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, liquidity_usd) values (${a.id}, now(), 0.01, 5000000, 2000000)`;
  await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok')`;
  return Number(a.id);
}

/** A fake network: honeypot.is, LI.FI (quote patched to the caller's wallet) and the chain RPC. */
function network(opts: { quote: Record<string, unknown>; sell?: Record<string, unknown>; receipt?: string | null; allowance?: string }) {
  const calls: string[] = [];
  const quotes = opts.sell ? [opts.quote, opts.sell] : [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url.split('?')[0]);
    if (url.startsWith('https://api.honeypot.is/')) return respond(fx('honeypot/base-bnkr.json'));
    if (url.startsWith('https://li.quest/v1/quote')) {
      const from = new URL(url).searchParams.get('fromAddress');
      const body = structuredClone(quotes.length ? quotes.shift()! : opts.quote) as { transactionRequest?: { from?: string } };
      if (body.transactionRequest) body.transactionRequest.from = from ?? undefined;
      return respond(body);
    }
    const rpc = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    if (rpc.method === 'eth_getTransactionReceipt') return respond({ jsonrpc: '2.0', id: 1, result: opts.receipt ? { status: opts.receipt } : null });
    if (rpc.method === 'eth_call') return respond({ jsonrpc: '2.0', id: 1, result: opts.allowance ?? '0x0' });
    return respond({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

run('EVM swap via LI.FI (AC-038, DECISIONS #10)', () => {
  beforeEach(reset);
  afterEach(async () => { await sql`update chains set swap_enabled = false where family = 'evm'`; });

  it('stays off until the owner enables the chain', async () => {
    const id = await evmAsset('base', BNKR, 'BNKR');
    await expect(quote({ assetId: id, amount: '0.01' }, sql, network({ quote: fx('lifi/quote-base-native.json') }).f)).rejects.toMatchObject({ code: 'swap_disabled' });
  });

  it('Base: sell check, quote with route fees shown, unsigned tx for the wallet, then submit and confirm on-chain', async () => {
    await sql`update chains set swap_enabled = true where id = 'base'`;
    const id = await evmAsset('base', BNKR, 'BNKR');
    const net = network({ quote: fx('lifi/quote-base-native.json'), receipt: '0x1' });
    const q = await quote({ assetId: id, amount: '0.01' }, sql, net.f);
    expect(q).toMatchObject({ provider: 'lifi', inputSymbol: 'ETH', lockaboxFee: 0, sellCheck: 'passed' });
    expect(q.routeFees).toEqual([expect.objectContaining({ name: 'LIFI Fixed Fee', percentage: 0.0025 })]);
    expect(net.calls).toContain('https://api.honeypot.is/v2/IsHoneypot');
    const b = await build({ assetId: id, amount: '0.01', wallet: WALLET }, sql, net.f) as { tradeId: number; evm: { approval: unknown; transaction: { chainId: number; value: string } } };
    expect(b.evm.approval).toBeNull(); // native ETH, nothing to approve
    expect(b.evm.transaction).toMatchObject({ chainId: 8453, value: '0x2386f26fc10000' });
    const hash = `0x${'ab'.repeat(32)}`;
    await expect(markSubmitted(b.tradeId, 'not-a-hash', WALLET)).rejects.toMatchObject({ code: 'bad_amount' });
    expect(await tradeStatus(b.tradeId)).toEqual({ id: b.tradeId, status: 'built', txHash: null, chainId: 'base' });
    expect(await markSubmitted(b.tradeId, hash, WALLET)).toBe(true); // wallet case doesn't matter on EVM
    expect((await tradeStatus(b.tradeId))!.status).toBe('submitted');
    expect(await confirmSubmitted(sql, net.f)).toBe(1);
    expect(await tradeStatus(b.tradeId)).toEqual({ id: b.tradeId, status: 'confirmed', txHash: hash, chainId: 'base' }); // AC-042
    const [t] = await sql<{ status: string; wallet: string; input_symbol: string }[]>`select status, wallet, input_symbol from trades where id = ${b.tradeId}`;
    expect(t).toEqual({ status: 'confirmed', wallet: WALLET.toLowerCase(), input_symbol: 'ETH' });
  });

  it('a chain offers swap only when enabled and its EVM route is configured (AC-071)', async () => {
    await expect(sql`update chains set swap_enabled = true, enabled = false where id = 'arc'`).rejects.toThrow(/chains_swap_needs_enabled/);
    await expect(sql`update chains set swap_enabled = true, rpc_url = null where id = 'arc'`).rejects.toThrow(/chains_swap_needs_route/);
    await expect(sql`update chains set swap_enabled = true, evm_chain_id = null where id = 'robinhood'`).rejects.toThrow(/chains_swap_needs_route/);
    await sql`update chains set swap_enabled = true where id = 'arc'`; // configured: allowed (the owner's switch)
    await sql`update chains set swap_enabled = false where id = 'arc'`;
  });

  it('refuses a route built for someone else', async () => {
    await sql`update chains set swap_enabled = true where id = 'base'`;
    const id = await evmAsset('base', BNKR, 'BNKR');
    const f = (async (input: RequestInfo | URL) => String(input).startsWith('https://api.honeypot.is/')
      ? respond(fx('honeypot/base-bnkr.json')) : respond(fx('lifi/quote-base-native.json'))) as typeof fetch; // tx.from stays 0x…dEaD
    await expect(build({ assetId: id, amount: '0.01', wallet: WALLET }, sql, f)).rejects.toMatchObject({ code: 'quote_failed' });
  });

  it('Arc: LI.FI round-trip sell check, USDC input needs an exact-amount approval first', async () => {
    await sql`update chains set swap_enabled = true where id = 'arc'`;
    const arcQuote = fx('lifi/quote-arc-usdc.json');
    const id = await evmAsset('arc', arcQuote.action.toToken.address, 'ARCT');
    // Round trip: buy quote, then a sell quote returning 0.99 USDC for the 1 USDC probe.
    const sell = structuredClone(arcQuote);
    sell.action.fromToken = arcQuote.action.toToken; sell.action.toToken = arcQuote.action.fromToken;
    sell.action.fromAmount = arcQuote.estimate.toAmountMin; sell.estimate.toAmount = '990000';
    const net = network({ quote: arcQuote, sell, allowance: '0x0' });
    const b = await build({ assetId: id, amount: '1', wallet: WALLET }, sql, net.f) as { evm: { approval: { to: string; data: string } | null; transaction: { value: string } } };
    expect(net.calls.filter((c) => c === 'https://li.quest/v1/quote')).toHaveLength(3); // buy + sell probe, then the real quote
    expect(b.evm.approval!.to.toLowerCase()).toBe(arcQuote.action.fromToken.address.toLowerCase());
    expect(b.evm.approval!.data.endsWith('f4240')).toBe(true); // exactly 1 USDC
    expect(b.evm.transaction.value).toBe('0x0');
    const enough = network({ quote: arcQuote, sell: structuredClone(sell), allowance: '0xf4240' });
    const b2 = await build({ assetId: id, amount: '1', wallet: WALLET }, sql, enough.f) as { evm: { approval: unknown } };
    expect(b2.evm.approval).toBeNull();
  });
});

afterAll(async () => { await sql.end(); });
