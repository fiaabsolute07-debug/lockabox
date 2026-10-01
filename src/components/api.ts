export const TIERS = ['micro', 'small', 'mid', 'large', 'top'] as const;
export type Tier = (typeof TIERS)[number];

export type Chain = {
  id: string;
  name: string;
  family: string;
  swapEnabled: boolean;
  /** Who routes in-app buys on this chain (DECISIONS #10/#21); null where swap has never been set up. */
  swapProvider?: 'jupiter' | 'lifi' | 'uniswap' | null;
  /** EVM chain id for wallet_switchEthereumChain / SIWE; null on Solana. */
  evmChainId?: number | null;
  nativeSymbol?: string | null;
  /** Explorer link template with `{tx}`. */
  explorerTxUrl?: string | null;
  /** Coins in this chain's latest Trending pool (0 = nothing live yet). */
  poolSize?: number;
};

export type CaseSummaryRef = { id: string; title: string; kind: string };

export type MetaResponse = {
  chains: Chain[];
  cases: CaseSummaryRef[];
  activeSeedHash: string | null;
};

export type AssetCard = {
  id: number;
  chainId: string;
  address: string;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
  tier: Tier | null;
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
};

export type AssetDetail = AssetCard & {
  fdv: number | null;
  volume24h: number | null;
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  pairAddress: string | null;
  dexId: string | null;
  pairCreatedAt: string | null;
  snapshotAt: string | null;
  stale: boolean;
  priceSource: 'dexscreener' | 'dexpaprika';
  links: {
    dexscreener: string | null;
    explorer: string | null;
    websites: string[];
    socials: { platform: string; handle: string }[];
  };
  chart: { dexscreenerEmbed: string | null; geckoterminalEmbed: string | null };
  swapEnabled: boolean;
  lockaboxBuys24h: number;
};

export type CaseResponse = {
  case: CaseSummaryRef;
  chainScope: string;
  pool: { id: number; version: number; hash: string; size: number; createdAt: string } | null;
  tierCounts: Record<Tier, number>;
  odds: Partial<Record<Tier, number>>;
  contents: AssetCard[];
};

export type FeedItem = {
  kind: 'buy' | 'pull';
  at: string;
  ref: string;
  who: string | null;
  assetId: number;
  symbol: string | null;
  imageUrl?: string | null;
  chainId: string;
  tier: Tier | null;
  amount: string | null;
  inputSymbol: string | null;
};

export type FeedResponse = {
  items: FeedItem[];
  stats: { rolls1h: number; buysToday: number; lastTopPullAt: string | null };
};

export type MeUser = {
  id: string;
  clientSeed: string;
  nonce: number;
  points: number;
  inviteCode: string;
  hideFromBoard: boolean;
  wallets: { family: string; address: string }[];
};

export type MeResponse = { user: MeUser | null };

export type RollResponse = {
  roll: {
    rollId: number;
    caseId: string;
    chainScope: string;
    poolId: number;
    poolVersion: number;
    poolHash: string;
    itemsHash: string;
    poolSize: number;
    tier: Tier;
    assetId: number;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    odds: Partial<Record<Tier, number>>;
    createdAt: string;
    pick?: number;
    candidates?: number[];
  };
  asset: AssetDetail;
  reel: { winIndex: number; cards: AssetCard[] };
  /** "Pick 1 of 3" rolls only: the chosen card and the three coins under the cards, in card order. */
  picks?: { index: number; cards: AssetCard[] };
};

export type RollFilters = {
  tiers?: Tier[];
  minLiquidityUsd?: number;
  minVolume24h?: number;
  maxAgeHours?: number;
  minAgeHours?: number;
  change24h?: 'up' | 'down';
};

export type RollRecordResponse = {
  roll: {
    id: number;
    caseId: string;
    poolId: number;
    clientSeed: string;
    nonce: number;
    tier: Tier;
    itemsHash: string;
    poolSize: number;
    filters: RollFilters;
    serverSeedHash: string;
    seedRevealed: boolean;
    createdAt: string;
    oddsMode?: 'tiers' | 'uniform' | 'pick3';
    pick?: number | null;
    candidates?: number[] | null;
  };
  asset: AssetDetail;
};

export type VerificationResponse =
  | { status: 'pending'; serverSeedHash: string; message: string }
  | {
      status: 'verified' | 'mismatch';
      serverSeed: string;
      serverSeedHash: string;
      hashMatches: boolean;
      recomputed: { tier: Tier; assetId: number };
      recorded: { tier: Tier; assetId: number };
      /** The filtered canonical pool and case odds, so the browser recomputes without trusting the server. */
      clientSeed: string;
      nonce: number;
      items: { a: number; t: Tier }[];
      odds: Partial<Record<Tier, number>>;
      oddsMode?: 'tiers' | 'uniform' | 'pick3';
      pick?: number | null;
      candidates?: number[] | null;
    };

export type BuyItem = {
  at: string;
  maker: string;
  inputAmount: string;
  inputSymbol: string;
  outAmountMin: string;
  txHash: string | null;
  txUrl: string | null;
};

export type RouteFee = { name: string; percentage: number | null; amountUsd: number | null };

export type QuoteView = {
  assetId: number;
  symbol: string | null;
  /** SOL on Solana; ETH, BNB or USDC (Arc) on EVM chains. */
  inputSymbol: string;
  inputAmount: string;
  outAmount: string;
  outAmountMin: string;
  decimals: number | null;
  priceImpactPct: number | null;
  slippageBps: number;
  route: string[];
  provider?: 'jupiter' | 'lifi' | 'uniswap';
  /** Route costs charged by others (e.g. LI.FI's fixed fee as a fraction: 0.0025 = 0.25 %). Lockabox's own fee is always 0. */
  routeFees?: RouteFee[];
  lockaboxFee: 0;
  sellCheck: 'passed';
};

