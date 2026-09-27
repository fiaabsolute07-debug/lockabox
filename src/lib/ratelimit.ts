import { headers } from 'next/headers';
import { problem } from '@/lib/api';

/**
 * Per-process sliding-window limiter for write endpoints (LAB §8 "rate limit mọi endpoint ghi", AC-058).
 * One app instance for now; with several instances move the counters to Postgres or Redis.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const since = now - windowMs;
  const list = (hits.get(key) ?? []).filter((t) => t > since);
  if (list.length >= limit) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 50_000) for (const [k, v] of hits) if (!v.length || v[v.length - 1] <= since) hits.delete(k);
  return true;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

/** Returns a 429 response when over the limit, else null. Keyed by route + actor (user id, or IP when signed out). */
export async function limited(route: string, actor: string | null, limit: number, windowMs = 60_000) {
  const key = `${route}:${actor ?? `ip:${await clientIp()}`}`;
  return allow(key, limit, windowMs) ? null : problem(429, 'rate_limited', 'too many requests, try again in a minute');
}

export function resetRateLimits() { hits.clear(); }
