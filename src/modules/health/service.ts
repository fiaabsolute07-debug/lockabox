import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';

/**
 * Health and alerts (AC-080): worker late > 10 min, free API budgets > 80 %, swap failure rate > 5 %.
 * `/api/health` returns 200 with `status: 'ok'` or 503 with the alerts, so any uptime checker can page on it.
 */

// Free budgets we run under (LAB §3): DEX Screener feeds 60/min; DexPaprika 10 000 credits / 30 days keyless
// (100 000 with a free key); Jupiter lite-api is unmetered but we keep our own ceiling.
export const BUDGETS = { dsPerMinute: 60, paprikaPer30d: 10_000, paprikaPer30dWithKey: 100_000, jupiterPerMinute: 60 };
export const WORKER_LATE_MS = 10 * 60_000;
export const SWAP_FAIL_RATE = 0.05;

export type Alert = { code: 'worker_late' | 'worker_failing' | 'ds_budget' | 'paprika_budget' | 'swap_failures' | 'no_seed'; message: string };

export async function health(sql: postgres.Sql = defaultSql, opts: { paprikaKey?: boolean } = {}) {
  const alerts: Alert[] = [];
  const [last] = await sql<{ finished_at: Date; ok: boolean; ds_calls: number; secs: number }[]>`
    select finished_at, ok, ds_calls, greatest(extract(epoch from finished_at - started_at), 1)::float as secs from worker_runs order by finished_at desc limit 1`;
  const lagMs = last ? Date.now() - last.finished_at.getTime() : null;
  if (lagMs === null || lagMs > WORKER_LATE_MS) alerts.push({ code: 'worker_late', message: lagMs === null ? 'the worker has never finished a cycle' : `last worker cycle ${Math.round(lagMs / 60_000)} min ago` });
  const [fails] = await sql<{ n: number }[]>`select count(*)::int as n from (select ok from worker_runs order by finished_at desc limit 3) x where not ok`;
  if (fails.n >= 3) alerts.push({ code: 'worker_failing', message: 'the last 3 worker cycles failed' });

  // DEX Screener: calls per minute over the last 10 minutes of cycles.
  const [ds] = await sql<{ calls: number }[]>`select coalesce(sum(ds_calls), 0)::int as calls from worker_runs where finished_at > now() - interval '10 minutes'`;
  const dsPerMin = ds.calls / 10;
  if (dsPerMin > BUDGETS.dsPerMinute * 0.8) alerts.push({ code: 'ds_budget', message: `DEX Screener ~${dsPerMin.toFixed(0)}/min, above 80 % of ${BUDGETS.dsPerMinute}/min` });

  const [pp] = await sql<{ calls: number }[]>`select coalesce(sum(paprika_calls), 0)::int as calls from worker_runs where finished_at > now() - interval '30 days'`;
  const paprikaBudget = opts.paprikaKey ? BUDGETS.paprikaPer30dWithKey : BUDGETS.paprikaPer30d;
  if (pp.calls > paprikaBudget * 0.8) alerts.push({ code: 'paprika_budget', message: `DexPaprika ${pp.calls} calls in 30 days, above 80 % of ${paprikaBudget}` });

  const [sw] = await sql<{ failed: number; done: number }[]>`
    select count(*) filter (where status = 'failed')::int as failed, count(*) filter (where status in ('failed', 'confirmed'))::int as done
    from trades where updated_at > now() - interval '24 hours'`;
  const failRate = sw.done ? sw.failed / sw.done : 0;
  if (sw.done >= 20 && failRate > SWAP_FAIL_RATE) alerts.push({ code: 'swap_failures', message: `${(failRate * 100).toFixed(1)} % of swaps failed in 24 h` });

  const [seed] = await sql<{ n: number }[]>`select count(*)::int as n from server_seeds where revealed_at is null`;
  if (!seed.n) alerts.push({ code: 'no_seed', message: 'no active server seed' });

  return {
    status: alerts.length ? 'degraded' as const : 'ok' as const,
    alerts,
    worker: { lastCycleAt: last?.finished_at.toISOString() ?? null, lastCycleOk: last?.ok ?? null, lagSeconds: lagMs === null ? null : Math.round(lagMs / 1000) },
    budgets: { dsPerMinute: Math.round(dsPerMin), paprika30d: pp.calls, paprikaBudget },
    swaps24h: { finished: sw.done, failed: sw.failed },
  };
}
