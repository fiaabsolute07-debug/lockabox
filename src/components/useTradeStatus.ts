'use client';

import { useEffect, useState } from 'react';
import { fetchJson } from './api';

export type TradeFinal = 'confirmed' | 'failed';

/**
 * AC-042: after the wallet sent a buy, follow the trade until the worker marks it confirmed or failed on-chain
 * (`GET /api/trades/:id`). Polls every 4 s for up to 15 minutes; network errors just wait for the next poll.
 */
export function useTradeStatus(tradeId: number | null, intervalMs = 4_000): TradeFinal | null {
  const [final, setFinal] = useState<{ id: number; status: TradeFinal } | null>(null);
  useEffect(() => {
    if (tradeId === null) return;
    let stopped = false;
    const deadline = Date.now() + 15 * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const t = await fetchJson<{ status: string }>(`/api/trades/${tradeId}`);
        if (!stopped && (t.status === 'confirmed' || t.status === 'failed')) { setFinal({ id: tradeId, status: t.status }); return; }
      } catch { /* try again */ }
      if (!stopped && Date.now() < deadline) timer = setTimeout(() => void poll(), intervalMs);
    };
    timer = setTimeout(() => void poll(), intervalMs);
    return () => { stopped = true; clearTimeout(timer); };
  }, [tradeId, intervalMs]);
  return final && final.id === tradeId ? final.status : null;
}
