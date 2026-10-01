'use client';

import { useT } from './i18n';

/** A-ADS ad unit id (aads.com → Ad units). Unset: no ad is shown. */
const UNIT = process.env.NEXT_PUBLIC_AADS_UNIT_ID?.trim();

/**
 * One A-ADS banner above the footer, never near the buy, wallet or case-opening flows (DECISIONS #24).
 * A-ADS finds the unit by the iframe's `data-aa` attribute in the page HTML, so this renders on the server too.
 * The iframe matches A-ADS's own embed code (their placement rules ask for no sandbox; with one it was reported not found). Being
 * cross-origin, the ad still can't read the page or the wallet connection.
 */
export function AdSlot() {
  const { t } = useT();
  if (!UNIT || !/^\d+$/.test(UNIT)) return null;
  return (
    <aside className="ad-slot" aria-label={t('adLabel')}>
      <span className="ad-label">{t('adLabel')}</span>
      <iframe
        data-aa={UNIT}
        src={`https://acceptable.a-ads.com/${UNIT}/?size=Adaptive`}
        title={t('adLabel')}
      />
    </aside>
  );
}
