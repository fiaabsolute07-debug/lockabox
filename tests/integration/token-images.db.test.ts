import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from '@/lib/db';
import { upsertDiscovered } from '../../worker/ingest';
import { enrichImages } from '../../worker/images';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;
run('shared token image enrichment', () => {
  beforeEach(async () => { await sql.unsafe('truncate assets restart identity cascade'); });
  afterAll(async () => { await sql.end(); });
  it('retains feed icons without erasing existing images on a later empty feed', async () => {
    const row = {chainId:'base',address:'0xabc',source:'ds:profile',imageUrl:'https://example.com/a.png'};
    await upsertDiscovered(sql,[row],new Set(['base']));
    await upsertDiscovered(sql,[{...row,imageUrl:null}],new Set(['base']));
    expect((await sql`select image_url from assets`)[0].image_url).toBe(row.imageUrl);
  });
  it('fills assets outside Discover, matches exact addresses, preserves prices and backs off empty results', async () => {
    await upsertDiscovered(sql,[{chainId:'base',address:'0xabc',source:'ds:top'},{chainId:'base',address:'0xdef',source:'ds:top'}],new Set(['base']));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({data:[{id:'base_0xabc',type:'token',attributes:{address:'0xabc',image_url:'https://example.com/a.png'}}]}))) as unknown as typeof fetch;
    expect(await enrichImages(sql,fetcher)).toEqual({checked:2,updated:1});
    expect(await enrichImages(sql,fetcher)).toEqual({checked:0,updated:0});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await sql`select * from asset_snapshots`).toHaveLength(0);
    expect((await sql`select count(*)::int as n from asset_image_lookups where next_attempt_at>now()+interval '5 hours'`)[0].n).toBe(2);
  });
  it('backs off provider failure without blocking normal ingest or wiping an image', async () => {
    await upsertDiscovered(sql,[{chainId:'solana',address:'AbC',source:'ds:top'}],new Set(['solana']));
    await expect(enrichImages(sql,async()=>new Response('',{status:429}))).rejects.toThrow('429');
    expect((await sql`select last_error,next_attempt_at>now() as deferred from asset_image_lookups`)[0]).toMatchObject({last_error:'GeckoTerminal HTTP 429',deferred:true});
  });
});
