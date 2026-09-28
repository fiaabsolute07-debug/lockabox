import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const caseSummary = require('./fixtures/case.json');
const baseAsset = require('./fixtures/asset.json');
const roll = require('./fixtures/roll.json');

const ADDRESS = '0xabc0000000000000000000000000000000c0ffee';
const TOKEN = 'fixture-admin-token-0123456789';
const LIFI_DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const evmMeta = {
  ...meta,
  chains: [
    { id: 'solana', name: 'Solana', family: 'solana', swapEnabled: true, evmChainId: null, nativeSymbol: 'SOL', explorerTxUrl: 'https://solscan.io/tx/{tx}' },
    { id: 'base', name: 'Base', family: 'evm', swapEnabled: true, evmChainId: 8453, nativeSymbol: 'ETH', explorerTxUrl: 'https://basescan.org/tx/{tx}' },
  ],
};
const baseCoin = { ...baseAsset, chainId: 'base', address: '0x00000000000000000000000000000000000b0a57', swapEnabled: true };
const lifiQuote = {
  assetId: 3, symbol: 'GLORP', inputSymbol: 'ETH', inputAmount: '0.005', outAmount: '123000000000000000000', outAmountMin: '119310000000000000000',
  decimals: 18, priceImpactPct: null, slippageBps: 300, route: ['Kyberswap'], provider: 'lifi',
  routeFees: [{ name: 'LIFI Fixed Fee', percentage: 0.0025, amountUsd: 0.0674 }], lockaboxFee: 0, sellCheck: 'passed',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type WalletCall = { method: string; params?: unknown[] };

/** An injected EIP-1193 wallet announced through EIP-6963. It records every request; nothing touches a real chain. */
async function mockWallet(page: Page, options: { chainId?: number; rejectSign?: boolean; address?: string; realSign?: boolean } = {}) {
  await page.addInitScript(({ address, chainId, rejectSign, realSign }) => {
    const state = { calls: [] as { method: string; params?: unknown[] }[], chainId, sent: 0 };
    (window as unknown as { __wallet: typeof state }).__wallet = state;
    const listeners: Record<string, ((value: unknown) => void)[]> = {};
    (window as unknown as { __changeWallet: (address: string) => void }).__changeWallet = (next) => {
      for (const listener of listeners.accountsChanged ?? []) listener([next]);
    };
    const provider = {
      async request({ method, params }: { method: string; params?: unknown[] }) {
        state.calls.push({ method, params });
        switch (method) {
          case 'eth_requestAccounts': case 'eth_accounts': return [address];
          case 'eth_chainId': return `0x${state.chainId.toString(16)}`;
          case 'wallet_switchEthereumChain': {
            state.chainId = parseInt((params![0] as { chainId: string }).chainId, 16);
            for (const listener of listeners.chainChanged ?? []) listener(`0x${state.chainId.toString(16)}`);
            return null;
          }
          case 'personal_sign':
            if (rejectSign) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            // realSign: the test process signs with a throwaway key (exposed function); otherwise a canned signature.
            if (realSign) return (window as unknown as { __labSign: (hex: string) => Promise<string> }).__labSign((params as string[])[0]);
            return `0x${'ab'.repeat(65)}`;
          case 'eth_sendTransaction': state.sent += 1; return `0x${state.sent.toString(16).padStart(64, '0')}`;
          case 'eth_getTransactionReceipt': return { status: '0x1', transactionHash: (params as string[])[0] };
          default: throw Object.assign(new Error(`unsupported ${method}`), { code: 4200 });
        }
      },
      on(event: string, listener: (value: unknown) => void) { (listeners[event] ??= []).push(listener); },
      removeListener(event: string, listener: (value: unknown) => void) { listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener); },
    };
    const info = { uuid: 'fixture-wallet', name: 'Fixture Wallet', icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'test.fixture.wallet' };
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  }, { address: options.address ?? ADDRESS, chainId: options.chainId ?? 8453, rejectSign: !!options.rejectSign, realSign: !!options.realSign });
}

