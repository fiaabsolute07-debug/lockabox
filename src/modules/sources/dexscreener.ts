import { z } from "zod";

import {
  createHttpClient,
  createLimiter,
  type RateLimiter,
  type SourceHttpClient,
  type SourceHttpOptions,
} from "./http";

export const DEXSCREENER_BASE_URL = "https://api.dexscreener.com";

const optionalNullableNumber = z.number().nullable().optional();
const optionalNullableString = z.string().nullable().optional();

export const dexScreenerLinkSchema = z.looseObject({
  label: optionalNullableString,
  type: optionalNullableString,
  url: optionalNullableString,
});

export const dexScreenerTokenSchema = z.looseObject({
  address: z.string(),
  name: optionalNullableString,
  symbol: optionalNullableString,
});

const dexScreenerTxnWindowSchema = z.looseObject({
  buys: optionalNullableNumber,
  sells: optionalNullableNumber,
});

export const dexScreenerPairInfoSchema = z.looseObject({
  imageUrl: optionalNullableString,
  header: optionalNullableString,
  openGraph: optionalNullableString,
  websites: z.array(z.looseObject({ url: optionalNullableString, label: optionalNullableString })).nullable().optional(),
  socials: z.array(z.looseObject({ url: optionalNullableString, type: optionalNullableString })).nullable().optional(),
});

