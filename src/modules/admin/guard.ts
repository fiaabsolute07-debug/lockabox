import { timingSafeEqual } from 'node:crypto';

/** Admin endpoints need `Authorization: Bearer $ADMIN_TOKEN`. No token configured = admin API disabled. */
export function isAdmin(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 24) return false;
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** LAB D6: geo-block exists but is off unless GEO_BLOCK_SWAP lists ISO codes. Country comes from the edge header. */
export function swapBlockedFor(req: Request): string | null {
  const list = (process.env.GEO_BLOCK_SWAP ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!list.length) return null;
  const country = (req.headers.get('x-vercel-ip-country') ?? req.headers.get('cf-ipcountry') ?? '').toUpperCase();
  return country && list.includes(country) ? country : null;
}
