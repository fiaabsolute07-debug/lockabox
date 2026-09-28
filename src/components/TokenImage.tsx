'use client';

import { useEffect, useState } from 'react';
import { tokenImageUrl } from '@/modules/sources/images';

/** A URL change resets retries without leaking timers between tokens. */
export default function TokenImage({ src, symbol, identity }: { src?: string | null; symbol: string; identity?: string }) {
  const url = tokenImageUrl(src);
  return <RetryingImage key={`${identity}:${url}`} url={url} symbol={symbol} identity={identity ?? symbol} />;
}

function RetryingImage({ url, symbol, identity }: { url: string | null; symbol: string; identity: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url || !failed || attempt >= 2) return;
    // Remove/remount the image without changing signed or provider-specific query strings.
    const timer = window.setTimeout(() => { setAttempt(value => value + 1); setFailed(false); }, attempt === 0 ? 1500 : 4000);
    return () => window.clearTimeout(timer);
  }, [url, failed, attempt]);
  if (!url || failed) {
    let hash=2166136261;for(const char of identity) hash=Math.imul(hash^char.charCodeAt(0),16777619);
    const hue=(hash>>>0)%360;
    return <span aria-label={`${symbol} image unavailable`} title="Generated placeholder — original logo unavailable" style={{width:'100%',height:'100%',display:'grid',placeItems:'center',borderRadius:'inherit',color:'#fff',background:`linear-gradient(135deg,hsl(${hue} 55% 32%),hsl(${(hue+70)%360} 65% 22%))`}}>{symbol[0] || '?'}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img key={attempt} src={url} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', gridArea: '1 / 1', minWidth: 0, minHeight: 0 }} />;
}
