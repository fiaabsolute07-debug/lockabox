import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { sql } from '@/lib/db';
import { buildPool, eligibleItems, getCase } from '@/modules/cases/pools';
import { filterPool } from '@/modules/rolls/service';
import { upsertDiscovered, saveSnapshots, runCycle } from '../../worker/ingest';
import { enrichAssets } from '../../worker/enrichment';
import { discoverNewPools } from '../../worker/discovery';
import type { DexPaprikaClient, DexScreenerClient } from '@/modules/sources';
import { killAsset, unkillAsset } from '@/modules/admin/service';

const run=process.env.RUN_DB_INTEGRATION ? describe : describe.skip;
const enabled=new Set(['base','solana']);
const pair=(chainId:string,address:string)=>({chainId,baseToken:{address,symbol:'MEME',name:'Meme'},dexId:'test',pairAddress:`pool-${address}`,liquidity:{usd:20000},marketCap:500000,priceUsd:'1',pairCreatedAt:Date.now()-86400_000});

run('ingest identity, discovery and queues',()=>{
  beforeEach(async()=>{
    await sql.unsafe('truncate assets, discovery_state, discovery_requests, worker_runs, server_seeds, devices restart identity cascade');
  });

  it('merges pre-existing EVM duplicates without rewriting proof history or Solana addresses',async()=>{
    // Exercise the real migration against the old schema, rolled back at the end of the fixture.
    const rollback=new Error('rollback migration fixture');
    await expect(sql.begin(async(tx)=>{
      await tx`create schema ingest_identity_fixture`;
      await tx`set local search_path to ingest_identity_fixture, public`;
      const names=readdirSync('db/migrations').filter(n=>n.endsWith('.sql')).sort();
      for(const name of names.filter(n=>n<'0014')) await tx.unsafe(readFileSync(`db/migrations/${name}`,'utf8'));
      await tx`insert into assets(id,chain_id,address,symbol,sources) values
        (1,'base','0xabc',null,${['paprika:new']}),(2,'base','0xAbC','MEME',${['ds:top']}),
        (3,'solana','AbC','A','{}'),(4,'solana','abc','B','{}')`;
      await tx`insert into asset_snapshots(asset_id,taken_at,market_cap) values(1,now()-interval '1 hour',100),(2,now(),200)`;
      await tx`insert into gate_results(asset_id,gate,passed,reason) values(1,'liquidity',true,'ok'),(2,'liquidity',false,'low')`;
      await tx`insert into moderation(asset_id,reason,actor) values(2,'test kill','test')`;
      await tx`insert into case_pools(id,case_id,chain_scope,version,items,hash,size) values(1,'trending','all',1,'[{"a":2,"t":"micro"}]','frozen-proof',1)`;
      await tx`insert into devices(id) values('migration-device')`;
      await tx`insert into server_seeds(id,seed,hash) values(1,'old-seed','old-hash')`;
      await tx`insert into rolls(device_id,case_id,pool_id,server_seed_id,client_seed,nonce,items,items_hash,r_tier,r_item,tier,result_asset_id)
        values('migration-device','trending',1,1,'client',1,'[{"a":2,"t":"micro"}]','roll-proof',0.1,0.1,'micro',2)`;
      const [before]=await tx`select row_to_json(r) as proof from rolls r`;
      await tx.unsafe(readFileSync('db/migrations/0014_ingest_identity_queues.sql','utf8'));
      const assets=await tx`select id,address,merged_into,sources,symbol from assets order by id`;
      expect(assets.map(a=>[Number(a.id),a.address,a.merged_into&&Number(a.merged_into)])).toEqual([[1,'0xabc',null],[2,'0xAbC',1],[3,'AbC',null],[4,'abc',null]]);
      expect(assets[0].sources.sort()).toEqual(['ds:top','paprika:new']);
      expect(assets[0].symbol).toBe('MEME');
      expect((await tx`select market_cap from asset_snapshots where asset_id=1`)[0].market_cap).toBe(200);
      expect((await tx`select passed from gate_results where asset_id=1`)[0].passed).toBe(false);
      expect((await tx`select reason from moderation where asset_id=1`)[0].reason).toBe('test kill');
      expect((await tx`select row_to_json(r) as proof from rolls r`)[0].proof).toEqual(before.proof);
      expect((await tx`select hash from case_pools`)[0].hash).toBe('frozen-proof');
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it('normalizes ingestion and DB writes, merges sources, and resolves moderation aliases',async()=>{
    await upsertDiscovered(sql,[{chainId:'base',address:'0xAbC',source:'paprika:new'},{chainId:'base',address:'0xabc',source:'ds:top'},
      {chainId:'solana',address:'AbC',source:'ds:top'},{chainId:'solana',address:'abc',source:'ds:top'}],enabled);
    expect((await sql`select count(*)::int as n from assets`)[0].n).toBe(3);
    const [a]=await sql`select id,sources from assets where chain_id='base'`;
    expect(a.sources.sort()).toEqual(['ds:top','paprika:new']);
    const [alias]=await sql`insert into assets(chain_id,address,merged_into) values('base','0xABC',${a.id}) returning id`;
    await killAsset(Number(alias.id),'alias kill','test');
    expect((await sql`select asset_id from moderation`).map(r=>Number(r.asset_id))).toEqual([Number(a.id)]);
    await unkillAsset(Number(alias.id),'restore','test');
    expect(await sql`select * from moderation`).toHaveLength(0);
  });

  it('hydrates across chains, retries empty results later, and refreshes tokens first seen over 7 days ago',async()=>{
    await upsertDiscovered(sql,Array.from({length:60},(_,i)=>({chainId:'base',address:`0x${i}`,source:'paprika:new'})),enabled);
    await upsertDiscovered(sql,[{chainId:'solana',address:'SoLaNa',source:'paprika:new'}],enabled);
    const tokens=vi.fn(async(chain:string,addresses:string[])=>addresses.filter(a=>a!=='0x0').map(a=>pair(chain,a)));
    const ds={tokens} as unknown as DexScreenerClient;
    const first=await enrichAssets(sql,ds,enabled,saveSnapshots,()=>{});
    expect(first.saved).toBe(60);
    expect(tokens.mock.calls.map(c=>c[0])).toEqual(['base','solana','base']);
    const [failed]=await sql`select refresh_failures,refresh_error,next_refresh_at>now() as deferred from assets where address='0x0'`;
    expect(failed).toMatchObject({refresh_failures:1,refresh_error:'no_pair_returned',deferred:true});
    tokens.mockClear();
    expect((await enrichAssets(sql,ds,enabled,saveSnapshots,()=>{})).due).toBe(0);
    await sql`update assets set first_seen_at=now()-interval '30 days',next_refresh_at=now() where address='SoLaNa'`;
    await sql`update asset_snapshots set taken_at=now()-interval '5 minutes' where asset_id=(select id from assets where address='SoLaNa')`;
    expect((await enrichAssets(sql,ds,enabled,saveSnapshots,()=>{})).saved).toBe(1);
    expect(tokens.mock.calls[0]).toEqual(['solana',['SoLaNa']]);
  });

  it('Discover is feed-independent, excludes old ages by filter, and clears a pool when all become ineligible',async()=>{
    await upsertDiscovered(sql,[{chainId:'base',address:'0xnew',source:'paprika:new'}],enabled);
    const ds={tokens:async()=>[pair('base','0xnew')]} as unknown as DexScreenerClient;
    await enrichAssets(sql,ds,enabled,saveSnapshots,()=>{});
    const c=(await getCase('discover'))!;
    expect(await eligibleItems((await getCase('trending'))!,'all')).toHaveLength(0);
    const p=await buildPool(c,'all');
    expect(p!.size).toBe(1);
    expect(await filterPool(p!.items,{maxAgeHours:168})).toHaveLength(1);
    await sql`update asset_snapshots set pair_created_at=now()-interval '8 days'`;
    expect(await filterPool(p!.items,{maxAgeHours:168})).toHaveLength(0);
    expect(await filterPool(p!.items,{})).toHaveLength(1);
    await sql`update asset_snapshots set taken_at=now()-interval '16 minutes'`;
    expect(await filterPool(p!.items,{})).toHaveLength(0);
    const empty=await buildPool(c,'all');
    expect(empty!.size).toBe(0);
    expect(empty!.version).toBe(p!.version+1);
  });

  it('hydrates just-discovered pairs before an older never-attempted backlog',async()=>{
    await upsertDiscovered(sql,Array.from({length:300},(_,i)=>({chainId:'base',address:`0xold${i}`,source:'paprika:new'})),enabled);
    await sql`update assets set first_seen_at=now()-interval '2 days'`;
    await upsertDiscovered(sql,[{chainId:'base',address:'0xjustlaunched',source:'paprika:new',pairCreatedAt:new Date()}],enabled);
    const tokens=vi.fn(async(chain:string,addresses:string[])=>addresses.map(a=>pair(chain,a)));
    await enrichAssets(sql,{tokens} as unknown as DexScreenerClient,enabled,saveSnapshots,()=>{});
    expect(tokens.mock.calls[0][1]).toEqual(['0xjustlaunched']);
    expect(tokens.mock.calls.slice(1).flatMap(c=>c[1])).toHaveLength(300);
  });

  it('persists cursors across runs, catches >100 pools and stops at the previous watermark',async()=>{
    const old=new Date(Date.now()-3600_000), fresh=new Date(Date.now()-1000);
    const pool=(i:number,createdAt:Date)=>({id:`pool${i}`,chain:'base',dex_id:'test',created_at:createdAt.toISOString(),liquidity_usd:10,tokens:[{id:`0x${i}`,chain:'base'}]});
    await sql`insert into discovery_state(chain_id,watermark) values('base',${old})`;
    const searchPools=vi.fn().mockResolvedValueOnce({results:Array.from({length:100},(_,i)=>pool(i,fresh)),hasNextPage:true,nextCursor:'page2'})
      .mockResolvedValueOnce({results:[pool(101,fresh),pool(102,new Date(old.getTime()-1000))],hasNextPage:true,nextCursor:'page3'});
    const dp={searchPools} as unknown as DexPaprikaClient;
    const chains=[{id:'base',dexpaprika_id:'base'}];
    // Grant exactly one paced slot, so continuation must survive another invocation.
    await sql`insert into discovery_requests(chain_id,requested_at) values('base',now()-interval '6 minutes')`;
    expect((await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{})).pages).toBe(1);
    expect((await sql`select cursor,watermark from discovery_state`)[0]).toMatchObject({cursor:'page2',watermark:old});
    await sql`update discovery_requests set requested_at=now()-interval '6 minutes'`;
    await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{});
    expect(searchPools.mock.calls[1][1].cursor).toBe('page2');
    expect((await sql`select count(*)::int as n from assets`)[0].n).toBe(101);
    expect((await sql`select cursor,watermark from discovery_state`)[0]).toMatchObject({cursor:null,watermark:fresh});
    expect((await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{})).pages).toBe(0);
  });

  it('backs off provider failures without advancing the watermark and respects quota',async()=>{
    const searchPools=vi.fn().mockRejectedValue(new Error('HTTP 429'));
    const dp={searchPools} as unknown as DexPaprikaClient;
    const chains=[{id:'base',dexpaprika_id:'base'}];
    await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{});
    expect(searchPools).toHaveBeenCalledTimes(1);
    expect((await sql`select cursor,watermark,failures,next_poll_at>now() as deferred from discovery_state`)[0]).toMatchObject({cursor:null,watermark:null,failures:1,deferred:true});
    await sql`insert into worker_runs(started_at,ok,paprika_calls) values(now(),true,8000)`;
    await sql`update discovery_state set next_poll_at=now()`;
    await sql`update discovery_requests set requested_at=now()-interval '1 hour'`;
    expect((await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{})).pages).toBe(0);
    expect(searchPools).toHaveBeenCalledTimes(1);
  });

  it('checks the fresh head during long backfills without skipping or starving continuation',async()=>{
    const watermark=new Date(Date.now()-86400_000), head=new Date(Date.now()-3600_000);
    await sql`insert into discovery_state(chain_id,cursor,watermark,scan_head,last_head_at) values('base','backfill-page',${watermark},${head},now()-interval '1 hour')`;
    const searchPools=vi.fn().mockResolvedValue({results:[{id:'fresh',chain:'base',dex_id:'test',created_at:new Date(Date.now()-1000).toISOString(),tokens:[{id:'0xfresh',chain:'base'}]}],hasNextPage:true,nextCursor:'new-page'});
    const dp={searchPools} as unknown as DexPaprikaClient, chains=[{id:'base',dexpaprika_id:'base'}];
    await sql`insert into discovery_requests(chain_id,requested_at) values('base',now()-interval '6 minutes')`;
    await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{});
    expect(searchPools.mock.calls[0][1].cursor).toBeUndefined();
    expect((await sql`select cursor,watermark,scan_head from discovery_state`)[0]).toMatchObject({cursor:'backfill-page',watermark,scan_head:head});
    await sql`update discovery_requests set requested_at=now()-interval '6 minutes'`;
    await discoverNewPools(sql,dp,chains,enabled,upsertDiscovered,()=>{});
    expect(searchPools.mock.calls[1][1].cursor).toBe('backfill-page');
  });

  it('does not execute a cycle when another worker owns the lock',async()=>{
    const connection=await sql.reserve();
    try{
      await connection`select pg_advisory_lock(hashtext('lockabox:ingest'))`;
      expect(await runCycle({sql,log:()=>{}})).toEqual({skipped:true});
    }finally{await connection`select pg_advisory_unlock(hashtext('lockabox:ingest'))`;connection.release();}
  });

  it('shuts down an idle worker on SIGTERM without stranding its reserved connection',async()=>{
    const connection=await sql.reserve();
    await connection`select pg_advisory_lock(hashtext('lockabox:ingest'))`;
    const child=spawn(process.execPath,['--import','tsx','worker/index.ts'],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});
    try{
      const exited=new Promise<number|null>((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('worker did not reach idle state')),8000);
        child.stdout.on('data',b=>{if(String(b).includes('cycle skipped')){clearTimeout(timer);resolve();}});
        child.once('error',e=>{clearTimeout(timer);reject(e);});
      });
      child.kill('SIGTERM');
      expect(await exited).toBe(0);
    }finally{
      if(child.exitCode===null) child.kill('SIGKILL');
      await connection`select pg_advisory_unlock(hashtext('lockabox:ingest'))`;connection.release();
    }
  },10000);
});

afterAll(()=>sql.end());