export const dexScreenerPairSchema = z.looseObject({
  chainId: z.string(),
  dexId: z.string(),
  url: optionalNullableString,
  pairAddress: z.string(),
  labels: z.array(z.string()).nullable().optional(),
  baseToken: dexScreenerTokenSchema,
  quoteToken: dexScreenerTokenSchema,
  priceNative: z.union([z.string(), z.number()]).nullable().optional(),
  priceUsd: z.union([z.string(), z.number()]).nullable().optional(),
  txns: z
    .looseObject({
      m5: dexScreenerTxnWindowSchema.nullable().optional(),
      h1: dexScreenerTxnWindowSchema.nullable().optional(),
      h6: dexScreenerTxnWindowSchema.nullable().optional(),
      h24: dexScreenerTxnWindowSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  volume: z
    .looseObject({
      m5: optionalNullableNumber,
      h1: optionalNullableNumber,
      h6: optionalNullableNumber,
      h24: optionalNullableNumber,
    })
    .nullable()
    .optional(),
  priceChange: z
    .looseObject({
      m5: optionalNullableNumber,
      h1: optionalNullableNumber,
      h6: optionalNullableNumber,
      h24: optionalNullableNumber,
    })
    .nullable()
    .optional(),
  liquidity: z
    .looseObject({
      usd: optionalNullableNumber,
      base: optionalNullableNumber,
      quote: optionalNullableNumber,
    })
    .nullable()
    .optional(),
  fdv: optionalNullableNumber,
  marketCap: optionalNullableNumber,
  pairCreatedAt: optionalNullableNumber,
  info: dexScreenerPairInfoSchema.nullable().optional(),
  boosts: z
    .looseObject({ active: optionalNullableNumber })
    .nullable()
    .optional(),
});

export const dexScreenerProfileSchema = z.looseObject({
  url: z.string(),
  chainId: z.string(),
  tokenAddress: z.string(),
  icon: optionalNullableString,
  header: optionalNullableString,
  openGraph: optionalNullableString,
  description: optionalNullableString,
  links: z.array(dexScreenerLinkSchema).nullable().optional(),
  cto: z.boolean().nullable().optional(),
});

export const dexScreenerBoostSchema = z.looseObject({
  url: z.string(),
  chainId: z.string(),
  tokenAddress: z.string(),
  description: optionalNullableString,
  icon: optionalNullableString,
  header: optionalNullableString,
  openGraph: optionalNullableString,
  links: z.array(dexScreenerLinkSchema).nullable().optional(),
  totalAmount: optionalNullableNumber,
  amount: optionalNullableNumber,
});

export const dexScreenerCommunityTakeoverSchema = z.looseObject({
  url: z.string(),
  chainId: z.string(),
  tokenAddress: z.string(),
  icon: optionalNullableString,
  header: optionalNullableString,
  openGraph: optionalNullableString,
  description: optionalNullableString,
  links: z.array(dexScreenerLinkSchema).nullable().optional(),
  claimDate: optionalNullableString,
});

export const dexScreenerMetaSchema = z.looseObject({
  description: optionalNullableString,
  icon: z.looseObject({ type: optionalNullableString, value: optionalNullableString }).nullable().optional(),
  name: z.string(),
  slug: z.string(),
  marketCap: optionalNullableNumber,
  liquidity: optionalNullableNumber,
  volume: optionalNullableNumber,
  tokenCount: optionalNullableNumber,
  marketCapChange: z
    .looseObject({ m5: optionalNullableNumber, h1: optionalNullableNumber, h6: optionalNullableNumber, h24: optionalNullableNumber })
    .nullable()
    .optional(),
  marketCapDelta: z
    .looseObject({ m5: optionalNullableNumber, h1: optionalNullableNumber, h6: optionalNullableNumber, h24: optionalNullableNumber })
    .nullable()
    .optional(),
  pairs: z.array(dexScreenerPairSchema).nullable().optional(),
});

export const dexScreenerSearchResponseSchema = z.looseObject({
  schemaVersion: optionalNullableString,
  pairs: z.array(dexScreenerPairSchema),
});

export type DexScreenerPair = z.infer<typeof dexScreenerPairSchema>;
export type DexScreenerProfile = z.infer<typeof dexScreenerProfileSchema>;
export type DexScreenerBoost = z.infer<typeof dexScreenerBoostSchema>;
export type DexScreenerCommunityTakeover = z.infer<typeof dexScreenerCommunityTakeoverSchema>;
export type DexScreenerMeta = z.infer<typeof dexScreenerMetaSchema>;
export type DexScreenerSearchResponse = z.infer<typeof dexScreenerSearchResponseSchema>;

export interface DexScreenerClientOptions extends SourceHttpOptions {
  http?: SourceHttpClient;
  feedLimiter?: RateLimiter;
  pairsLimiter?: RateLimiter;
  now?: () => number;
}

const feedPaths = {
  tokenProfilesLatest: "/token-profiles/latest/v1",
  tokenProfilesRecentUpdates: "/token-profiles/recent-updates/v1",
  tokenBoostsLatest: "/token-boosts/latest/v1",
  tokenBoostsTop: "/token-boosts/top/v1",
  communityTakeoversLatest: "/community-takeovers/latest/v1",
  adsLatest: "/ads/latest/v1",
  metasTrending: "/metas/trending/v1",
} as const;

export class DexScreenerClient {
  readonly feedLimiter: RateLimiter;
  readonly pairsLimiter: RateLimiter;
  private readonly http: SourceHttpClient;

  constructor(options: DexScreenerClientOptions = {}) {
    this.http = options.http ?? createHttpClient(options);
    this.feedLimiter =
      options.feedLimiter ?? createLimiter({ perMinute: 60, now: options.now, sleep: options.sleep });
    this.pairsLimiter =
      options.pairsLimiter ?? createLimiter({ perMinute: 300, now: options.now, sleep: options.sleep });
  }

  private url(path: string): string {
    return `${DEXSCREENER_BASE_URL}${path}`;
  }

  private async feed<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const payload = await this.http.getJson<unknown>(this.url(path), { limiter: this.feedLimiter });
    return schema.parse(payload);
  }

  private async pair<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const payload = await this.http.getJson<unknown>(this.url(path), { limiter: this.pairsLimiter });
    return schema.parse(payload);
  }

  async tokenProfilesLatest(): Promise<DexScreenerProfile[]> {
    return this.feed(feedPaths.tokenProfilesLatest, z.array(dexScreenerProfileSchema));
  }

  async tokenProfilesRecentUpdates(): Promise<DexScreenerProfile[]> {
    return this.feed(feedPaths.tokenProfilesRecentUpdates, z.array(dexScreenerProfileSchema));
  }

  async tokenBoostsLatest(): Promise<DexScreenerBoost[]> {
    return this.feed(feedPaths.tokenBoostsLatest, z.array(dexScreenerBoostSchema));
  }

  async tokenBoostsTop(): Promise<DexScreenerBoost[]> {
    return this.feed(feedPaths.tokenBoostsTop, z.array(dexScreenerBoostSchema));
  }

  async communityTakeoversLatest(): Promise<DexScreenerCommunityTakeover[]> {
    return this.feed(feedPaths.communityTakeoversLatest, z.array(dexScreenerCommunityTakeoverSchema));
  }

  async adsLatest(): Promise<DexScreenerBoost[]> {
    return this.feed(feedPaths.adsLatest, z.array(dexScreenerBoostSchema));
  }

  async metasTrending(): Promise<DexScreenerMeta[]> {
    return this.feed(feedPaths.metasTrending, z.array(dexScreenerMetaSchema));
  }

  async meta(slug: string): Promise<DexScreenerMeta> {
    return this.feed(`/metas/meta/v1/${encodeURIComponent(slug)}`, dexScreenerMetaSchema);
  }

  async tokens(chainId: string, addresses: readonly string[]): Promise<DexScreenerPair[]> {
    if (addresses.length > 30) {
      throw new RangeError("DEX Screener tokens endpoint accepts at most 30 addresses");
    }
    return this.pair(
      `/tokens/v1/${encodeURIComponent(chainId)}/${addresses.join(",")}`,
      z.array(dexScreenerPairSchema),
    );
  }

  async tokenPairs(chainId: string, address: string): Promise<DexScreenerPair[]> {
    return this.pair(
      `/token-pairs/v1/${encodeURIComponent(chainId)}/${encodeURIComponent(address)}`,
      z.array(dexScreenerPairSchema),
    );
  }

  async search(query: string): Promise<DexScreenerSearchResponse> {
    const params = new URLSearchParams({ q: query });
    return this.pair(`/latest/dex/search?${params.toString()}`, dexScreenerSearchResponseSchema);
  }

  // Explicit aliases mirror the endpoint names and keep call sites readable.
  readonly latestTokenProfiles = this.tokenProfilesLatest.bind(this);
  readonly recentTokenProfileUpdates = this.tokenProfilesRecentUpdates.bind(this);
  readonly latestTokenBoosts = this.tokenBoostsLatest.bind(this);
  readonly topTokenBoosts = this.tokenBoostsTop.bind(this);
  readonly latestCommunityTakeovers = this.communityTakeoversLatest.bind(this);
  readonly latestAds = this.adsLatest.bind(this);
  readonly trendingMetas = this.metasTrending.bind(this);
}

export function createDexScreenerClient(options: DexScreenerClientOptions = {}): DexScreenerClient {
  return new DexScreenerClient(options);
}
