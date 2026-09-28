import { describe, expect, it } from 'vitest';
import { pairsToAssets } from '@/modules/sources/normalize';
import { tokenImageUrl } from '@/modules/sources/images';
import { geckoImages } from '../../worker/images';

const pair = (chainId: string, address: string, liquidity: number, imageUrl: string | null) => ({ chainId, baseToken: { address }, quoteToken: {address:'quote'}, dexId: 'test', pairAddress: `pool-${liquidity}`, liquidity: { usd: liquidity }, info: { imageUrl } });
describe('token images', () => {
  it('keeps the deepest market but borrows an image only from the same chain and token', () => {
    const rows = pairsToAssets([pair('base','0xAbC',10,'https://example.com/a.png'),pair('base','0xabc',100,null),pair('ethereum','0xabc',100,'https://example.com/eth.png'),pair('base','0xdef',100,null)]);
    expect(rows[0]).toMatchObject({ pairAddress:'pool-100',liquidityUsd:100,imageUrl:'https://example.com/a.png' });
    expect(rows[2].imageUrl).toBeNull();
    expect(pairsToAssets([pair('solana','AbC',1,'https://example.com/a.png'),pair('solana','abc',10,null)])[1].imageUrl).toBeNull();
  });
  it('rejects executable, empty and non-HTTPS metadata', () => {
    for (const url of ['',null,'javascript:alert(1)','data:image/svg+xml,test','http://example.com/a.png','https://localhost/a','https://user:pass@example.com/a']) expect(tokenImageUrl(url)).toBeNull();
  });
  it('verifies provider network and address instead of matching a ticker', () => {
    const row = (id: string,address: string,image_url: string) => ({ id,type:'token',attributes:{address,image_url} });
    const result = geckoImages({data:[row('base_0xAbC','0xAbC','https://example.com/a.png'),row('eth_0xdef','0xdef','https://example.com/b.png'),row('base_0x123','0x123','https://example.com/missing.png')]},'base');
    expect([...result]).toEqual([['0xabc','https://example.com/a.png']]);
    expect(() => geckoImages({},'base')).toThrow();
  });
  it('looks up Arc and Robinhood tokens under their GeckoTerminal network ids', () => {
    const row = (id: string,address: string) => ({ id,type:'token',attributes:{address,image_url:'https://example.com/a.png'} });
    expect([...geckoImages({data:[row('arc_0xaa','0xaa')]},'arc')]).toEqual([['0xaa','https://example.com/a.png']]);
    expect([...geckoImages({data:[row('robinhood_0xbb','0xbb')]},'robinhood')]).toEqual([['0xbb','https://example.com/a.png']]);
  });
});
