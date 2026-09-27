import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';

// Acceptance cases closed in the 2026-09-27 cloud session: AC-034 (disclaimers), AC-040 (no swap without a click),
// AC-044 (slippage 3 % default, confirm above 10 %, max 49 %), AC-042 (trade status with explorer link).
const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const caseSummary = require('./fixtures/case.json');
const baseAsset = require('./fixtures/asset.json');
const roll = require('./fixtures/roll.json');

const solanaCoin = { ...baseAsset, swapEnabled: true };
const jupiterQuote = { assetId: 3, symbol: 'GLORP', inputSymbol: 'SOL', inputAmount: '0.05', outAmount: '5471930000', outAmountMin: '5307772100', decimals: 6,
  priceImpactPct: 0.1, slippageBps: 300, route: ['Raydium CLMM'], provider: 'jupiter', routeFees: [], lockaboxFee: 0, sellCheck: 'passed' };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function setup(page: Page) {
  const state = { quotes: [] as { slippageBps?: number }[], builds: 0 };
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, meta);
    if (url.pathname === '/api/feed') return json(route, feed);
    if (url.pathname === '/api/auth/me') return json(route, { user: null });
    if (url.pathname === '/api/sponsored/live') return json(route, { label: 'Sponsored', items: [] });
    if (url.pathname === '/api/cases/trending') return json(route, caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, solanaCoin);
    if (url.pathname === '/api/assets/3/buys') return json(route, { items: [] });
    if (url.pathname === '/api/rolls' && request.method() === 'POST') return json(route, { ...roll, asset: solanaCoin }, 201);
    if (url.pathname === '/api/swap/quote') { const body = request.postDataJSON(); state.quotes.push(body); return json(route, { ...jupiterQuote, slippageBps: body.slippageBps }); }
    if (url.pathname === '/api/swap/build') { state.builds++; return json(route, { error: { code: 'quote_failed', message: 'not in this test' } }, 502); }
    return json(route, {});
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: /OPEN CASE/ }).click();
  await expect(page.locator('.swap-card')).toBeVisible();
  return state;
}

test('AC-034: the disclaimer is on the roll screen and in the swap box', async ({ page }) => {
  await setup(page);
  await expect(page.locator('footer')).toContainText('Random pick, not investment advice. Memecoins can go to zero.');
  await expect(page.locator('.swap-card .disclaimer')).toContainText('Random pick, not advice. Memecoins can go to zero.');
  await expect(page.locator('.swap-card .disclaimer')).toContainText('Lockabox never holds your funds');
});

test('AC-040: rolling and quoting never build a swap; the Buy click without a wallet only opens the wallet picker', async ({ page }) => {
  const state = await setup(page);
  await expect.poll(() => state.quotes.length).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  expect(state.builds).toBe(0);
  await page.locator('.swap-card').getByRole('button', { name: 'Connect wallet to buy' }).click();
  await expect(page.locator('.wallet-adapter-modal')).toBeVisible();
  expect(state.builds).toBe(0);
});

test('AC-044: slippage defaults to 3 %, needs a confirmation above 10 % and stops at 49 %', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('spinbutton', { name: 'Slippage' })).toHaveValue('3');
  await expect.poll(() => state.quotes.at(-1)?.slippageBps).toBe(300);
  const buy = page.locator('.swap-card').getByRole('button', { name: 'Connect wallet to buy' });
  await expect(buy).toBeEnabled();
  await page.getByRole('spinbutton', { name: 'Slippage' }).fill('60');
  await expect(page.getByRole('spinbutton', { name: 'Slippage' })).toHaveValue('49');
  await expect.poll(() => state.quotes.at(-1)?.slippageBps).toBe(4900);
  const confirm = page.getByLabel('I understand higher slippage can change the result.');
  await expect(confirm).toBeVisible();
  await expect(buy).toBeDisabled();
  await confirm.check();
  await expect(buy).toBeEnabled();
  await page.getByRole('spinbutton', { name: 'Slippage' }).fill('10');
  await expect(confirm).toHaveCount(0);
});

test('every DEX Screener chain is listed with its self-hosted logo; chains with coins come first', async ({ page, request }) => {
  const chains = [
    { id: 'solana', name: 'Solana', family: 'solana', swapEnabled: true, poolSize: 51 },
    { id: 'monad', name: 'Monad', family: 'evm', swapEnabled: false, poolSize: 0 },
    { id: 'arbitrum', name: 'Arbitrum', family: 'evm', swapEnabled: false, poolSize: 24 },
    { id: 'blast', name: 'Blast', family: 'evm', swapEnabled: false, poolSize: 0 },
    { id: 'story', name: 'Story', family: 'evm', swapEnabled: false, poolSize: 0 },
  ];
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body: Record<string, unknown> = { '/api/meta': { ...meta, chains }, '/api/feed': feed, '/api/cases/trending': caseSummary, '/api/auth/me': { user: null }, '/api/sponsored/live': { label: 'Sponsored', items: [] } };
    return json(route, body[path] ?? {});
  });
  await page.goto('/');
  const rows = page.locator('.chain-list .chain-row');
  await expect(rows).toHaveText(['All chains', 'Solana51', 'Arbitrum24', 'Monad', 'Blast', 'SStory']); // "S" is the lettered badge of a chain without a logo
  await expect(rows.nth(2).locator('img')).toHaveAttribute('src', '/chains/arbitrum.png');
  await expect(rows.nth(3).locator('img')).toHaveAttribute('src', /\/chains\/monad\.(png|svg)$/);
  await expect(rows.nth(5).locator('.chain-letter')).toHaveText('S');
  for (const src of ['/chains/arbitrum.png', await rows.nth(3).locator('img').getAttribute('src'), '/chains/blast.png']) expect((await request.get(src!)).status()).toBe(200);
});