export type EvmTxRequest = { to: string; data: string; value: string; gasLimit: string | null; chainId: number };

export type EvmBuildResponse = { tradeId: number; evm: { chainId: number; approval: EvmTxRequest | null; transaction: EvmTxRequest }; quote: QuoteView };

export type AdminOverview = {
  pendingCampaigns: { id: number; project_name: string; chain_id: string; total_opens: number; starts_at: string; ends_at: string; fee_tx_hash: string | null; deposit_tx_hash: string | null; created_at: string }[];
  killed: { asset_id: number; chain_id: string; symbol: string | null; reason: string; actor: string; created_at: string }[];
  audit: { at: string; actor: string; action: string; target: string | null; detail: unknown }[];
};

export function explorerTxLink(template: string | null | undefined, hash: string) {
  return template ? template.replace('{tx}', hash) : null;
}

export type PointsResponse = {
  balance: number;
  tasks: { id: string; title: string; points: number; goal: number; daily: boolean; progress: number | null; claimed: boolean }[];
};

export type LeaderboardItem = {
  rollId: number;
  at: string;
  assetId: number;
  chainId: string;
  symbol: string | null;
  imageUrl: string | null;
  tier: Tier | null;
  priceAtPull: number | null;
  priceNow: number | null;
  changePct: number | null;
  who: string;
};

export type LeaderboardResponse = {
  window: '24h' | '7d';
  items: LeaderboardItem[];
};

export type InviteSummary = {
  code: string;
  path: string;
  invited: number;
  rewarded: number;
  claimable: number;
  rewardedToday: number;
  dailyCap: number;
  daysRequired: number;
};

export type SponsoredLiveItem = {
  id: number;
  projectName: string;
  description: string;
  symbol: string | null;
  address: string;
  imageUrl: string | null;
  amountPerOpen: string;
  remaining: number;
  costPoints: number;
  endsAt: string;
};

export type SponsoredLiveResponse = {
  label: 'Sponsored';
  items: SponsoredLiveItem[];
};

export type SponsoredOpenResponse = {
  rollId: number;
  redemptionId: number;
  campaignId: number;
  assetId: number;
  tier: Tier;
  amount: string;
  cost: number;
  serverSeedHash: string;
  nonce: number;
  sponsored: true;
  label: 'Sponsored';
  asset: AssetDetail;
};

export type SponsorCampaign = {
  id: number;
  projectName: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'ended' | string;
  totalOpens: number;
  opensUsed: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type SponsorCampaignStats = {
  campaign: {
    id: number;
    project_name: string;
    status: string;
    total_opens: number;
    opens_used: number;
    starts_at: string;
    ends_at: string;
    amount_per_open: string;
  };
  stats: { opens: number; wallets: number; sent: number; buys: number };
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public detail?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

type ProblemBody = { error?: { code?: string; message?: string; detail?: unknown } };

export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as T | ProblemBody;
  if (!response.ok) {
    const problem = body as ProblemBody;
    throw new ApiError(response.status, problem.error?.code ?? 'http_error', problem.error?.message ?? 'Something went wrong', problem.error?.detail);
  }
  return body as T;
}

export function formatAddress(value: string | null | undefined, size = 4) {
  if (!value) return '—';
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function formatCompact(value: number | null | undefined, locale = 'en-US') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

export function formatCompactUsd(value: number | null | undefined, locale = 'en-US') {
  const compact = formatCompact(value, locale);
  return compact === '—' ? compact : `$${compact}`;
}

export function formatPrice(value: number | null | undefined, locale = 'en-US') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  const formatted = absolute >= 1
    ? new Intl.NumberFormat(locale, { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : new Intl.NumberFormat(locale, { useGrouping: false, maximumSignificantDigits: 4 }).format(value);
  return `$${formatted}`;
}

export function formatUsd(value: number | null | undefined, locale = 'en-US') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number | null | undefined, locale = 'en-US') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}%`;
}

export function displaySymbol(asset: { symbol?: string | null; name?: string | null }) {
  const raw = asset.symbol?.trim() || asset.name?.trim() || 'TOKEN';
  return raw.replace(/^\$+/, '') || 'TOKEN';
}

export function formatAge(value: string, detailed = false) {
  const ageMinutes = Math.max(0, (Date.now() - new Date(value).getTime()) / 60_000);
  if (!Number.isFinite(ageMinutes) || ageMinutes < 1) return 'just now';
  if (ageMinutes < 60) return `${Math.floor(ageMinutes)}m ago`;
  const ageHours = ageMinutes / 60;
  if (ageHours < 24) return `${Math.floor(ageHours)}h ago`;
  const days = Math.floor(ageHours / 24);
  return detailed ? `${days}d ${Math.floor(ageHours % 24)}h ago` : `${days}d ago`;
}

export function formatRawAmount(raw: string | null | undefined, decimals: number | null | undefined, locale = 'en-US') {
  if (!raw) return '—';
  if (decimals === null || decimals === undefined) return raw;
  const amount = Number(raw) / 10 ** decimals;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(amount);
}

export function tierLabel(tier: Tier | null | undefined) {
  return tier === 'top' ? '★ Top' : tier ? tier[0].toUpperCase() + tier.slice(1) : '—';
}

export function tierColor(tier: Tier | null | undefined) {
  return tier ? `var(--r-${tier})` : 'var(--muted)';
}

/** Chains with coins in their Trending pool first (in registry order), then the ones that are still empty. */
export function orderedChains(chains: Chain[] | undefined) {
  const list = chains ?? [];
  return [...list.filter((chain) => (chain.poolSize ?? 0) > 0), ...list.filter((chain) => !(chain.poolSize ?? 0))];
}
