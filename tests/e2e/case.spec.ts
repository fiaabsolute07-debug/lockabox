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

async function fixtures(page: Page, options: { discover?: boolean; poolTooSmall?: boolean; assetBody?: unknown; rollBody?: unknown; caseBody?: unknown; feedBody?: unknown } = {}) {
  let rollPosts = 0;
  await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/meta') return json(route, options.discover ? {...meta, cases:[{id:'discover',kind:'discover',title:'Discover'},...meta.cases]} : meta);
    if (url.pathname === '/api/feed') return json(route, options.feedBody ?? feed);
    if (url.pathname === '/api/auth/me') return json(route, me);
    if (url.pathname === '/api/cases/trending') return json(route, options.caseBody ?? caseSummary);
    if (url.pathname === '/api/cases/discover') return json(route, {...caseSummary,case:{id:'discover',kind:'discover',title:'Discover'}});
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

for (const broken of [false,true]) test(`shared token avatar ${broken ? 'falls back on image failure' : 'loads on reveal and token header'}`, async ({page}) => {
  const imageUrl = 'https://avatar.fixture.test/coin.svg';
  await page.route(imageUrl, route => route.fulfill(broken ? {status:404,body:''} : {contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="orange"/></svg>'}));
  await fixtures(page,{assetBody:{...asset,imageUrl},rollBody:{...roll,asset:{...roll.asset,imageUrl}}});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await openCase(page);
  await page.locator('.reel-skip').click();
  await expect(page.locator('.pull-art')).toBeVisible();
  if (broken) await expect(page.locator('.pull-art')).toHaveText('G');
  else await expect.poll(()=>page.locator('.pull-art img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('.pull-close').click();
  if (broken) await expect(page.locator('.token-avatar-large')).toHaveText('G');
  else await expect.poll(()=>page.locator('.token-avatar-large img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
});

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

test('pair age defaults to seven days on the first roll', async ({ page }) => {
  const state = await fixtures(page, { poolTooSmall: true });
  await page.goto('/');
  await expect(page.locator('.filter-summary')).toHaveText('Next roll · pair age: <7d');
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('group', { name: 'PAIR AGE', exact: true }).getByRole('button', { name: '<7d', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Close filters', exact: true }).click();
  const sent = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rolls' && request.method() === 'POST');
  await page.getByRole('button', { name: /OPEN CASE/i }).click();
  expect((await sent).postDataJSON().filters).toEqual({ maxAgeHours: 168 });
  await expect(page.locator('.roll-error')).toBeVisible();
  // Insufficient matches must not trigger an automatic retry with the age filter removed.
  expect(state.rollPosts()).toBe(1);
});

test('Discover is the default seven-day case and Trending remains separately selectable', async ({ page }) => {
  await fixtures(page, {discover:true,poolTooSmall:true});
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'Discover',exact:true})).toBeVisible();
  const sent=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/rolls' && r.method()==='POST');
  await page.getByRole('button',{name:/OPEN CASE/i}).click();
  expect((await sent).postDataJSON()).toMatchObject({caseId:'discover',filters:{maxAgeHours:168}});
  await page.getByRole('button',{name:'Trending',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Trending',exact:true})).toBeVisible();
});

test('pair age presets and All reach the next roll without resetting other filters', async ({ page }) => {
  await fixtures(page, { poolTooSmall: true });
  await page.goto('/');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByLabel('Min liquidity', { exact: true }).fill('2500');
  await page.getByRole('button', { name: 'Close filters', exact: true }).click();
  for (const [label, hours] of [['<1h', 1], ['<6h', 6], ['<24h', 24], ['<3d', 72], ['<7d', 168], ['<14d', 336], ['<30d', 720], ['All', null]] as const) {
    await page.getByRole('button', { name: /Filters/ }).click();
    const group = page.getByRole('group', { name: 'PAIR AGE', exact: true });
    await group.getByRole('button', { name: label, exact: true }).click();
    await expect(group.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(group.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Max pair age (hours)', { exact: true })).toHaveValue(hours === null ? '' : String(hours));
    await page.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(page.locator('.filter-summary')).toHaveText(`Next roll · pair age: ${label}`);
    const sent = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rolls' && request.method() === 'POST');
    await page.getByRole('button', { name: /OPEN CASE/i }).click();
    expect((await sent).postDataJSON().filters).toEqual({ minLiquidityUsd: 2500, ...(hours === null ? {} : { maxAgeHours: hours }) });
    await expect(page.locator('.roll-error')).toBeVisible();
  }
});

test('pair age controls fit mobile and keep custom hours available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page, { poolTooSmall: true });
  await page.goto('/');
  await page.getByRole('button', { name: /Filters/ }).click();
  const group = page.getByRole('group', { name: 'PAIR AGE', exact: true });
  for (const button of await group.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await page.getByLabel('Max pair age (hours)', { exact: true }).fill('48');
  await expect(group.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close filters', exact: true }).click();
  await expect(page.locator('.filter-summary')).toHaveText('Next roll · pair age: <48h');
  const sent = page.waitForRequest(request => new URL(request.url()).pathname === '/api/rolls' && request.method() === 'POST');
  await page.getByRole('button', { name: /OPEN CASE/i }).click();
  expect((await sent).postDataJSON().filters).toEqual({ maxAgeHours: 48 });
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

test('the reel occupies the viewport while the case is opening', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  const stage = page.locator('.roll-stage');
  await expect(stage).toHaveCSS('position', 'fixed');
  const viewport = page.viewportSize();
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(box!.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);
  await expect(page.getByText('OPENING CASE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Skip animation/i }).click();
  // The pull is then presented in the middle of the screen until the user closes it.
  await expect(stage).toHaveCSS('position', 'fixed');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.pull-card').getByRole('button', { name: 'Close' }).click();
  await expect(stage).toHaveCSS('position', 'relative');
});

test('a ★ Top pull is presented full screen with rays, confetti and a halo, then closes back into the page', async ({ page }) => {
  const topRoll = { ...roll, roll: { ...roll.roll, tier: 'top' }, asset: { ...roll.asset, tier: 'top' }, reel: { ...roll.reel, cards: roll.reel.cards.map((card: Record<string, unknown>, index: number) => index === roll.reel.winIndex ? { ...card, tier: 'top' } : card) } };
  await fixtures(page, { rollBody: topRoll });
  await openCase(page);
  await page.getByRole('button', { name: /Skip animation/i }).click();
  const dialog = page.getByRole('dialog', { name: '★ TOP PULL!' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.reveal-rays')).toHaveCount(1);
  expect(await dialog.locator('.confetti i').count()).toBeGreaterThan(100);
  await expect(dialog).toContainText('$GLORP');
  await expect(page.locator('.reveal-burst')).toHaveCSS('pointer-events', 'none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.roll-stage')).toHaveCSS('position', 'relative');
  await expect(page.locator('.unboxed-bar')).toBeVisible();
  await expect(page.locator('.reel-card.winner')).toHaveClass(/tier-top/);
  await expect(page.locator('.reel-card.winner .reel-art')).toHaveCSS('animation-name', /coin-halo/);
});

test('clicking a spinning reel skips to the settled pull', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  await page.locator('.spinner').click();
  await expect(page.locator('.reel-strip.settled')).toBeVisible();
  await expect(page.locator('.unboxed-bar')).toBeVisible();
});

test('feed and hot pulls do not reveal the token while the reel is spinning', async ({ page }) => {
  await fixtures(page);
  let pendingFeed: Route | undefined;
  await page.route('**/api/feed', route => { pendingFeed = route; });
  await openCase(page);
  await expect(page.locator('.roll-spinning')).toBeVisible();
  await expect(page.locator('.reel-card.winner')).toHaveCount(0);
  await expect.poll(() => !!pendingFeed).toBe(true);
  await json(pendingFeed!, { ...feed, items: [{ kind: 'pull', ref: '42', assetId: 3, symbol: 'SPOILER', tier: 'top', at: new Date().toISOString() }] });
  await page.waitForTimeout(150);
  await expect(page.locator('.feed-ticker').filter({ hasText: 'SPOILER' })).toHaveCount(0);
  await expect(page.locator('.hot-pulls')).not.toContainText('SPOILER');
  await page.getByRole('button', { name: /Skip animation/i }).click();
  await expect(page.locator('.feed-ticker')).toContainText('SPOILER');
  await expect(page.locator('.hot-pulls')).toContainText('SPOILER');
  await expect(page.locator('.reel-card.winner')).toHaveCount(1);
});

test('starting another roll clears the old winning card while the API is pending', async ({ page }) => {
  await fixtures(page);
  await openCase(page);
  await page.getByRole('button', { name: /Skip animation/i }).click();
  await expect(page.locator('.unboxed-bar')).toBeVisible();
  await page.locator('.pull-card').getByRole('button', { name: 'Close' }).click();
  let pendingRoll: Route | undefined;
  await page.route('**/api/rolls', route => { pendingRoll = route; });
  await page.getByRole('button', { name: /OPEN CASE/i }).click();
  await expect.poll(() => !!pendingRoll).toBe(true);
  await expect(page.locator('.unboxed-bar')).not.toBeVisible();
  await expect(page.locator('.reel-card.winner')).toHaveCount(0);
  await json(pendingRoll!, roll, 201);
  await expect(page.locator('.roll-spinning')).toBeVisible();
  await expect(page.locator('.reel-card.winner')).toHaveCount(0);
  await page.getByRole('button', { name: /Skip animation/i }).click();
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
  // The embed must actually have loaded before the fake clock passes the 8 s fallback (a cold dev server can be slow).
  await expect.poll(() => page.frames().some((frame) => frame.url().startsWith('https://dexscreener.com/'))).toBe(true);
  await page.frames().find((frame) => frame.url().startsWith('https://dexscreener.com/'))!.waitForLoadState('load');
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

test('a Micro pull gets the "womp" reveal without confetti, and Open again rolls from the reveal screen', async ({ page }) => {
  const microRoll = { ...roll, roll: { ...roll.roll, tier: 'micro', odds: { micro: 3500, small: 3000, mid: 2000, large: 1200, top: 300 } } };
  const state = await fixtures(page, { rollBody: microRoll });
  await openCase(page);
  await page.getByRole('button', { name: /Skip animation/i }).click();
  const dialog = page.getByRole('dialog', { name: 'Womp womp…' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('35% chance');
  await expect(dialog.locator('.confetti')).toHaveCount(0);
  await expect(dialog.locator('.reveal-rays')).toHaveCount(0);
  const card = page.locator('.pull-card');
  await expect(card.getByRole('button', { name: /Open again/ })).toBeFocused();
  await card.getByRole('button', { name: /Open again/ }).click();
  await expect.poll(state.rollPosts).toBe(2);
  await expect(page.locator('.roll-spinning, .roll-charging').first()).toBeVisible();
});

test('licensed sound files in /public/sounds replace the synthesised sounds when a manifest lists them', async ({ page }) => {
  await fixtures(page);
  const requested: string[] = [];
  await page.route('**/sounds/manifest.json', (route) => json(route, { tick: 'tick.mp3', 'reveal-top': 'gold.mp3', bad: '../x.mp3' }));
  await page.route('**/sounds/*.mp3', (route) => { requested.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }); });
  await openCase(page);
  await expect.poll(() => requested.sort()).toEqual(['/sounds/gold.mp3', '/sounds/tick.mp3']);
});

test('after the reveal a coin card shows real market data and puts the buy box first', async ({ page }) => {
  const state = await fixtures(page, { assetBody: { ...asset, swapEnabled: false, lockaboxBuys24h: 4 } });
  await openCase(page);
  await page.getByRole('button', { name: /Skip animation/i }).click();
  const card = page.locator('.pull-card');
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText('$GLORP');
  await expect(card).toContainText('$0.004821');
  await expect(card).toContainText('4 bought it through Lockabox in the last 24 h');
  // Swap off on this chain: the primary action is the DEX Screener link, green and first in the buy column.
  await expect(card.locator('.pull-buy').getByRole('link', { name: 'Buy on DEX Screener ↗' })).toHaveAttribute('href', 'https://dexscreener.com/solana/FixturePair3');
  await expect(card.locator('.pull-buy .button-buy')).toBeVisible();
  await expect(card).not.toContainText(/guarantee|moon|100x|last chance|only \d+ left/i);
  expect(state.rollPosts()).toBe(1);
  // The chart sits on the card, with DEX Screener's drawing toolbar off; the actions stay in the sticky top bar.
  await expect(card.locator('.pull-chart iframe')).toHaveAttribute('src', /chartLeftToolbar=0/);
  await expect(card.locator('.pull-bar').getByRole('button', { name: /Open again/ })).toBeVisible();
  await card.locator('.pull-bar').getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('.unboxed-bar')).toBeVisible();
});
