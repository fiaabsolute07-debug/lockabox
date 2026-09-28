import type postgres from 'postgres';
import { tokenImageUrl } from '@/modules/sources/images';
import { normalizeAssetAddress } from '@/modules/sources/normalize';

// Explicit provider network mapping; unknown networks are not guessed.
// Verified against /api/v2/networks pages 1–2 (2026-09-28). Unknown IDs stay excluded.
const NETWORKS: Record<string, string> = {
  solana:'solana',ethereum:'eth',base:'base',bsc:'bsc',arbitrum:'arbitrum',polygon:'polygon_pos',avalanche:'avax',optimism:'optimism',
  cronos:'cro',fantom:'ftm',metis:'metis',celo:'celo',gnosischain:'xdai',moonbeam:'glmr',kaia:'kaia',flare:'flare',aptos:'aptos',core:'core',
  zksync:'zksync',sui:'sui-network',pulsechain:'pulsechain',starknet:'starknet-alpha',mantle:'mantle',linea:'linea',manta:'manta-pacific',
  hedera:'hedera-hashgraph',scroll:'scroll',ton:'ton',mode:'mode',blast:'blast',zora:'zora-network',xlayer:'x-layer',bob:'bob-network',
  taiko:'taiko',seiv2:'sei-evm',tron:'tron',worldchain:'world-chain',apechain:'apechain',cardano:'cardano',sonic:'sonic',ink:'ink',soneium:'soneium',
  abstract:'abstract',berachain:'berachain',unichain:'unichain',hyperevm:'hyperevm',katana:'katana',near:'near',plasma:'plasma',injective:'injective',monad:'monad',megaeth:'megaeth',
};

export function geckoImages(payload: unknown, chain: string): Map<string, string> {
  const out = new Map<string, string>();
  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error('Invalid GeckoTerminal token response');
  for (const row of data) {
    const a = row?.attributes;
    if (row?.type !== 'token' || typeof a?.address !== 'string' || row.id !== `${NETWORKS[chain]}_${a.address}`) continue;
    const image = tokenImageUrl(a.image_url);
    if (image && !image.includes('/missing')) out.set(normalizeAssetAddress(chain, a.address), image);
  }
  return out;
}

/** Called under the ingest advisory lock. One batch (<=30 tokens) per minute maximum,
 * durable six-hour negative cache, one-hour error backoff. Never changes eligibility. */
export async function enrichImages(sql: postgres.Sql, fetchImpl: typeof fetch = fetch) {
  const idle = { checked: 0, updated: 0 };
  const [recent] = await sql`select exists(select 1 from asset_image_lookups where attempted_at>now()-interval '1 minute') as yes`;
  if (recent.yes) return idle;
  // Tokens in a live case pool go first: those are the ones users actually see.
  const due = await sql<{ id: number; chain_id: string; address: string }[]>`
    with live as (
      select distinct (e->>'a')::bigint as id
      from (select distinct on (case_id,chain_scope) items from case_pools order by case_id,chain_scope,version desc) p
      cross join jsonb_array_elements(p.items) e)
    select a.id,a.chain_id,a.address from assets a
    join chains c on c.id=a.chain_id
    left join asset_image_lookups l on l.asset_id=a.id
    where c.enabled and a.merged_into is null and (nullif(a.image_url,'') is null
      or exists(select 1 from asset_image_cache ic where ic.asset_id=a.id and ic.state in ('broken','unsupported')))
      and a.chain_id=any(${Object.keys(NETWORKS)}) and (l.next_attempt_at is null or l.next_attempt_at<=now())
    order by exists(select 1 from live where live.id=a.id) desc, l.attempted_at nulls first,
      exists(select 1 from asset_snapshots s where s.asset_id=a.id and s.taken_at>now()-interval '15 minutes') desc,
      a.first_seen_at desc,a.id limit 900`;
  if (!due.length) return idle;
  const chain = due[0].chain_id;
  const batch = due.filter(a => a.chain_id === chain).slice(0,30);
  const ids = batch.map(a => a.id);
  // Reserve before I/O: a crash/restart cannot spin on the same tokens.
  for (const a of batch) await sql`insert into asset_image_lookups(asset_id,next_attempt_at) values(${a.id},now()+interval '1 hour')
    on conflict(asset_id) do update set attempted_at=now(),next_attempt_at=now()+interval '1 hour',last_error=null`;
  try {
    const addresses = batch.map(a => encodeURIComponent(a.address)).join(',');
    const response = await fetchImpl(`https://api.geckoterminal.com/api/v2/networks/${NETWORKS[chain]}/tokens/multi/${addresses}`, {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`GeckoTerminal HTTP ${response.status}`);
    const images = geckoImages(await response.json(), chain);
    let updated = 0;
    for (const a of batch) {
      const image = images.get(normalizeAssetAddress(chain,a.address));
      if (!image) continue;
      const changed = await sql`update assets a set image_url=${image} where id=${a.id} and (nullif(image_url,'') is null
        or exists(select 1 from asset_image_cache ic where ic.asset_id=a.id and ic.state in ('broken','unsupported'))) returning id`;
      if(changed.length) await sql`update asset_image_cache set source_url=${image},state='pending',next_check_at=now() where asset_id=${a.id} and source_url is distinct from ${image}`;
      updated += changed.length;
    }
    await sql`update asset_image_lookups set next_attempt_at=now()+interval '6 hours',last_error=null where asset_id=any(${ids}::bigint[])`;
    return { checked: batch.length, updated };
  } catch (err) {
    await sql`update asset_image_lookups set last_error=${(err as Error).message.slice(0,250)} where asset_id=any(${ids}::bigint[])`;
    throw err;
  }
}
