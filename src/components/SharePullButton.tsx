'use client';

import { useState } from 'react';

type SharePullButtonProps = {
  rollId: number | string;
  symbol: string;
};

export default function SharePullButton({ rollId, symbol }: SharePullButtonProps) {
  const [copied, setCopied] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/verify/${encodeURIComponent(String(rollId))}`;
    const text = `I unboxed $${symbol} on Lockabox`;
    setShareFailed(false);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${text}`, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const input = document.createElement('textarea');
        input.value = url; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0';
        document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setShareFailed(true);
    }
  };

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/verify/${encodeURIComponent(String(rollId))}`;
  const text = `I unboxed $${symbol} on Lockabox`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return <span className="share-control"><button className="button button-outline" onClick={() => void share()}>{copied ? 'Copied' : 'Share'}</button>{(copied || shareFailed) && <a className="share-x" href={xUrl} target="_blank" rel="noreferrer">Post on X ↗</a>}</span>;
}
