import { z } from "zod";

import {
  createHttpClient,
  createLimiter,
  type RateLimiter,
  type SourceHttpClient,
  type SourceHttpOptions,
} from "./http";

export const DEXPAPRIKA_BASE_URL = "https://api.dexpaprika.com";

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const dexPaprikaNetworkSchema = z.looseObject({
  display_name: z.string(),
  id: z.string(),
  volume_usd_24h: nullableNumber,
  txns_24h: nullableNumber,
  pools_count: nullableNumber,
});

export const dexPaprikaTokenSchema = z.looseObject({
  id: z.string(),
  chain: z.string(),
  has_image: z.boolean().nullable().optional(),
  no_index: z.boolean().nullable().optional(),
});

export const dexPaprikaPoolSchema = z.looseObject({
  id: z.string(),
  dex_id: z.string(),
  dex_name: nullableString,
  chain: z.string(),
  volume_usd_24h: nullableNumber,
  created_at: z.string(),
  created_at_block_number: nullableNumber,
  transactions_24h: nullableNumber,
  price_usd: nullableNumber,
  price_change_percentage_5m: nullableNumber,
  price_change_percentage_1h: nullableNumber,
  price_change_percentage_6h: nullableNumber,
  price_change_percentage_24h: nullableNumber,
  fee: z.number().nullable().optional(),
  volume_usd_7d: nullableNumber,
  volume_usd_30d: nullableNumber,
  liquidity_usd: nullableNumber,
  tokens: z.array(dexPaprikaTokenSchema),
});

export const dexPaprikaMultiPriceSchema = z.looseObject({
  chain: z.string(),
  id: z.string(),
  price_usd: nullableNumber,
  last_updated: nullableString,
});

export const dexPaprikaSearchResponseSchema = z.looseObject({
  results: z.array(dexPaprikaPoolSchema),
  has_next_page: z.boolean(),
  next_cursor: nullableString,
});

export type DexPaprikaNetwork = z.infer<typeof dexPaprikaNetworkSchema>;
export type DexPaprikaToken = z.infer<typeof dexPaprikaTokenSchema>;
export type DexPaprikaPool = z.infer<typeof dexPaprikaPoolSchema>;
export type DexPaprikaMultiPrice = z.infer<typeof dexPaprikaMultiPriceSchema>;
export type DexPaprikaSearchResponse = z.infer<typeof dexPaprikaSearchResponseSchema>;

export interface SearchPoolsOptions {
  orderBy?: "created_at" | "volume_usd" | "liquidity_usd";
  sort?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface DexPaprikaClientOptions extends SourceHttpOptions {
  apiKey?: string;
  http?: SourceHttpClient;
  limiter?: RateLimiter;
  now?: () => number;
}

export class DexPaprikaClient {
  readonly limiter: RateLimiter;
  private readonly apiKey: string | undefined;
  private readonly http: SourceHttpClient;
  private _creditsUsed = 0;

  constructor(options: DexPaprikaClientOptions = {}) {
    this.apiKey = options.apiKey || undefined;
    this.http = options.http ?? createHttpClient(options);
    this.limiter =
      options.limiter ??
      createLimiter({ perMinute: this.apiKey ? 30 : 15, now: options.now, sleep: options.sleep });
  }

  get creditsUsed(): number {
    return this._creditsUsed;
  }

  private headers(): Headers {
    const headers = new Headers();
    if (this.apiKey) headers.set("Authorization", this.apiKey);
    return headers;
  }

  private url(path: string): string {
    return `${DEXPAPRIKA_BASE_URL}${path}`;
  }

  async networks(): Promise<DexPaprikaNetwork[]> {
    this._creditsUsed += 1;
    const payload = await this.http.getJson<unknown>(this.url("/networks"), {
      headers: this.headers(),
      limiter: this.limiter,
    });
    return z.array(dexPaprikaNetworkSchema).parse(payload);
  }

  async searchPools(
    network: string,
    options: SearchPoolsOptions = {},
  ): Promise<{ results: DexPaprikaPool[]; hasNextPage: boolean; nextCursor: string | null }> {
    const orderBy = options.orderBy ?? "created_at";
    const sort = options.sort ?? "desc";
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
      throw new RangeError("DexPaprika pool search limit must be an integer from 1 to 100");
    }

    const params = new URLSearchParams({
      order_by: orderBy,
      sort,
      limit: String(limit),
    });
    if (options.cursor) params.set("cursor", options.cursor);

    this._creditsUsed += 1;
    const payload = await this.http.getJson<unknown>(
      this.url(`/networks/${encodeURIComponent(network)}/pools/search?${params.toString()}`),
      { headers: this.headers(), limiter: this.limiter },
    );
    const parsed = dexPaprikaSearchResponseSchema.parse(payload);
    return {
      results: parsed.results,
      hasNextPage: parsed.has_next_page,
      nextCursor: parsed.next_cursor ?? null,
    };
  }

  async multiPrices(network: string, tokens: string[]): Promise<{ address: string; priceUsd: number | null; lastUpdated: string | null }[]> {
    if (tokens.length === 0) return [];
    const output: { address: string; priceUsd: number | null; lastUpdated: string | null }[] = [];
    for (let offset = 0; offset < tokens.length; offset += 10) {
      const batch = tokens.slice(offset, offset + 10);
      const query = batch.map((token) => encodeURIComponent(token)).join(',');
      this._creditsUsed += 1;
      const payload = await this.http.getJson<unknown>(
        this.url(`/networks/${encodeURIComponent(network)}/multi/prices?tokens=${query}`),
        { headers: this.headers(), limiter: this.limiter },
      );
      const parsed = z.array(dexPaprikaMultiPriceSchema).parse(payload);
      output.push(...parsed.map((item) => ({ address: item.id, priceUsd: item.price_usd ?? null, lastUpdated: item.last_updated ?? null })));
    }
    return output;
  }
}

export function createDexPaprikaClient(options: DexPaprikaClientOptions = {}): DexPaprikaClient {
  return new DexPaprikaClient(options);
}
