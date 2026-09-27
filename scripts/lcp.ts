import { chromium, type Browser, type CDPSession } from '@playwright/test';
import { writeFileSync } from 'node:fs';

/**
 * AC-077: Largest Contentful Paint of the Cases page (/) on emulated 4G, against a production build (`pnpm build && pnpm start`).
 * Every run is a fresh browser context (cold HTTP cache). Throttling is applied through CDP like Chrome DevTools does:
 *   slow4g — DevTools "Slow 4G" preset (1.6 Mbps × 0.9 down, 750 kbps × 0.9 up, 150 ms × 3.75 RTT) + 4× CPU slowdown (Lighthouse mobile)
 *   fast4g — DevTools "Fast 4G" preset (9 Mbps × 0.9 down, 1.5 Mbps × 0.9 up, 60 ms × 2.75 RTT) + 4× CPU slowdown
 * Scenarios: `returning` (18+ already confirmed) and `first` (the age gate opens after hydration and can become the LCP).
 * Usage: pnpm exec tsx scripts/lcp.ts --url http://127.0.0.1:4310 [--runs 5] [--out docs/evidence/lcp-4g.json]
 */

const arg = (name: string, fallback: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const URL_BASE = arg('url', 'http://127.0.0.1:4310');
const RUNS = Number(arg('runs', '5'));
const OUT = arg('out', '');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)) throw new Error('local server only');

const PROFILES = {
  slow4g: { download: (1.6 * 1e6 / 8) * 0.9, upload: (750 * 1e3 / 8) * 0.9, latency: 150 * 3.75, cpu: 4 },
  fast4g: { download: (9 * 1e6 / 8) * 0.9, upload: (1.5 * 1e6 / 8) * 0.9, latency: 60 * 2.75, cpu: 4 },
} as const;
type ProfileName = keyof typeof PROFILES;
type Scenario = 'returning' | 'first';
type Run = { lcp: number; element: string; fcp: number; html: number; bytes: number; requests: number };

async function throttle(cdp: CDPSession, profile: ProfileName) {
  const p = PROFILES[profile];
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: p.latency, downloadThroughput: p.download, uploadThroughput: p.upload });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
}

async function once(browser: Browser, profile: ProfileName, scenario: Scenario, mobile: boolean): Promise<Run> {
  const context = await browser.newContext(mobile
    ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-US' }
    : { viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const page = await context.newPage();
  if (scenario === 'returning') {
    // A returning visitor has confirmed 18+ before: cookie (read by the server) + localStorage.
    await context.addCookies([{ name: 'lab_age', value: '1', url: URL_BASE }]);
    await page.addInitScript(() => window.localStorage.setItem('lab_age_confirmed', '1'));
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: { t: number; el: string }[] };
    w.__lcp = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { element?: Element | null })[]) {
        const el = entry.element;
        w.__lcp.push({ t: entry.startTime, el: el ? `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"` : '?' });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await throttle(cdp, profile);
  let bytes = 0, requests = 0;
  cdp.on('Network.loadingFinished', (event: { encodedDataLength: number }) => { bytes += event.encodedDataLength; requests++; });
  await page.goto(`${URL_BASE}/`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    const w = window as unknown as { __lcp: { t: number; el: string }[] };
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? NaN;
    const last = w.__lcp[w.__lcp.length - 1];
    // responseEnd, not responseStart: Chrome's emulated latency is applied to the body, so responseStart looks instant.
    return { lcp: last?.t ?? NaN, element: last?.el ?? 'none', fcp, html: nav.responseEnd };
  });
  await context.close();
  return { ...result, bytes, requests };
}

const pct = (values: number[], p: number) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };

async function main() {
  const executablePath = process.env.PW_EXECUTABLE;
  const browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'chrome' });
  // Warm the server once (route compilation, DB pool) so the numbers are the page, not a cold process.
  const warm = await browser.newPage(); await warm.goto(`${URL_BASE}/`, { waitUntil: 'networkidle' }); await warm.close();
  const matrix: { profile: ProfileName; scenario: Scenario; mobile: boolean }[] = [
    { profile: 'slow4g', scenario: 'returning', mobile: true },
    { profile: 'slow4g', scenario: 'first', mobile: true },
    { profile: 'fast4g', scenario: 'returning', mobile: true },
    { profile: 'fast4g', scenario: 'first', mobile: true },
    { profile: 'fast4g', scenario: 'returning', mobile: false },
  ];
  const report = [];
  for (const m of matrix) {
    const runs: Run[] = [];
    for (let i = 0; i < RUNS; i++) runs.push(await once(browser, m.profile, m.scenario, m.mobile));
    const lcps = runs.map((r) => r.lcp);
    const row = { ...m, runs: RUNS, lcpMedianMs: Math.round(pct(lcps, 50)), lcpP75Ms: Math.round(pct(lcps, 75)), lcpMaxMs: Math.round(Math.max(...lcps)),
      fcpMedianMs: Math.round(pct(runs.map((r) => r.fcp), 50)), htmlMedianMs: Math.round(pct(runs.map((r) => r.html), 50)),
      kbTransferred: Math.round(pct(runs.map((r) => r.bytes), 50) / 1024), requests: pct(runs.map((r) => r.requests), 50),
      lcpElements: [...new Set(runs.map((r) => r.element))], allLcpMs: lcps.map(Math.round) };
    report.push(row);
    console.log(`${m.profile.padEnd(6)} ${m.scenario.padEnd(9)} ${m.mobile ? 'mobile ' : 'desktop'} LCP median ${row.lcpMedianMs} ms · p75 ${row.lcpP75Ms} · max ${row.lcpMaxMs} · FCP ${row.fcpMedianMs} · HTML ${row.htmlMedianMs} · ${row.kbTransferred} KB/${row.requests} req · ${row.lcpElements.join(' | ')}`);
  }
  await browser.close();
  if (OUT) writeFileSync(OUT, `${JSON.stringify({ at: new Date().toISOString(), url: URL_BASE, profiles: PROFILES, report }, null, 2)}\n`);
}

await main();
