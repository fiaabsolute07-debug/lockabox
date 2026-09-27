import { CHAIN_LOGOS } from './chainLogos';

/** A chain's logo (self-hosted, /public/chains) or a lettered badge when we have none. Decorative: the name is always shown next to it. */
export function ChainIcon({ id, name, size = 16 }: { id: string | null | undefined; name?: string; size?: number }) {
  if (!id) return null;
  if (id === 'all') return <span className="chain-dot all" aria-hidden="true" style={{ width: size, height: size, flexBasis: size }} />;
  const src = CHAIN_LOGOS[id];
  // eslint-disable-next-line @next/next/no-img-element -- tiny static icons from /public; next/image adds nothing here
  if (src) return <img className="chain-icon" src={src} alt="" width={size} height={size} loading="lazy" decoding="async" />;
  return <span className="chain-icon chain-letter" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}>{(name ?? id).slice(0, 1).toUpperCase()}</span>;
}
