import { describe, expect, it } from 'vitest';
import { fairBatches, retrySeconds } from '../../worker/enrichment';
import { normalizeAssetAddress, pairsToAssets } from '@/modules/sources/normalize';
import type { DexScreenerPair } from '@/modules/sources/dexscreener';

describe('ingest identity and queues', () => {
  it('folds EVM casing only, retaining Solana and unknown-family bytes', () => {
    expect(normalizeAssetAddress('base','0xAbC')).toBe('0xabc');
    expect(normalizeAssetAddress('solana','AbC')).toBe('AbC');
    expect(normalizeAssetAddress('unknown','AbC')).toBe('AbC');
    const pair = (address:string,usd:number) => ({chainId:'base',baseToken:{address},liquidity:{usd}} as DexScreenerPair);
    const rows = pairsToAssets([pair('0xAbC',2000),pair('0xabc',3000)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({address:'0xabc',liquidityUsd:3000});
  });
  it('reserves turns for small chains despite a large EVM backlog', () => {
    const rows=Array.from({length:600},(_,i)=>({id:i,chain_id:'base',family:'evm',address:String(i),refresh_failures:0,refresh_attempted_at:null}));
    rows.push({id:900,chain_id:'solana',family:'solana',address:'CaseSensitive',refresh_failures:0,refresh_attempted_at:null});
    const batches=fairBatches(rows,3);
    expect(batches.map(b=>b[0].chain_id)).toEqual(['base','solana','base']);
    expect(batches.every(b=>b.length<=30)).toBe(true);
    expect(rows).toHaveLength(601);
  });
  it('backs off unavailable tokens with capped retries and quicker transport retries', () => {
    expect([0,1,2,20].map(n=>retrySeconds(n))).toEqual([300,600,1200,21600]);
    expect([0,1,20].map(n=>retrySeconds(n,true))).toEqual([60,120,900]);
  });
});
