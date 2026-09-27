import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { problem } from '@/lib/api';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Share image for one pull (AC-046). 1200×630 PNG: the coin, its tier, the case and the verify link.
 * It never carries an invite/referral link or code, and it states no price, gain or promise.
 */
const TIER: Record<string, { label: string; color: string }> = {
  micro: { label: 'Micro', color: '#B0B7C3' }, small: { label: 'Small', color: '#4B69FF' }, mid: { label: 'Mid', color: '#8847FF' },
  large: { label: 'Large', color: '#D32CE6' }, top: { label: 'Top', color: '#FFB21A' },
};

// Inter (SIL OFL 1.1), bundled so the image never depends on a font download at request time.
type OgFont = { name: string; data: Buffer; weight: 500 | 800; style: 'normal' };
let fonts: OgFont[] | null = null;
async function loadFonts(): Promise<OgFont[] | undefined> {
  if (fonts) return fonts;
  try {
    fonts = await Promise.all(([500, 800] as const).map(async (weight) => ({
      name: 'Inter', weight, style: 'normal' as const, data: await readFile(path.join(process.cwd(), `src/assets/og/Inter-${weight}.ttf`)),
    })));
    return fonts;
  } catch (e) {
    console.error('og fonts missing, using the default font', (e as Error).message); // the image still renders; retried next request
    return undefined;
  }
}

function Star({ color }: { color: string }) {
  return <svg width="34" height="34" viewBox="0 0 24 24" style={{ marginRight: 10 }}><path fill={color} d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6z" /></svg>;
}

async function logoDataUrl(url: string | null): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(png|jpeg)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 400_000 ? null : `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

export async function GET(_req: Request, ctx: RouteContext<'/api/rolls/[id]/og'>) {
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id)) return problem(400, 'bad_id', 'invalid roll id');
  const [r] = await sql<{ tier: string; symbol: string | null; name: string | null; image_url: string | null; chain: string; case_title: string }[]>`
    select r.tier, a.symbol, a.name, a.image_url, c.name as chain, k.title as case_title
    from rolls r join assets a on a.id = r.result_asset_id join chains c on c.id = a.chain_id join cases k on k.id = r.case_id
    where r.id = ${id}`;
  if (!r) return problem(404, 'not_found', 'unknown roll');
  const tier = TIER[r.tier] ?? TIER.micro;
  const symbol = (r.symbol ?? r.name ?? 'TOKEN').replace(/^\$+/, '').slice(0, 14);
  const logo = await logoDataUrl(r.image_url);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0D0E12', color: '#F4F5F7', padding: 64, fontFamily: 'Inter', fontWeight: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 800 }}>
          lockabox<span style={{ color: '#FF5B1F' }}>.</span>
          <span style={{ marginLeft: 'auto', fontSize: 24, color: '#8A8F9C', fontWeight: 500 }}>{`${r.case_title} case · ${r.chain}`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 70 }}>
          <div style={{ width: 230, height: 230, borderRadius: 40, border: `6px solid ${tier.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#16181F', overflow: 'hidden' }}>
            {/* ImageResponse (satori) renders plain <img>; next/image does not apply here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo ? <img src={logo} alt="" width={218} height={218} style={{ objectFit: 'cover' }} /> : <span style={{ fontSize: 120, fontWeight: 800, color: tier.color }}>{symbol[0]}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56 }}>
            <span style={{ fontSize: 30, color: '#8A8F9C', letterSpacing: 4 }}>I UNBOXED</span>
            <span style={{ fontSize: 110, fontWeight: 800, lineHeight: 1.05, letterSpacing: -3 }}>{`$${symbol}`}</span>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: 40, fontWeight: 800, color: tier.color, marginTop: 8 }}>{r.tier === 'top' && <Star color={tier.color} />}{tier.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 24, color: '#8A8F9C' }}>
          <span>{`Provably fair · verify at lockabox.fun/verify/${id}`}</span>
          <span style={{ marginLeft: 'auto' }}>Random pick, not advice</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await loadFonts(), headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
