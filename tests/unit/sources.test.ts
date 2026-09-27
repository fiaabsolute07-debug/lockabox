import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CreditsExhaustedError,
  DexPaprikaClient,
  DexScreenerClient,
  createHttpClient,
  createLimiter,
  dexPaprikaNetworkSchema,
  dexPaprikaMultiPriceSchema,
  dexPaprikaSearchResponseSchema,
  dexScreenerBoostSchema,
  dexScreenerCommunityTakeoverSchema,
  dexScreenerMetaSchema,
  dexScreenerPairSchema,
  dexScreenerProfileSchema,
  dexScreenerSearchResponseSchema,
  DEXPAPRIKA_BASE_URL,
  DEXSCREENER_BASE_URL,
  marketCapTier,
  pairsToAssets,
  paprikaPoolsToCandidates,
  RateLimitedError,
  type DexScreenerPair,
} from "@/modules/sources";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(resolve(process.cwd(), "tests/fixtures", name), "utf8"));

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("source fixture schemas", () => {
  it("parses every recorded DexScreener fixture", () => {
    dexScreenerCommunityTakeoverSchema.array().parse(fixture("dexscreener/community-takeovers-latest.json"));
    dexScreenerMetaSchema.parse(fixture("dexscreener/meta-cat.json"));
    dexScreenerMetaSchema.array().parse(fixture("dexscreener/metas-trending.json"));
    dexScreenerSearchResponseSchema.parse(fixture("dexscreener/search-pepe.json"));
    dexScreenerBoostSchema.array().parse(fixture("dexscreener/token-boosts-latest.json"));
    dexScreenerBoostSchema.array().parse(fixture("dexscreener/token-boosts-top.json"));
    dexScreenerProfileSchema.array().parse(fixture("dexscreener/token-profiles-latest.json"));
    dexScreenerPairSchema.array().parse(fixture("dexscreener/tokens-solana-batch.json"));
  });

  it("parses every recorded DexPaprika fixture", () => {
    dexPaprikaNetworkSchema.array().parse(fixture("dexpaprika/networks.json"));
    dexPaprikaSearchResponseSchema.parse(fixture("dexpaprika/pools-search-robinhood-new.json"));
    dexPaprikaSearchResponseSchema.parse(fixture("dexpaprika/pools-search-solana-new.json"));
    dexPaprikaMultiPriceSchema.array().parse(fixture("dexpaprika/multi-prices.json"));
  });
});

