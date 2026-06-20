// Dados da B3 (módulo admin-only) — via edge `b3-data` (Yahoo + BCB, grátis, sem
// token, sem CORS). Fundamentos via brapi (grátis p/ 4 ações; token p/ as demais).

import { supabase } from "./supabase";

export interface B3Quote {
  symbol: string; // IBOV, USD/BRL, PETR4…
  kind: "index" | "currency" | "stock";
  name: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
}
export interface B3Candle {
  time: number; // epoch (s) — formato Lightweight Charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface B3Macro {
  selic: number | null; // % ao dia (BCB série 11)
  ipca: number | null; // % no mês (BCB série 433)
  usd_brl: number | null; // PTAX venda (BCB série 1)
}
export interface B3Overview {
  quotes: B3Quote[];
  macro: B3Macro;
}

/** Watchlist (IBOV + dólar + ações) + macro BR. */
export async function fetchB3Overview(): Promise<B3Overview | null> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "overview" } });
    if (error || !data) return null;
    return data as B3Overview;
  } catch {
    return null;
  }
}

/** Candles diários (3 meses) de qualquer ativo da B3 (IBOV/dólar/ações). */
export async function fetchB3Chart(ticker: string): Promise<B3Candle[]> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "chart", ticker } });
    if (error || !data) return [];
    return ((data as { candles?: B3Candle[] }).candles ?? []).filter((c) => Number.isFinite(c.close));
  } catch {
    return [];
  }
}

// ── Fundamentos via brapi (grátis: PETR4/VALE3/ITUB4/MGLU3; token p/ o resto) ──
const BRAPI = "https://brapi.dev/api";
const BTOK = (import.meta.env.VITE_BRAPI_TOKEN as string | undefined) || "";

export interface B3Fund {
  pe: number | null; // P/L
  eps: number | null; // LPA
  marketCap: number | null;
  range52: string | null;
}
export async function fetchB3Fundamentals(ticker: string): Promise<B3Fund | null> {
  if (ticker.startsWith("^") || ticker.includes("/")) return null; // índice/dólar não têm
  try {
    const res = await fetch(`${BRAPI}/quote/${encodeURIComponent(ticker)}?fundamental=true${BTOK ? `&token=${BTOK}` : ""}`);
    if (!res.ok) return null;
    const r = (await res.json())?.results?.[0];
    if (!r) return null;
    return { pe: r.priceEarnings ?? null, eps: r.earningsPerShare ?? null, marketCap: r.marketCap ?? null, range52: r.fiftyTwoWeekRange ?? null };
  } catch {
    return null;
  }
}
