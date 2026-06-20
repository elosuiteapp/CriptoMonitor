// Fonte de dados da B3 (módulo admin-only por enquanto) — brapi.dev, client-side.
// Sem token: só PETR4/VALE3/ITUB4/MGLU3. Com VITE_BRAPI_TOKEN (grátis): IBOV, dólar
// e todas as ações. Fluxo de investidor (dadosdemercado) e macro BR (BCB) entram depois.

const BRAPI = "https://brapi.dev/api";
const TOKEN = (import.meta.env.VITE_BRAPI_TOKEN as string | undefined) || "";
const tok = TOKEN ? `&token=${TOKEN}` : "";

export const B3_HAS_TOKEN = Boolean(TOKEN);
export const B3_FREE_TICKERS = ["PETR4", "VALE3", "ITUB4", "MGLU3"];
// Carteira teórica do IBOV (mais líquidas) — usada quando há token.
export const B3_WATCHLIST = [
  "^BVSP", "PETR4", "VALE3", "ITUB4", "BBDC4", "B3SA3", "WEGE3", "ABEV3",
  "BBAS3", "MGLU3", "ELET3", "RENT3", "PRIO3", "RADL3", "SUZB3",
];

export interface B3Candle {
  time: number; // epoch (s) — formato Lightweight Charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface B3Quote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  pe: number | null; // Preço/Lucro
  eps: number | null; // Lucro por ação
  high: number | null;
  low: number | null;
  fiftyTwoWeekRange: string | null;
  candles: B3Candle[];
}

/** Cotação + fundamentos + candles (3 meses, diário) de um ativo da B3. */
export async function fetchB3Quote(ticker: string): Promise<B3Quote | null> {
  try {
    const res = await fetch(`${BRAPI}/quote/${encodeURIComponent(ticker)}?range=3mo&interval=1d&fundamental=true${tok}`);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;
    const candles: B3Candle[] = ((r.historicalDataPrice ?? []) as Array<Record<string, number>>)
      .filter((h) => Number.isFinite(h.close))
      .map((h) => ({ time: h.date, open: h.open, high: h.high, low: h.low, close: h.close, volume: h.volume }));
    return {
      symbol: r.symbol,
      name: r.longName ?? r.shortName ?? r.symbol,
      price: r.regularMarketPrice ?? null,
      changePct: r.regularMarketChangePercent ?? null,
      volume: r.regularMarketVolume ?? null,
      marketCap: r.marketCap ?? null,
      pe: r.priceEarnings ?? null,
      eps: r.earningsPerShare ?? null,
      high: r.regularMarketDayHigh ?? null,
      low: r.regularMarketDayLow ?? null,
      fiftyTwoWeekRange: r.fiftyTwoWeekRange ?? null,
      candles,
    };
  } catch {
    return null;
  }
}

/** Dólar (USD/BRL) via brapi — só com token. null sem token ou em falha. */
export async function fetchB3Dollar(): Promise<{ price: number; changePct: number | null } | null> {
  if (!TOKEN) return null;
  try {
    const res = await fetch(`${BRAPI}/v2/currency?currency=USD-BRL${tok}`);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.currency?.[0];
    if (!c) return null;
    return { price: Number(c.bidPrice ?? c.askPrice), changePct: c.pctChange != null ? Number(c.pctChange) : null };
  } catch {
    return null;
  }
}
