import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { sql } from '@/lib/db';
import { evmSellGate, SellCheckUnavailable } from '@/modules/gates/evm';
import { eligibleItems, getCase } from '@/modules/cases/pools';
import { build, confirmSubmitted, markSubmitted, quote, tradeStatus } from '@/modules/swap/service';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;
const fx = (p: string) => JSON.parse(readFileSync(`tests/fixtures/${p}`, 'utf8'));
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const WALLET = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const TOKEN = '0x07b3D902783c3C12b077508c3B5c00113d1291D0'; // the coin in the recorded Base quote
const ROUTER_BASE = '0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40';

async function reset() {
  await sql.unsafe(`truncate trades, rolls, case_pools, gate_results, moderation, sell_check_skips, asset_snapshots, assets restart identity cascade`);
  await sql`update chains set swap_provider = 'uniswap', swap_enabled = true where id in ('base', 'robinhood')`;
}

async function asset(chain: string, address: string, symbol: string) {
  const [a] = await sql<{ id: number }[]>`insert into assets (chain_id, address, symbol, sources) values (${chain}, ${address}, ${symbol}, ${['ds:boost']}) returning id`;
  await sql`insert into asset_snapshots (asset_id, taken_at, price_usd, market_cap, liquidity_usd) values (${a.id}, now(), 0.01, 5000000, 2000000)`;
  await sql`insert into gate_results (asset_id, gate, passed, reason) values (${a.id}, 'liquidity', true, 'ok')`;
  return Number(a.id);
}

/**
 * A fake network: honeypot.is, the Uniswap API (recorded Base responses, re-addressed to whoever asks, as the real API does)
 * and the chain RPC. `tamper` edits the /swap transaction to prove the guards catch it.
 */
function network(opts: { receipt?: string | null; noRoute?: boolean; tamper?: (swap: Record<string, string>) => void } = {}) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith('https://api.honeypot.is/')) return respond(fx('honeypot/base-bnkr.json'));
    if (url.startsWith('https://trade-api.gateway.uniswap.org/v1/quote')) {
      if (opts.noRoute) return respond({ errorCode: 'NoRouteFoundError', detail: 'No route with sufficient liquidity was found for this pair.' }, 404);
      const req = JSON.parse(String(init?.body)) as { swapper: string };
      const body = structuredClone(fx('uniswap/quote-base-native.json'));
      body.quote.swapper = req.swapper; body.quote.output.recipient = req.swapper;
      for (const o of body.quote.aggregatedOutputs) o.recipient = req.swapper;
      return respond(body);
    }
    if (url.startsWith('https://trade-api.gateway.uniswap.org/v1/swap')) {
      const req = JSON.parse(String(init?.body)) as { quote: { swapper: string } };
      const body = structuredClone(fx('uniswap/swap-base-native.json'));
      body.swap.from = req.quote.swapper;
      opts.tamper?.(body.swap);
      return respond(body);
    }
    const rpc = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    if (rpc.method === 'eth_getTransactionReceipt') return respond({ jsonrpc: '2.0', id: 1, result: opts.receipt ? { status: opts.receipt } : null });
    return respond({}, 404);
  }) as typeof fetch;
  return { f, calls };
}

