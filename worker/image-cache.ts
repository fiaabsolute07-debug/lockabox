import { createHash } from 'node:crypto';
import type postgres from 'postgres';

export const IMAGE_BUCKET = 'lockabox-token-avatars';
export const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_CACHE_BYTES = 128 * 1024 * 1024;
// Never fetch arbitrary metadata URLs, local hosts, or redirects server-side.
const HOSTS = new Set(['cdn.dexscreener.com','dd.dexscreener.com','coin-images.coingecko.com','assets.coingecko.com','assets.geckoterminal.com']);
export function allowedImageSource(value: string) {
  try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password && !u.port && HOSTS.has(u.hostname); }
  catch { return false; }
}
export function rasterType(b: Buffer): string | null {
  if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(b[0]===255 && b[1]===216 && b[2]===255) return 'image/jpeg';
  if(b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') return 'image/webp';
  if(b.toString('ascii',0,6)==='GIF87a' || b.toString('ascii',0,6)==='GIF89a') return 'image/gif';
  if(b.toString('ascii',4,8)==='ftyp' && ['avif','avis'].includes(b.toString('ascii',8,12))) return 'image/avif';
  return null;
}
export async function downloadAvatar(url: string, fetcher: typeof fetch=fetch) {
  if(!allowedImageSource(url)) throw new Error('unsupported_image_host');
  const r=await fetcher(url,{headers:{accept:'image/avif,image/webp,image/png,image/jpeg,image/gif'},signal:AbortSignal.timeout(8000),redirect:'error'});
  if(!r.ok) { await r.body?.cancel(); throw new Error(`image_http_${r.status}`); }
  if(!r.body) throw new Error('empty_image');
  if(Number(r.headers.get('content-length'))>MAX_IMAGE_BYTES) {await r.body.cancel();throw new Error('image_too_large');}
  const reader=r.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_IMAGE_BYTES)throw new Error('image_too_large');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);const type=rasterType(bytes);
  if(!type || bytes.length<16) throw new Error('unsupported_image_format');
  return {bytes,type};
}

/** Uses only server credentials. Missing config leaves normal source URLs intact. */
export async function cacheAvatars(sql:postgres.Sql,fetcher:typeof fetch=fetch) {
  const origin=process.env.SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!origin || !key) return {checked:0,cached:0,reason:'storage_not_configured'};
  const u=new URL(origin);
  if(u.protocol!=='https:' || !/^[a-z0-9]+\.supabase\.co$/.test(u.hostname) || u.username || u.password || u.port) throw new Error('invalid_storage_origin');
  const rows=await sql<{id:number;source_url:string;cached_url:string|null;bytes:number;failures:number}[]>`
    select a.id,coalesce(c.source_url,a.image_url) source_url,c.cached_url,coalesce(c.bytes,0)::int bytes,coalesce(c.failures,0)::int failures
    from assets a join chains ch on ch.id=a.chain_id left join asset_image_cache c on c.asset_id=a.id
    where a.merged_into is null and ch.enabled and nullif(a.image_url,'') is not null and (c.next_check_at is null or c.next_check_at<=now())
    order by exists(select 1 from asset_snapshots s where s.asset_id=a.id and s.taken_at>now()-interval '15 minutes') desc,
      c.checked_at nulls first,a.id limit 20`;
  const [{used}]=await sql<{used:number}[]>`select coalesce(sum(bytes),0)::bigint used from asset_image_cache`;
  let total=Number(used),cached=0;
  for(const a of rows){
    await sql`insert into asset_image_cache(asset_id,source_url,next_check_at) values(${a.id},${a.source_url},now()+interval '15 minutes')
      on conflict(asset_id) do update set next_check_at=now()+interval '15 minutes'`;
    try {
      const {bytes,type}=await downloadAvatar(a.source_url,fetcher);
      if(total-a.bytes+bytes.length>MAX_CACHE_BYTES) throw new Error('storage_budget_reached');
      const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
      const object=`tokens/${a.id}`;
      // A stable object path bounds storage growth; version query refreshes browser caches.
      const res=await fetcher(`${u.origin}/storage/v1/object/${IMAGE_BUCKET}/${object}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'content-type':type,'cache-control':'max-age=3600','x-upsert':'true'},body:new Uint8Array(bytes),signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!res.ok) {await res.body?.cancel();throw new Error(`storage_http_${res.status}`);}
      await res.body?.cancel();
      const url=`${u.origin}/storage/v1/object/public/${IMAGE_BUCKET}/${object}?v=${hash}`;
      await sql.begin(async tx=>{
        await tx`update asset_image_cache set cached_url=${url},bytes=${bytes.length},state='ready',failures=0,checked_at=now(),next_check_at=now()+interval '7 days',last_error=null where asset_id=${a.id}`;
        await tx`update assets set image_url=${url} where id=${a.id}`;
      });
      total+=bytes.length-a.bytes;cached++;
    }catch(e){
      const message=(e as Error).message;
      const unsupported=message.startsWith('unsupported_');
      await sql`update asset_image_cache set state=${unsupported?'unsupported':message.startsWith('image_')?'broken':'pending'},failures=failures+1,checked_at=now(),
        next_check_at=now()+make_interval(secs=>${unsupported?86400:Math.min(21600,900*2**Math.min(a.failures,4))}),last_error=${message.slice(0,180)} where asset_id=${a.id}`;
      if(message.startsWith('storage_')) break; // don't hammer Storage during outage/quota failures
    }
  }
  return {checked:rows.length,cached};
}
