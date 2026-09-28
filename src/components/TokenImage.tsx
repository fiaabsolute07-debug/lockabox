'use client';

import { useState } from 'react';
import { tokenImageUrl } from '@/modules/sources/images';

/** Fits inside existing coin frames, preserving rarity halos. Broken images get initials. */
export default function TokenImage({ src, symbol }: { src?: string | null; symbol: string }) {
  const url = tokenImageUrl(src);
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <span aria-label={`${symbol} image unavailable`}>{symbol[0] || '?'}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" referrerPolicy="no-referrer" decoding="async" onError={() => setFailed(url)} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', gridArea: '1 / 1', minWidth: 0, minHeight: 0 }} />;
}
