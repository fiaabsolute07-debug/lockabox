import { expect, test, type Page, type Route } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const meta = require('./fixtures/meta.json');
const feed = require('./fixtures/feed.json');
const me = require('./fixtures/me.json');
const caseSummary = require('./fixtures/case.json');
const asset = require('./fixtures/asset.json');
const roll = require('./fixtures/roll.json');
const rollRecord = require('./fixtures/roll-record.json');
const verification = require('./fixtures/verify.json');
const buys = require('./fixtures/buys.json');

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function fixtures(page: Page, options: { poolTooSmall?: boolean; assetBody?: unknown; rollBody?: unknown; caseBody?: unknown; feedBody?: unknown } = {}) {
  let rollPosts = 0;
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, meta);
    if (url.pathname === '/api/feed') return json(route, options.feedBody ?? feed);
    if (url.pathname === '/api/auth/me') return json(route, me);
    if (url.pathname === '/api/cases/trending') return json(route, options.caseBody ?? caseSummary);
    if (url.pathname === '/api/assets/3') return json(route, options.assetBody ?? asset);
    if (url.pathname === '/api/assets/3/buys') return json(route, buys);
    if (url.pathname === '/api/rolls' && request.method() === 'POST') {
      rollPosts += 1;
      if (options.poolTooSmall) return json(route, { error: { code: 'pool_too_small', message: 'only 5 coins match these filters; loosen them', detail: { size: 5, min: 20 } } }, 422);
      return json(route, options.rollBody ?? roll, 201);
    }
    if (url.pathname === '/api/rolls/42' && request.method() === 'GET') return json(route, rollRecord);
    if (url.pathname === '/api/rolls/42/verify') return json(route, verification);
    if (url.pathname.endsWith('/buys')) return json(route, buys);
    return json(route, {});
  });
  return { rollPosts: () => rollPosts };
}

async function openCase(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /OPEN CASE/i }).click();
}

test('roll flow shows the unboxed symbol', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  // The reel spins for 5 s before the reveal; the default 5 s expect timeout races it.
  await expect(page.locator('.unboxed-bar').getByText('$GLORP', { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('pool_too_small shows the contract message', async ({ page }) => {
  await fixtures(page, { poolTooSmall: true });
  await openCase(page);
  await expect(page.locator('.roll-error')).toContainText('Only 5 coins match your filters — loosen them');
});

test.describe('reveal timing', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion reveals immediately after the roll', async ({ page }) => {
    await fixtures(page);
    await openCase(page);
    await expect(page.locator('.unboxed-bar')).toBeVisible();
  });
});

test('normal motion waits for the reel to settle before revealing the pull', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  await page.waitForTimeout(1_000);
  await expect(page.locator('.unboxed-bar')).not.toBeVisible();
  await expect(page.locator('.reel-strip.settled')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.unboxed-bar')).toBeVisible();
});

test('clicking a spinning reel skips to the settled pull', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  await page.locator('.spinner').click();
  await expect(page.locator('.reel-strip.settled')).toBeVisible();
  await expect(page.locator('.unboxed-bar')).toBeVisible();
});

test('Space after clicking OPEN CASE sends exactly one roll request', async ({ page }) => {
  const state = await fixtures(page);
  await page.goto('/');
  const openButton = page.getByRole('button', { name: /OPEN CASE/i });
  await openButton.click();
  await page.keyboard.press('Space');
  await expect.poll(state.rollPosts).toBe(1);
});

test('a loaded DEX Screener embed is not replaced by the timeout fallback', async ({ page }) => {
  await fixtures(page, { assetBody: { ...asset, chart: { dexscreenerEmbed: 'https://dexscreener.com/solana/FixturePair3?embed=1', geckoterminalEmbed: 'https://www.geckoterminal.com/solana/pools/FixturePair3?embed=1' } } });
  await page.route('https://dexscreener.com/**', async (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fixture chart</title>' }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/');
  await openCase(page);
  const iframe = page.locator('iframe[title="GLORP chart"]');
  await expect(iframe).toHaveAttribute('src', 'https://dexscreener.com/solana/FixturePair3?embed=1');
  await page.clock.runFor(9_000);
  await expect(iframe).toHaveAttribute('src', 'https://dexscreener.com/solana/FixturePair3?embed=1');
});

test('a missing DEX embed starts on GeckoTerminal', async ({ page }) => {
  const geckoUrl = 'https://www.geckoterminal.com/solana/pools/FixturePair3?embed=1';
  await fixtures(page, { assetBody: { ...asset, chart: { dexscreenerEmbed: null, geckoterminalEmbed: geckoUrl } } });
  await page.route('https://www.geckoterminal.com/**', async (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fixture chart</title>' }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openCase(page);
  await expect(page.locator('iframe[title="GLORP chart"]')).toHaveAttribute('src', geckoUrl);
});

test('dollar-prefixed symbols never render with a doubled dollar sign', async ({ page }) => {
  const wifAsset = { ...asset, symbol: '$WIF', name: 'dogwifhat' };
  const wifCase = { ...caseSummary, contents: caseSummary.contents.map((item: Record<string, unknown>) => ({ ...item, symbol: '$WIF', name: 'dogwifhat' })) };
  const wifRoll = { ...roll, asset: wifAsset, reel: { ...roll.reel, cards: roll.reel.cards.map((card: Record<string, unknown>) => ({ ...card, symbol: '$WIF', name: 'dogwifhat' })) } };
  await fixtures(page, { assetBody: wifAsset, caseBody: wifCase, rollBody: wifRoll });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await openCase(page);
  await expect(page.locator('.unboxed-bar')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('$$');
});

test('verify page shows a check for a revealed fixture seed', async ({ page }) => {
  await fixtures(page);
  await page.goto('/verify/42');
  await expect(page.getByText('✓ verified')).toBeVisible();
  await expect(page.getByText('✓ Browser check matches the recorded result')).toBeVisible();
});

test('case page contains no prohibited risk-label language', async ({ page }) => {
  await fixtures(page);
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveText(/risk|safe|scam|rug/i);
});
