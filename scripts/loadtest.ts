/**
 * Load test for rolls (AC-083: 1 000 concurrent rolls, no errors, p95 < 500 ms; AC-077: roll p95 < 300 ms server side).
 * Each virtual user is a fresh device (its own lab_device cookie), so the 1 s anti-bot pacing never trips.
 *
 *   pnpm exec tsx scripts/loadtest.ts --url http://127.0.0.1:4311 --concurrency 1000 --rounds 1 --case trending --chain all
 *   --url a,b spreads requests round-robin over several instances (what a load balancer would do).
 *
 * Run it against `next start` (production build), never against a shared or live environment.
 */
import { randomBytes } from 'node:crypto';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const urls = arg('url', 'http://127.0.0.1:4311').split(',');
const concurrency = Number(arg('concurrency', '1000'));
const rounds = Number(arg('rounds', '1'));
const caseId = arg('case', 'trending');
const chain = arg('chain', 'all');
for (const u of urls) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u)) throw new Error('load tests only run against a local server');

const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

async function one(url: string): Promise<{ ms: number; status: number }> {
  const device = randomBytes(18).toString('base64url');
  const t0 = performance.now();
  const res = await fetch(`${url}/api/rolls`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `lab_device=${device}` },
    body: JSON.stringify({ caseId, chain }),
  });
  await res.arrayBuffer();
  return { ms: performance.now() - t0, status: res.status };
}

const all: { ms: number; status: number }[] = [];
const started = performance.now();
for (let r = 0; r < rounds; r++) {
  const out = await Promise.all(Array.from({ length: concurrency }, (_, i) => one(urls[i % urls.length]).catch(() => ({ ms: Number.NaN, status: 0 }))));
  all.push(...out);
}
const wall = performance.now() - started;
const ok = all.filter((x) => x.status === 201).map((x) => x.ms).sort((a, b) => a - b);
const byStatus = all.reduce<Record<string, number>>((m, x) => { m[x.status] = (m[x.status] ?? 0) + 1; return m; }, {});
console.log(JSON.stringify({
  urls, caseId, chain, concurrency, rounds, requests: all.length, byStatus, wallMs: Math.round(wall),
  latencyMs: ok.length ? { p50: Math.round(pct(ok, 50)), p95: Math.round(pct(ok, 95)), p99: Math.round(pct(ok, 99)), max: Math.round(ok[ok.length - 1]) } : null,
  throughputPerSec: Math.round((ok.length / wall) * 1000),
}, null, 2));
