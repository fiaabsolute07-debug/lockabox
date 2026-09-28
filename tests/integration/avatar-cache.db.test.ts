import {beforeEach,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {sql} from '@/lib/db';
import {cacheAvatars} from '../../worker/image-cache';
import {enrichImages} from '../../worker/images';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const run=process.env.RUN_DB_INTEGRATION?describe:describe.skip;
run('durable avatar cache',()=>{
 beforeEach(async()=>{await sql.unsafe('truncate assets restart identity cascade');vi.stubEnv('SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','test-only');});
 afterEach(()=>vi.unstubAllEnvs());afterAll(async()=>{await sql.end();});
 it('caches and retains last good image through ingest and source outage',async()=>{
   await sql`insert into assets(chain_id,address,image_url) values('base','0xabc','https://cdn.dexscreener.com/a')`;
   const fetcher=vi.fn(async(input:RequestInfo|URL)=>String(input).includes('/storage/')?new Response('{}'):new Response(new Uint8Array(png)));
   expect(await cacheAvatars(sql,fetcher)).toMatchObject({cached:1});
   const [before]=await sql`select image_url from assets`;
   expect(before.image_url).toContain('/storage/v1/object/public/lockabox-token-avatars/');
   await sql`update assets set image_url='https://cdn.dexscreener.com/b'`;
   expect((await sql`select image_url from assets`)[0].image_url).toBe(before.image_url);
   expect((await sql`select source_url,state from asset_image_cache`)[0]).toMatchObject({source_url:'https://cdn.dexscreener.com/b',state:'pending'});
   await cacheAvatars(sql,async()=>new Response('',{status:404}));
   expect((await sql`select image_url from assets`)[0].image_url).toBe(before.image_url);
   expect((await sql`select state from asset_image_cache`)[0].state).toBe('broken');
 });
 it('requeues existing broken URLs through secondary source, not only missing URLs',async()=>{
   await sql`insert into assets(chain_id,address,image_url) values('base','0xabc','https://cdn.dexscreener.com/broken')`;
   await cacheAvatars(sql,async()=>new Response('',{status:404}));
   expect(await enrichImages(sql,async()=>new Response(JSON.stringify({data:[{id:'base_0xabc',type:'token',attributes:{address:'0xabc',image_url:'https://coin-images.coingecko.com/new.png'}}]})))).toMatchObject({updated:1});
   expect((await sql`select source_url,state from asset_image_cache`)[0]).toMatchObject({source_url:'https://coin-images.coingecko.com/new.png',state:'pending'});
 });
 it('keeps source image on Storage failure and does not call Storage without configuration',async()=>{
   await sql`insert into assets(chain_id,address,image_url) values('base','0xabc','https://cdn.dexscreener.com/a')`;
   await cacheAvatars(sql,async input=>String(input).includes('/storage/')?new Response('',{status:503}):new Response(new Uint8Array(png)));
   expect((await sql`select image_url from assets`)[0].image_url).toBe('https://cdn.dexscreener.com/a');
   vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','');const f=vi.fn();expect(await cacheAvatars(sql,f)).toMatchObject({reason:'storage_not_configured'});expect(f).not.toHaveBeenCalled();
 });
});