describe("source HTTP", () => {
  it("spaces a token bucket after its initial burst", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = createLimiter({
      perMinute: 2,
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
    });

    await limiter.take();
    await limiter.take();
    await limiter.take();

    expect(sleeps).toEqual([30_000]);
  });

  it("retries a 429 with exponential backoff and returns JSON", async () => {
    const responses = [jsonResponse({ error: "busy" }, 429), jsonResponse({ ok: true })];
    const fetcher = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async () => undefined);
    const http = createHttpClient({ fetch: fetcher, sleep });

    await expect(http.getJson("https://api.example.test/data")).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("maps a final 429 to RateLimitedError", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "busy" }, 429));
    const http = createHttpClient({ fetch: fetcher, sleep: async () => undefined });

    await expect(http.getJson("https://api.example.test/data")).rejects.toBeInstanceOf(RateLimitedError);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("maps 402 to CreditsExhaustedError without retry", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "credits" }, 402));
    const http = createHttpClient({ fetch: fetcher, sleep: async () => undefined });

    await expect(http.getJson("https://api.dexpaprika.com/networks")).rejects.toBeInstanceOf(CreditsExhaustedError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("source clients", () => {
  it("uses the official DexScreener URLs and validates fixture payloads", async () => {
    const bodies: Record<string, unknown> = {
      "/token-profiles/latest/v1": fixture("dexscreener/token-profiles-latest.json"),
      "/token-boosts/latest/v1": fixture("dexscreener/token-boosts-latest.json"),
      "/token-boosts/top/v1": fixture("dexscreener/token-boosts-top.json"),
      "/community-takeovers/latest/v1": fixture("dexscreener/community-takeovers-latest.json"),
      "/metas/trending/v1": fixture("dexscreener/metas-trending.json"),
      "/metas/meta/v1/cat": fixture("dexscreener/meta-cat.json"),
      "/tokens/v1/solana/one": fixture("dexscreener/tokens-solana-batch.json"),
      "/latest/dex/search?q=pepe": fixture("dexscreener/search-pepe.json"),
    };
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname + (new URL(String(url)).search || "");
      return jsonResponse(bodies[path]);
    });
    const client = new DexScreenerClient({ fetch: fetcher, sleep: async () => undefined });

    await expect(client.tokenProfilesLatest()).resolves.toHaveLength(30);
    await expect(client.tokenBoostsLatest()).resolves.toHaveLength(30);
    await expect(client.tokenBoostsTop()).resolves.toHaveLength(30);
    await expect(client.communityTakeoversLatest()).resolves.toHaveLength(12);
    await expect(client.metasTrending()).resolves.toHaveLength(18);
    await expect(client.meta("cat")).resolves.toMatchObject({ slug: "cat" });
    await expect(client.tokens("solana", ["one"])).resolves.toHaveLength(18);
    await expect(client.search("pepe")).resolves.toMatchObject({ pairs: expect.any(Array) });
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith(DEXSCREENER_BASE_URL))).toBe(true);
  });

  it("rejects more than 30 addresses before making a request", async () => {
    const fetcher = vi.fn(async () => jsonResponse([]));
    const client = new DexScreenerClient({ fetch: fetcher });
    await expect(client.tokens("solana", Array.from({ length: 31 }, (_, i) => `token-${i}`))).rejects.toThrow(
      "at most 30",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends DexPaprika Authorization only when a key is configured", async () => {
    const body = fixture("dexpaprika/networks.json");
    const keylessFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return jsonResponse(body);
    });
    const keyedFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("test-key");
      return jsonResponse(body);
    });

    await new DexPaprikaClient({ fetch: keylessFetch }).networks();
    await new DexPaprikaClient({ fetch: keyedFetch, apiKey: "test-key" }).networks();
    expect(keylessFetch).toHaveBeenCalledWith(`${DEXPAPRIKA_BASE_URL}/networks`, expect.any(Object));
  });

  it("loads and maps the recorded DexPaprika multi-price response", async () => {
    const body = fixture("dexpaprika/multi-prices.json");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${DEXPAPRIKA_BASE_URL}/networks/solana/multi/prices?tokens=DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263,EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm`);
      return jsonResponse(body);
    });
    const client = new DexPaprikaClient({ fetch: fetcher, sleep: async () => undefined });
    const result = await client.multiPrices('solana', [
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    ]);
    // One HTTP call, but DexPaprika bills one credit per token.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.creditsUsed).toBe(2);
    expect(result).toEqual([
      { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', priceUsd: 0.000003640729606326853, lastUpdated: '2026-09-27T01:46:30Z' },
      { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', priceUsd: 0.2433160654377283, lastUpdated: '2026-09-27T01:46:30Z' },
    ]);
  });
});

describe("DexPaprika multi-price batching", () => {
  it("splits 23 tokens into 3 calls of at most 10 and counts 23 credits", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      const tokens = new URL(String(url)).searchParams.get("tokens")!.split(",");
      return jsonResponse(tokens.map((id) => ({ chain: "solana", id, price_usd: 1, last_updated: null })));
    });
    const client = new DexPaprikaClient({ fetch: fetcher, sleep: async () => undefined });
    const tokens = Array.from({ length: 23 }, (_, i) => `Token${i}`);
    const result = await client.multiPrices("solana", tokens);
    expect(urls.map((url) => new URL(url).searchParams.get("tokens")!.split(",").length)).toEqual([10, 10, 3]);
    expect(result).toHaveLength(23);
    expect(client.creditsUsed).toBe(23);
  });
});

describe("source normalization", () => {
  it("keeps one highest-liquidity snapshot per base token", () => {
    const low: DexScreenerPair = {
      chainId: "solana",
      dexId: "low-dex",
      url: "https://dexscreener.com/solana/low",
      pairAddress: "low",
      baseToken: { address: "TOKEN", symbol: "TOK", name: "Token" },
      quoteToken: { address: "SOL", symbol: "SOL", name: "Wrapped SOL" },
      priceUsd: "1",
      marketCap: 50,
      fdv: 55,
      liquidity: { usd: 10 },
      volume: { h24: 2 },
      priceChange: { h24: 1 },
      info: { imageUrl: null, websites: [], socials: [] },
    };
    const high: DexScreenerPair = {
      ...low,
      dexId: "high-dex",
      pairAddress: "high",
      liquidity: { usd: 100 },
      boosts: { active: 3 },
      pairCreatedAt: 1_700_000_000_000,
      info: {
        imageUrl: "https://img.test/token.png",
        websites: [{ url: "https://token.test" }],
        socials: [{ type: "twitter", url: "https://x.com/token" }],
      },
    };

    const assets = pairsToAssets([low, high, { ...low, baseToken: { ...low.baseToken, address: "OTHER" } }]);
    expect(assets).toHaveLength(2);
    expect(assets.find((asset) => asset.address === "TOKEN")).toMatchObject({
      pairAddress: "high",
      dexId: "high-dex",
      liquidityUsd: 100,
      marketCap: 50,
      imageUrl: "https://img.test/token.png",
      boostsActive: 3,
      socials: [{ platform: "twitter", handle: "token" }],
    });
  });

  it("extracts non-quote tokens and maps network IDs", () => {
    const solana = dexPaprikaSearchResponseSchema.parse(fixture("dexpaprika/pools-search-solana-new.json"));
    const robinhood = dexPaprikaSearchResponseSchema.parse(fixture("dexpaprika/pools-search-robinhood-new.json"));
    const candidates = paprikaPoolsToCandidates([...solana.results, ...robinhood.results]);
    expect(candidates).toHaveLength(100);
    expect(candidates.every((candidate) => candidate.address !== "So11111111111111111111111111111111111111112")).toBe(true);
    expect(candidates.find((candidate) => candidate.chainId === "robinhood")?.address).toBe(
      robinhood.results[0].tokens[1].id,
    );
  });
});

describe("market-cap tiers", () => {
  it("uses inclusive upper-tier boundaries", () => {
    expect(marketCapTier(99_999)).toBe("micro");
    expect(marketCapTier(100_000)).toBe("small");
    expect(marketCapTier(1_000_000)).toBe("mid");
    expect(marketCapTier(10_000_000)).toBe("large");
    expect(marketCapTier(100_000_000)).toBe("top");
    expect(marketCapTier(null)).toBeNull();
    expect(marketCapTier(Number.NaN)).toBeNull();
    expect(marketCapTier(0)).toBeNull();
  });
});