const walletCalls = (page: Page) => page.evaluate(() => (window as unknown as { __wallet: { calls: WalletCall[] } }).__wallet.calls);

async function setup(page: Page, options: { asset?: unknown } = {}) {
  const state = { statusPolls: 0, signedIn: false, nonceBody: null as unknown, verifyBody: null as unknown, buildBody: null as unknown, patch: null as { url: string; body: unknown } | null };
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, evmMeta);
    if (url.pathname === '/api/feed') return json(route, feed);
    if (url.pathname === '/api/auth/me') return json(route, state.signedIn ? { user: { id: 'evm-user', clientSeed: 'c', nonce: 1, points: 0, inviteCode: 'abcdef1234', hideFromBoard: false, wallets: [{ family: 'evm', address: ADDRESS }] } } : { user: null });
    if (url.pathname === '/api/auth/nonce') { state.nonceBody = request.postDataJSON(); return json(route, { nonce: 'fixturenonce', issuedAt: '2026-09-27T00:00:00.000Z', message: 'lockabox.fun wants you to sign in with your Ethereum account:\nfixture' }); }
    if (url.pathname === '/api/auth/verify') { state.verifyBody = request.postDataJSON(); state.signedIn = true; return json(route, { userId: 'evm-user' }); }
    if (url.pathname === '/api/auth/logout') { state.signedIn = false; return json(route, { ok: true }); }
    if (url.pathname === '/api/sponsored/live') return json(route, { label: 'Sponsored', items: [] });
    if (url.pathname === '/api/cases/trending') return json(route, caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, options.asset ?? baseAsset);
    if (url.pathname === '/api/assets/3/buys') return json(route, { items: [] });
    if (url.pathname === '/api/rolls' && request.method() === 'POST') return json(route, { ...roll, asset: options.asset ?? roll.asset }, 201);
    if (url.pathname === '/api/swap/quote') return json(route, lifiQuote);
    if (url.pathname === '/api/swap/build') {
      state.buildBody = request.postDataJSON();
      return json(route, { tradeId: 77, quote: lifiQuote, evm: { chainId: 8453,
        approval: { to: USDC, data: '0x095ea7b3', value: '0x0', gasLimit: null, chainId: 8453 },
        transaction: { to: LIFI_DIAMOND, data: '0xabcdef', value: '0x11c37937e08000', gasLimit: '0x7a120', chainId: 8453 } } }, 201);
    }
    if (url.pathname === '/api/trades/77' && request.method() === 'GET') { state.statusPolls += 1; return json(route, { id: 77, status: state.statusPolls > 1 ? 'confirmed' : 'submitted', txHash: `0x${'2'.padStart(64, '0')}`, chainId: 'base' }); }
    if (url.pathname === '/api/trades/77' && request.method() === 'PATCH') { state.patch = { url: url.pathname, body: request.postDataJSON() }; return json(route, { ok: true, status: 'submitted' }); }
    return json(route, {});
  });
  return state;
}

test('EVM sign-in: EIP-6963 wallet, SIWE nonce/verify bodies, personal_sign of the exact message', async ({ page }) => {
  await mockWallet(page);
  const state = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.locator('w3m-modal')).toBeVisible();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Lockabox', exact: true })).toBeVisible();
  expect((await walletCalls(page)).filter(c => c.method === 'personal_sign')).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect(page.getByRole('button', { name: /0xab…ffee/ }).first()).toBeVisible();
  await expect.poll(() => state.verifyBody).not.toBeNull();
  expect(state.nonceBody).toEqual({ address: ADDRESS, family: 'evm', chainId: 8453 });
  expect(state.verifyBody).toEqual({ address: ADDRESS, nonce: 'fixturenonce', issuedAt: '2026-09-27T00:00:00.000Z', signature: `0x${'ab'.repeat(65)}`, family: 'evm', chainId: 8453 });
  const sign = (await walletCalls(page)).find((call) => call.method === 'personal_sign')!;
  const message = 'lockabox.fun wants you to sign in with your Ethereum account:\nfixture';
  expect(sign.params).toEqual([`0x${Buffer.from(message).toString('hex')}`, ADDRESS]);
  // Sign out works for EVM too.
  await page.getByRole('button', { name: /0xab…ffee/ }).first().click();
  await page.getByRole('button', { name: 'Sign out / Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Connect wallet' })).toBeVisible();
});

