export const DEFAULT_TIER_THRESHOLDS = {
  small: 100_000,
  mid: 1_000_000,
  large: 10_000_000,
  top: 100_000_000,
} as const;

export type MarketCapTier = "micro" | "small" | "mid" | "large" | "top";
export type TierThresholds = typeof DEFAULT_TIER_THRESHOLDS;

export function marketCapTier(
  marketCap: number | null,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): MarketCapTier | null {
  if (marketCap === null || Number.isNaN(marketCap) || marketCap <= 0) return null;
  if (marketCap >= thresholds.top) return "top";
  if (marketCap >= thresholds.large) return "large";
  if (marketCap >= thresholds.mid) return "mid";
  if (marketCap >= thresholds.small) return "small";
  return "micro";
}
