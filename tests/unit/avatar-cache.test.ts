import { describe,it,expect,vi } from 'vitest';
import { allowedImageSource, downloadAvatar, rasterType, MAX_IMAGE_BYTES } from '../../worker/image-cache';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
describe('avatar download boundary',()=>{
  it('rejects untrusted hosts, credentials, ports and non-HTTPS',()=>{
    for(const url of ['http://cdn.dexscreener.com/a','https://127.0.0.1/a','https://cdn.dexscreener.com.evil.test/a','https://user:pw@cdn.dexscreener.com/a','https://cdn.dexscreener.com:444/a','https://example.com/a']) expect(allowedImageSource(url)).toBe(false);
    expect(allowedImageSource('https://cdn.dexscreener.com/a')).toBe(true);
  });
  it('accepts raster signatures, rejects SVG/HTML despite declared image type',async()=>{
    expect(rasterType(png)).toBe('image/png');
    expect(rasterType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    await expect(downloadAvatar('https://cdn.dexscreener.com/a',async()=>new Response('<html>not an image</html>',{headers:{'content-type':'image/png'}}))).rejects.toThrow('unsupported_image_format');
  });
  it('enforces streaming and declared size limits; does not follow redirects',async()=>{
    await expect(downloadAvatar('https://cdn.dexscreener.com/a',async()=>new Response(new Uint8Array(MAX_IMAGE_BYTES+1)))).rejects.toThrow('image_too_large');
    const fetcher=vi.fn<typeof fetch>(async()=>new Response(new Uint8Array(png)));
    expect((await downloadAvatar('https://cdn.dexscreener.com/a',fetcher)).bytes).toEqual(png);
    expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error'});
  });
});