test('changing the connected account revokes the previous session', async ({ page }) => {
  await mockWallet(page);
  const state = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect.poll(() => state.signedIn).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __changeWallet: (address: string) => void }).__changeWallet('0x1111111111111111111111111111111111111111'));
  await expect.poll(() => state.signedIn).toBe(false);
  await expect(page.getByRole('button', { name: /Sign in · 0x11/ })).toBeVisible();
});

test('no extension offers WalletConnect in a dismissible mobile catalog', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await expect(page.locator('w3m-modal').getByText('WalletConnect', { exact: true })).toBeVisible();
  const bounds = await page.locator('w3m-modal wui-card').first().boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.locator('w3m-modal')).not.toHaveClass(/open/);
});

test('real SIWE round trip against the local API and database (throwaway key, no chain access)', async ({ page, request }) => {
  const live = await request.get('/api/meta').then((response) => response.ok()).catch(() => false);
  test.skip(!live, 'needs the local database: pnpm db:start && pnpm db:migrate');
  const account = privateKeyToAccount(generatePrivateKey());
  const address = account.address.toLowerCase();
  await page.exposeFunction('__labSign', (hex: string) => account.signMessage({ message: { raw: hex as `0x${string}` } }));
  await mockWallet(page, { address, realSign: true });
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  // Real routes: on a cold `next dev` the first nonce/verify/me requests compile on demand and can take several seconds.
  await expect(page.getByRole('button', { name: short, exact: true })).toBeVisible({ timeout: 20_000 });
  const me = await page.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  expect(me.user.wallets).toEqual([{ family: 'evm', address }]);
  // Signing in again with the same wallet lands on the same account (AC-004).
  await page.getByRole('button', { name: short, exact: true }).click();
  await page.getByRole('button', { name: 'Sign out / Disconnect' }).click();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect(page.getByRole('button', { name: short, exact: true })).toBeVisible();
  const again = await page.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  expect(again.user.id).toBe(me.user.id);
});

test('EVM sign-in from an unsupported network asks the wallet to switch to Base first', async ({ page }) => {
  await mockWallet(page, { chainId: 137 });
  const state = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect.poll(() => state.verifyBody).not.toBeNull();
  const methods = (await walletCalls(page)).map((call) => call.method);
  expect(methods.indexOf('wallet_switchEthereumChain')).toBeLessThan(methods.indexOf('personal_sign'));
  expect((await walletCalls(page)).filter((call) => call.method === 'wallet_switchEthereumChain').at(-1)!.params).toEqual([{ chainId: '0x2105' }]);
  expect(state.nonceBody).toMatchObject({ chainId: 8453 });
});

test('a rejected signature is handled quietly', async ({ page }) => {
  await mockWallet(page, { rejectSign: true });
  const state = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Sign in to Lockabox', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to Lockabox', exact: true })).toBeEnabled();
  await expect(page.locator('.header-error')).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Signature cancelled');
  expect(state.verifyBody).toBeNull();
});

