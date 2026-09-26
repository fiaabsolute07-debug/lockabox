import { handleError, json, problem } from '@/lib/api';
import { sql } from '@/lib/db';
import { assetDetail } from '@/modules/cases/read';
import type { Tier } from '@/modules/rolls/fair';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/rolls/[id]'>) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid roll id');
    const [r] = await sql<{ id: number; case_id: string; pool_id: number; client_seed: string; nonce: number; tier: Tier; result_asset_id: number; items_hash: string; created_at: Date; hash: string; revealed_at: Date | null; filters: unknown; size: number }[]>`
      select r.id, r.case_id, r.pool_id, r.client_seed, r.nonce, r.tier, r.result_asset_id, r.items_hash, r.created_at, s.hash, s.revealed_at, r.filters,
             jsonb_array_length(r.items) as size
      from rolls r join server_seeds s on s.id = r.server_seed_id where r.id = ${id}`;
    if (!r) return problem(404, 'not_found', 'unknown roll');
    return json({
      roll: { id: Number(r.id), caseId: r.case_id, poolId: Number(r.pool_id), clientSeed: r.client_seed, nonce: r.nonce, tier: r.tier, itemsHash: r.items_hash,
        poolSize: r.size, filters: r.filters, serverSeedHash: r.hash, seedRevealed: !!r.revealed_at, createdAt: r.created_at.toISOString() },
      asset: await assetDetail(Number(r.result_asset_id), r.tier),
    });
  } catch (e) { return handleError(e); }
}
