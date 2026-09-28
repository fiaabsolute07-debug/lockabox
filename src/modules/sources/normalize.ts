import { DEXSCREENER_BASE_URL, type DexScreenerPair } from "./dexscreener";
import type { DexPaprikaPool } from "./dexpaprika";
import { KNOWN_CHAINS } from './chains';
import { tokenImageUrl } from './images';

/** Only EVM addresses are case-insensitive. Solana and unknown families retain their exact bytes. */
export function normalizeAssetAddress(chainId: string, address: string) {
  return KNOWN_CHAINS[chainId]?.family === 'evm' ? address.toLowerCase() : address;
}

export interface AssetPriceChange {
  m5: number | null;
  h1: number | null;
  h6: number | null;
  h24: number | null;
}

export interface AssetSocial {
  platform: string;
  handle: string;
}

export interface AssetSnapshot {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  priceChange: AssetPriceChange;
  pairAddress: string;
  dexId: string;
  pairCreatedAt: Date | null;
  boostsActive: number;
  dexscreenerUrl: string;
  websites: string[];
  socials: AssetSocial[];
}

export interface PaprikaCandidate {
  chainId: string;
  address: string;
  poolId: string;
  dexId: string;
  createdAt: Date;
  liquidityUsd: number | null;
  volume24h: number | null;
}

/** DexPaprika network IDs translated to DEX Screener chain IDs. */
export const CHAIN_ID_MAP: Readonly<Record<string, string>> = {
  solana: "solana",
  ethereum: "ethereum",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  robinhood: "robinhood",
  arc: "arc",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SOLANA_WRAPPED_NATIVE = "So11111111111111111111111111111111111111112";
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * A deliberately small quote-token registry. It is used only to select the
 * non-quote side of a newly discovered pool; it is not a token allowlist.
 */
export const QUOTE_TOKENS: Readonly<Record<string, readonly string[]>> = {
  solana: [SOLANA_WRAPPED_NATIVE, SOLANA_USDC],
  ethereum: [
    ZERO_ADDRESS,
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
  ],
  base: [
    ZERO_ADDRESS,
    "0x4200000000000000000000000000000000000006", // WETH
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0x2Ae3F1Ec7F1F5012CFEab0185bfcF1fC7e3fC1C5", // cbETH
  ],
  bsc: [
    ZERO_ADDRESS,
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
    "0x55d398326f99059fF775485246999027B3197955", // USDT
  ],
  arbitrum: [
    ZERO_ADDRESS,
    "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // native USDC
    "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
  ],
  robinhood: [ZERO_ADDRESS],
  arc: [ZERO_ADDRESS],
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dateFromMilliseconds(value: unknown): Date | null {
  const milliseconds = asNumber(value);
  if (milliseconds === null) return null;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function socialHandle(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? parsed.hostname;
  } catch {
    return url;
  }
}

function socialPlatform(type: string | null | undefined, url: string): string {
  if (type) return type;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function pairLiquidity(pair: DexScreenerPair): number {
  return asNumber(pair.liquidity?.usd) ?? Number.NEGATIVE_INFINITY;
}

function normalizePair(pair: DexScreenerPair): AssetSnapshot {
  const priceUsd = asNumber(pair.priceUsd);
  const fdv = asNumber(pair.fdv);
  const marketCap = asNumber(pair.marketCap) ?? fdv;
  const websites =
    pair.info?.websites
      ?.map((website) => website.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0) ?? [];
  const socials =
    pair.info?.socials
      ?.flatMap((social) => {
        if (typeof social.url !== "string" || social.url.length === 0) return [];
        return [{ platform: socialPlatform(social.type, social.url), handle: socialHandle(social.url) }];
      }) ?? [];

  return {
    chainId: pair.chainId,
    address: normalizeAssetAddress(pair.chainId, pair.baseToken.address),
    symbol: pair.baseToken.symbol ?? "",
    name: pair.baseToken.name ?? "",
    imageUrl: tokenImageUrl(pair.info?.imageUrl),
    priceUsd,
    marketCap,
    fdv,
    liquidityUsd: asNumber(pair.liquidity?.usd),
    volume24h: asNumber(pair.volume?.h24),
    priceChange: {
      m5: asNumber(pair.priceChange?.m5),
      h1: asNumber(pair.priceChange?.h1),
      h6: asNumber(pair.priceChange?.h6),
      h24: asNumber(pair.priceChange?.h24),
    },
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    pairCreatedAt: dateFromMilliseconds(pair.pairCreatedAt),
    boostsActive: asNumber(pair.boosts?.active) ?? 0,
    dexscreenerUrl:
      pair.url ?? `${DEXSCREENER_BASE_URL.replace("api.", "")}/${pair.chainId}/${pair.pairAddress}`,
    websites,
    socials,
  };
}

export function pairsToAssets(pairs: readonly DexScreenerPair[]): AssetSnapshot[] {
  const bestByToken = new Map<string, DexScreenerPair>();
  const images = new Map<string, string>();
  for (const pair of pairs) {
    const key = `${pair.chainId}\u0000${normalizeAssetAddress(pair.chainId, pair.baseToken.address)}`;
    const image = tokenImageUrl(pair.info?.imageUrl);
    if (image && !images.has(key)) images.set(key, image);
    const current = bestByToken.get(key);
    if (!current || pairLiquidity(pair) > pairLiquidity(current)) {
      bestByToken.set(key, pair);
    }
  }
  return [...bestByToken.entries()].map(([key, pair]) => {
    const snapshot = normalizePair(pair);
    return { ...snapshot, imageUrl: snapshot.imageUrl ?? images.get(key) ?? null };
  });
}

function isQuoteToken(chain: string, address: string): boolean {
  const quotes = QUOTE_TOKENS[chain] ?? [];
  const normalized = normalizeAssetAddress(chain, address);
  return quotes.some((quote) => normalizeAssetAddress(chain, quote) === normalized);
}

function candidateToken(pool: DexPaprikaPool): string | null {
  const tokens = pool.tokens;
  if (tokens.length === 0) return null;

  if (pool.chain === "solana") {
    return tokens.find((token) => !isQuoteToken(pool.chain, token.id))?.id ?? null;
  }

  const first = tokens[0];
  if (!isQuoteToken(pool.chain, first.id)) return first.id;
  return tokens.slice(1).find((token) => !isQuoteToken(pool.chain, token.id))?.id ?? null;
}

export function paprikaPoolsToCandidates(
  results: readonly DexPaprikaPool[],
): PaprikaCandidate[] {
  const candidates: PaprikaCandidate[] = [];
  for (const pool of results) {
    const address = candidateToken(pool);
    if (!address) continue;
    const createdAt = new Date(pool.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    candidates.push({
      chainId: CHAIN_ID_MAP[pool.chain] ?? pool.chain,
      address: normalizeAssetAddress(CHAIN_ID_MAP[pool.chain] ?? pool.chain, address),
      poolId: pool.id,
      dexId: pool.dex_id,
      createdAt,
      liquidityUsd: pool.liquidity_usd ?? null,
      volume24h: pool.volume_usd_24h ?? null,
    });
  }
  return candidates;
}