test('EVM buy: route fees on their own lines, exact approval mined before the swap, then PATCH', async ({ page }) => {
  await mockWallet(page, { chainId: 1 });
  const state = await setup(page, { asset: baseCoin });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /OPEN CASE/ }).click();
  const box = page.locator('.evm-swap');
  await expect(box).toBeVisible();
  await expect(box.locator('.route-fee')).toContainText('LIFI Fixed Fee');
  await expect(box.locator('.route-fee')).toContainText('0.25 %');
  await expect(box.locator('.quote-details')).toContainText('Lockabox fee0');
  await expect(box.getByText('Routed by LI.FI, an independent non-custodial service; Lockabox adds no fee.', { exact: false })).toBeVisible();
  await expect(box.getByText('Kyberswap', { exact: false })).toBeVisible();
  // Rolling and quoting never send anything to the wallet (AC-040).
  expect((await walletCalls(page)).filter((call) => call.method === 'eth_sendTransaction')).toHaveLength(0);
  await box.getByRole('button', { name: 'Connect an EVM wallet to buy' }).click();
  await page.locator('w3m-modal').getByRole('button', { name: /Fixture Wallet/ }).click();
  await page.getByRole('button', { name: 'Continue without signing' }).click();
  await box.getByRole('button', { name: /Buy GLORP · review in wallet/ }).click();
  await expect(box.getByRole('status')).toContainText('Swap submitted');
  await expect(box.getByRole('link', { name: /View on explorer/ })).toHaveAttribute('href', `https://basescan.org/tx/0x${'2'.padStart(64, '0')}`);
  expect(state.buildBody).toEqual({ assetId: 3, amount: '0.005', slippageBps: 300, userAddress: ADDRESS, rollId: 42 });
  const calls = (await walletCalls(page)).filter((call) => ['wallet_switchEthereumChain', 'eth_sendTransaction', 'eth_getTransactionReceipt'].includes(call.method));
  expect(calls.filter(call => call.method !== 'wallet_switchEthereumChain').map(call => call.method)).toEqual(['eth_sendTransaction', 'eth_getTransactionReceipt', 'eth_sendTransaction']);
  expect(calls.filter(call => call.method === 'wallet_switchEthereumChain').at(-1)?.params).toEqual([{ chainId: '0x2105' }]);
  const [approval, swap] = calls.filter((call) => call.method === 'eth_sendTransaction').map((call) => call.params![0] as Record<string, string>);
  expect(approval).toMatchObject({ from: ADDRESS, to: USDC, data: '0x095ea7b3' });
  expect(swap).toMatchObject({ from: ADDRESS, to: LIFI_DIAMOND, data: '0xabcdef', value: '0x11c37937e08000', gas: '0x7a120' });
  expect(state.patch).toEqual({ url: '/api/trades/77', body: { txHash: `0x${'2'.padStart(64, '0')}`, wallet: ADDRESS } });
  // AC-042: the box follows the trade until the worker confirms it on-chain.
  await expect(box.getByRole('status')).toContainText('Buy confirmed on-chain ✓', { timeout: 15_000 });
  await expect(box.getByRole('link', { name: /View on explorer/ })).toHaveAttribute('href', `https://basescan.org/tx/0x${'2'.padStart(64, '0')}`);
});

test('an EVM coin on a chain with swap off keeps View on DEX only', async ({ page }) => {
  await mockWallet(page);
  await setup(page, { asset: { ...baseCoin, swapEnabled: false } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /OPEN CASE/ }).click();
  await expect(page.getByRole('link', { name: 'Buy on DEX Screener ↗' }).last()).toBeVisible();
  await expect(page.locator('.evm-swap')).toHaveCount(0);
});

