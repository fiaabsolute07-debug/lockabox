import { handleError, json } from '@/lib/api';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Live sponsored drops for the case page (each shown with the Sponsored label). */
export async function GET() {
  try {
    const rows = await sql<{ id: number; project_name: string; description: string; symbol: string | null; address: string; image_url: string | null; amount_per_open: string; remaining: number; cost_points: number; ends_at: Date }[]>`
      select c.id, c.project_name, c.description, a.symbol, a.address, a.image_url, c.amount_per_open, (c.total_opens - c.opens_used) as remaining, c.cost_points, c.ends_at
      from sponsor_campaigns c join assets a on a.id = c.asset_id
      where c.status = 'approved' and now() between c.starts_at and c.ends_at and c.opens_used < c.total_opens
      order by c.ends_at`;
    return json({ label: 'Sponsored', items: rows.map((r) => ({ id: Number(r.id), projectName: r.project_name, description: r.description, symbol: r.symbol,
      address: r.address, imageUrl: r.image_url, amountPerOpen: r.amount_per_open, remaining: r.remaining, costPoints: r.cost_points, endsAt: r.ends_at.toISOString() })) });
  } catch (e) { return handleError(e); }
}
