// Tipos compartilhados do frontend.

export type Asset =
  | "BTC" | "ETH" | "SOL" | "BNB"
  | "XRP" | "DOGE" | "ADA" | "AVAX" | "LINK" | "SUI" | "TON" | "POL" | "DOT" | "LTC";
export type Level = "green" | "yellow" | "red" | "neutral";

/** Linha da tabela `plans` (limites parametrizados). */
export interface Plan {
  slug: "free" | "pro" | "expert";
  name: string;
  price_cents: number;
  assets: string[];
  snapshot_interval_min: number;
  advanced_metrics: boolean;
  chart_layers: boolean;
  ai_daily_limit: number | null;
  ai_model: string;
  alert_channels: string[];
  history_days: number | null;
  smart_money: boolean;
}

export interface PriceRow {
  asset: string;
  exchange: string;
  price: number | null;
  volume_spot: number | null;
  volume_perps: number | null;
  cvd: number | null;
}

export interface DerivativesData {
  open_interest: number | null;
  funding_rate: number | null;
  long_short_ratio: number | null;
  liq_long_usd: number | null;
  liq_short_usd: number | null;
  cvd: number | null;
}

export interface GammaData {
  zero_gamma_level: number | null;
  regime: "positive" | "negative" | null;
  max_pain: number | null;
  max_pain_expiry: string | null;
  net_gex_spot: number | null;
  spot_price: number | null;
  profile_jsonb: Record<string, number> | null;
  put_call_ratio: number | null;
  avg_iv: number | null;
  iv_skew: number | null;
}

export interface OnchainPerpsData {
  funding_rate: number | null;
  open_interest: number | null;
  mark_price: number | null;
}

export interface DexLiquidityData {
  pair: string;
  liquidity_usd: number | null;
  volume_24h: number | null;
}

export interface DefiHealthData {
  chain: string;
  tvl_usd: number | null;
  stablecoin_flow_24h: number | null;
}

export interface SentimentData {
  fng_value: number | null;
  classification: string | null;
}

export interface MacroData {
  btc_dominance: number | null;
  total_mcap: number | null;
}

export interface OrderbookWall {
  exchange: string;
  side: "bid" | "ask";
  price: number;
  notional_usd: number;
}

export interface NewsItem {
  title: string;
  source: string | null;
  url: string;
  assets: string[];
  published_at: string;
}

/** Payload consolidado gravado pelo coletor em `market_snapshot.payload`. */
export interface SnapshotPayload {
  asset: string;
  generated_at: string;
  price: Record<string, PriceRow> | null;
  coinbase_premium: number | null;
  derivatives: DerivativesData | null;
  gamma: GammaData | null;
  onchain_perps: OnchainPerpsData | null;
  dex_liquidity: DexLiquidityData | null;
  defi_health: DefiHealthData | null;
  sentiment: SentimentData | null;
  macro: MacroData | null;
  news: NewsItem[];
}