test.describe('admin console', () => {
  const overview = {
    pendingCampaigns: [{ id: 5, project_name: 'Fixture Project', chain_id: 'solana', total_opens: 100, starts_at: '2026-10-01T00:00:00.000Z', ends_at: '2026-10-08T00:00:00.000Z', fee_tx_hash: 'FeeSig111', deposit_tx_hash: 'DepSig222', created_at: '2026-09-27T00:00:00.000Z' }],
    killed: [{ asset_id: 9, chain_id: 'solana', symbol: 'PEPE9', reason: 'rug', actor: 'owner', created_at: '2026-09-27T01:00:00.000Z' }],
    audit: [{ at: '2026-09-27T01:00:00.000Z', actor: 'owner', action: 'kill', target: '9', detail: { reason: 'rug' } }],
  };

  async function adminRoutes(page: Page) {
    const requests: { path: string; method: string; auth: string | null; actor: string | null; body: unknown }[] = [];
    await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === '/api/meta') return json(route, evmMeta);
      if (url.pathname === '/api/feed') return json(route, { items: [], stats: { rolls1h: 0, buysToday: 0, lastTopPullAt: null } });
      if (url.pathname === '/api/auth/me') return json(route, { user: null });
      if (!url.pathname.startsWith('/api/admin/')) return json(route, {});
      const headers = request.headers();
      requests.push({ path: url.pathname, method: request.method(), auth: headers.authorization ?? null, actor: headers['x-admin-actor'] ?? null, body: request.postDataJSON() });
      if (headers.authorization !== `Bearer ${TOKEN}`) return json(route, { error: { code: 'unauthorized', message: 'admin token required' } }, 401);
      if (url.pathname === '/api/admin/overview') return json(route, overview);
      if (url.pathname === '/api/admin/campaigns/5/review' && (request.postDataJSON() as { decision: string }).decision === 'approve') {
        return json(route, { error: { code: 'gates', message: 'fee payment not found on-chain for FeeSig111' } }, 409);
      }
      return json(route, { ok: true });
    });
    return requests;
  }

  test('401 without the right token, overview, and every action sends its body, token and actor', async ({ page }) => {
    const requests = await adminRoutes(page);
    await page.goto('/admin');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByLabel('Admin token').fill('wrong-token');
    await page.getByLabel('Your name (audit log)').fill('Owner Phi');
    await page.getByRole('button', { name: 'Open console' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Wrong token' })).toBeVisible();
    await page.getByLabel('Admin token').fill(TOKEN);
    await page.getByRole('button', { name: 'Open console' }).click();
    await expect(page.getByText('#5 · Fixture Project')).toBeVisible();
    await expect(page.getByText('PEPE9')).toBeVisible();
    await expect(page.locator('.admin-audit')).toContainText('kill');

    const campaign = page.locator('.admin-campaign');
    await expect(campaign.getByRole('button', { name: 'Approve' })).toBeDisabled(); // a note is required
    await campaign.getByLabel('Review note (required)').fill('fee checked');
    await campaign.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'gates: fee payment not found on-chain' })).toBeVisible();
    await campaign.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Campaign rejected.' })).toBeVisible();

    await page.getByLabel('Reason to restore asset 9').fill('false alarm');
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Coin restored' })).toBeVisible();

    const kill = page.getByRole('form', { name: 'Remove a coin now' });
    await kill.getByLabel('Asset id').fill('12');
    await kill.getByLabel('Reason').fill('rugged');
    await kill.getByRole('button', { name: 'Remove from every case' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Coin removed from every case' })).toBeVisible();

    const block = page.getByRole('form', { name: 'Symbol blocklist' });
    await block.getByLabel('Symbol').fill('USDT');
    await block.getByRole('button', { name: 'Remove' }).click();
    await block.getByLabel('Reason').fill('meme after all');
    await block.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Blocklist updated.' })).toBeVisible();

    const lock = page.getByRole('form', { name: 'Lock or unlock an account' });
    await lock.getByLabel('User id').fill('4b7f7c1e-1111-4222-8333-944445555666');
    await lock.getByLabel('Reason').fill('invite ring');
    await lock.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Account updated.' })).toBeVisible();

    const writes = requests.filter((request) => request.method === 'POST');
    expect(writes.map(({ path, body }) => ({ path, body }))).toEqual([
      { path: '/api/admin/campaigns/5/review', body: { decision: 'approve', note: 'fee checked' } },
      { path: '/api/admin/campaigns/5/review', body: { decision: 'reject', note: 'fee checked' } },
      { path: '/api/admin/unkill', body: { assetId: 9, reason: 'false alarm' } },
      { path: '/api/admin/kill', body: { assetId: 12, reason: 'rugged' } },
      { path: '/api/admin/blocklist', body: { symbol: 'USDT', op: 'remove', reason: 'meme after all' } },
      { path: '/api/admin/users/4b7f7c1e-1111-4222-8333-944445555666/lock', body: { lock: true, reason: 'invite ring' } },
    ]);
    for (const write of writes) expect(write).toMatchObject({ auth: `Bearer ${TOKEN}`, actor: 'Owner Phi' });
    // The token never reaches storage or the URL.
    const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage, ...window.sessionStorage }) + document.cookie + window.location.href);
    expect(stored).not.toContain(TOKEN);
  });
});