run('EVM swap via the Uniswap API (DECISIONS #21)', () => {
  beforeEach(async () => { vi.stubEnv('UNISWAP_API_KEY', 'test-key'); await reset(); });
  afterAll(async () => { vi.unstubAllEnvs(); await sql.end(); });

  it('the migration routes Uniswap chains through Uniswap with swap on, keeps Arc on LI.FI (off), Solana on Jupiter', async () => {
    const rows = await sql<{ id: string; swap_provider: string | null; swap_enabled: boolean; rpc: boolean }[]>`
      select id, swap_provider, swap_enabled, rpc_url is not null as rpc from chains where id in ('base', 'ethereum', 'robinhood', 'arbitrum', 'polygon', 'arc', 'solana')`;
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    for (const id of ['base', 'ethereum', 'robinhood', 'arbitrum', 'polygon']) expect(by[id]).toMatchObject({ swap_provider: 'uniswap', swap_enabled: true, rpc: true });
    expect(by.arc).toMatchObject({ swap_provider: 'lifi', swap_enabled: false });
    expect(by.solana.swap_provider).toBe('jupiter');
    await expect(sql`update chains set swap_provider = null where id = 'base'`).rejects.toThrow(/chains_swap_needs_provider/);
  });

  it('Base: sell check, quote via Uniswap pools, an unsigned tx to the Universal Router, then submit and confirm', async () => {
    const id = await asset('base', TOKEN, 'XDP');
    const net = network({ receipt: '0x1' });
    const q = await quote({ assetId: id, amount: '0.01' }, sql, net.f);
    expect(q).toMatchObject({ provider: 'uniswap', inputSymbol: 'ETH', lockaboxFee: 0, sellCheck: 'passed', route: ['Uniswap v3 0.05%', 'Uniswap v3 0.01%'] });
    const built = await build({ assetId: id, amount: '0.01', wallet: WALLET }, sql, net.f);
    expect(built.evm).toMatchObject({ chainId: 8453, approval: null, transaction: { to: ROUTER_BASE, value: '0x2386f26fc10000', chainId: 8453 } });
    const [trade] = await sql<{ quote: { provider: string }; input_symbol: string; wallet: string }[]>`select quote, input_symbol, wallet from trades where id = ${built.tradeId}`;
    expect(trade).toMatchObject({ input_symbol: 'ETH', wallet: WALLET.toLowerCase(), quote: { provider: 'uniswap' } });
    expect(net.calls.filter((u) => u.includes('uniswap.org')).map((u) => u.split('/v1/')[1])).toEqual(['quote', 'quote', 'swap']);
    expect(await markSubmitted(built.tradeId, `0x${'ab'.repeat(32)}`, WALLET, sql)).toBe(true);
    await confirmSubmitted(sql, net.f);
    expect((await tradeStatus(built.tradeId, sql))?.status).toBe('confirmed');
  });

  it('refuses a transaction that does not go to the Universal Router, and records no trade', async () => {
    const id = await asset('base', TOKEN, 'XDP');
    const net = network({ tamper: (swap) => { swap.to = '0x1111111111111111111111111111111111111111'; } });
    await expect(build({ assetId: id, amount: '0.01', wallet: WALLET }, sql, net.f)).rejects.toMatchObject({ code: 'quote_failed' });
    expect((await sql`select count(*)::int n from trades`)[0].n).toBe(0);
  });

  it('a coin Uniswap has no pool for falls back to "Buy on DEX"', async () => {
    const id = await asset('base', TOKEN, 'XDP');
    await expect(quote({ assetId: id, amount: '0.01' }, sql, network({ noRoute: true }).f)).rejects.toMatchObject({ code: 'swap_disabled' });
  });

  it('chains honeypot.is does not cover use a Uniswap buy → sell round trip for the sell check', async () => {
    const buy = fx('uniswap/quote-base-native.json'); const sell = fx('uniswap/quote-base-sell.json');
    const bodies = [buy, sell];
    const f = (async () => respond(bodies.shift())) as unknown as typeof fetch;
    const out = await evmSellGate(4663, TOKEN, 10n ** 16n, f, 'uniswap');
    expect(out.passed).toBe(true);
    expect(out.reason).toMatch(/^Uniswap round trip keeps 9\d\.\d%$/);
  });

  it('no Uniswap path to buy through is no verdict: the coin is not killed, is parked, and the buy box offers "Buy on DEX"', async () => {
    const noRoute = () => respond({ errorCode: 'NoRouteFoundError', detail: 'No route with sufficient liquidity was found for this pair.' }, 404);
    await expect(evmSellGate(4663, TOKEN, 10n ** 16n, (async () => noRoute()) as unknown as typeof fetch, 'uniswap')).rejects.toBeInstanceOf(SellCheckUnavailable);
    const timeout = () => respond({ errorCode: 'UpstreamTimeoutError', detail: 'A routing dependency timed out' }, 404);
    await expect(evmSellGate(4663, TOKEN, 10n ** 16n, (async () => timeout()) as unknown as typeof fetch, 'uniswap')).rejects.toBeInstanceOf(SellCheckUnavailable);
    // Base: honeypot.is does not know Uniswap v4 pools ("no pair found"), so the round trip runs, and finds no path.
    await sql`update chains set swap_enabled = true where id = 'robinhood'`;
    const id = await asset('robinhood', TOKEN, 'XDP');
    await expect(quote({ assetId: id, amount: '0.01' }, sql, (async () => noRoute()) as unknown as typeof fetch)).rejects.toMatchObject({ code: 'swap_disabled' });
    expect((await sql`select count(*)::int n from moderation`)[0].n).toBe(0);
    expect((await sql`select reason from sell_check_skips where asset_id = ${id}`)[0].reason).toMatch(/^Uniswap: No route/);
    const base = await asset('base', '0x0000000000000000000000000000000000000abc', 'V4COIN');
    const hp404 = (async (input: RequestInfo | URL) => String(input).startsWith('https://api.honeypot.is/') ? respond({ error: 'no pair' }, 404) : noRoute()) as unknown as typeof fetch;
    await expect(quote({ assetId: base, amount: '0.01' }, sql, hp404)).rejects.toMatchObject({ code: 'swap_disabled' });
    expect((await sql`select count(*)::int n from moderation`)[0].n).toBe(0);
  });

  it('a Uniswap timeout is retried once, then asks the buyer to try again: the coin is neither parked nor switched to "Buy on DEX"', async () => {
    let calls = 0;
    const timeout = (async () => { calls++; return respond({ errorCode: 'UpstreamTimeoutError', detail: 'A routing dependency timed out' }, 404); }) as unknown as typeof fetch;
    await expect(evmSellGate(4663, TOKEN, 10n ** 16n, timeout, 'uniswap')).rejects.toMatchObject({ retryable: true });
    expect(calls).toBe(2);
    const id = await asset('robinhood', TOKEN, 'XDP');
    await expect(quote({ assetId: id, amount: '0.01' }, sql, timeout)).rejects.toMatchObject({ code: 'quote_failed' });
    expect((await sql`select count(*)::int n from sell_check_skips`)[0].n).toBe(0);
    expect((await sql`select count(*)::int n from moderation`)[0].n).toBe(0);
  });

  it('buyable through Uniswap but no way to sell back there fails the sell check', async () => {
    const bodies = [respond(fx('uniswap/quote-base-native.json')), respond({ errorCode: 'NoRouteFoundError', detail: 'No route' }, 404)];
    const out = await evmSellGate(4663, TOKEN, 10n ** 16n, (async () => bodies.shift()!) as unknown as typeof fetch, 'uniswap');
    expect(out).toMatchObject({ passed: false });
    expect(out.reason).toMatch(/cannot sell back/);
  });

  it('EVM with swap on: unchecked coins stay in cases, a failed sell check drops them; Solana still needs a pass', async () => {
    const base = await asset('base', TOKEN, 'XDP');
    const sol = await asset('solana', 'So1anaMint111111111111111111111111111111111', 'SOLX');
    await sql`update chains set swap_enabled = true where id = 'solana'`;
    const discover = (await getCase('discover'))!;
    let ids = (await eligibleItems(discover, 'all', sql, [])).map((i) => i.a);
    expect(ids).toContain(base);
    expect(ids).not.toContain(sol);
    await sql`insert into gate_results (asset_id, gate, passed, reason) values (${base}, 'honeypot', false, 'test'), (${sol}, 'honeypot', true, 'test')`;
    ids = (await eligibleItems(discover, 'all', sql, [])).map((i) => i.a);
    expect(ids).not.toContain(base);
    expect(ids).toContain(sol);
  });
});
