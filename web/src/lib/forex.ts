// Camada de dados do módulo FOREX. Isolada (não importa nada de b3.ts/marketData
// específicos de outro módulo). Consome o edge `forex-data` (proxy Yahoo de câmbio).
import { supabase } from "./supabase";

export interface ForexCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForexPair {
  symbol: string; // rótulo (EUR/USD)
  name: string;
  group: "major" | "brl" | "cross" | "index";
}

export const FOREX_PAIRS: ForexPair[] = [
  { symbol: "EUR/USD", name: "Euro / Dólar", group: "major" },
  { symbol: "GBP/USD", name: "Libra / Dólar", group: "major" },
  { symbol: "USD/JPY", name: "Dólar / Iene", group: "major" },
  { symbol: "USD/CHF", name: "Dólar / Franco", group: "major" },
  { symbol: "AUD/USD", name: "Dólar Aus. / Dólar", group: "major" },
  { symbol: "USD/CAD", name: "Dólar / Dólar Can.", group: "major" },
  { symbol: "NZD/USD", name: "Dólar NZ / Dólar", group: "major" },
  { symbol: "USD/BRL", name: "Dólar / Real", group: "brl" },
  { symbol: "EUR/BRL", name: "Euro / Real", group: "brl" },
  { symbol: "GBP/BRL", name: "Libra / Real", group: "brl" },
  { symbol: "EUR/GBP", name: "Euro / Libra", group: "cross" },
  { symbol: "EUR/JPY", name: "Euro / Iene", group: "cross" },
  { symbol: "GBP/JPY", name: "Libra / Iene", group: "cross" },
  { symbol: "DXY", name: "Índice do Dólar", group: "index" },
];

export const isBrlPair = (s: string) => s.endsWith("/BRL");
/** Casas decimais de cotação do par (JPY = 3, índice = 2, demais = 4/5). */
export function pairDecimals(s: string): number {
  if (s === "DXY") return 2;
  if (s.includes("JPY")) return 3;
  if (isBrlPair(s)) return 4;
  return 5;
}

// ── Cache com TTL (forex-only) — evita refetch a cada troca de aba/par ──
const _cache = new Map<string, { t: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, isEmpty: (v: T) => boolean): Promise<T> {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  _cache.set(key, { t: now, p });
  const drop = () => {
    if (_cache.get(key)?.p === p) _cache.delete(key);
  };
  p.then((v) => {
    if (isEmpty(v)) drop();
  }, drop);
  return p;
}

export function fetchForexChart(pair: string, tf = "1d"): Promise<ForexCandle[]> {
  return cached(
    `chart:${pair}:${tf}`,
    120_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("forex-data", { body: { mode: "chart", pair, tf } });
        if (error || !data) return [];
        return ((data as { candles?: ForexCandle[] }).candles ?? []).filter((c) => Number.isFinite(c.close));
      } catch {
        return [];
      }
    },
    (v) => v.length === 0,
  );
}

export interface ForexQuote {
  pair: string;
  price: number | null;
  changePct: number | null;
}

export function fetchForexOverview(): Promise<ForexQuote[]> {
  return cached(
    "overview",
    60_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("forex-data", { body: { mode: "overview" } });
        if (error || !data) return [];
        return (data as { quotes?: ForexQuote[] }).quotes ?? [];
      } catch {
        return [];
      }
    },
    (v) => v.length === 0,
  );
}

// ── Sessões de mercado (Tóquio / Londres / Nova York) em horário UTC ──────────
export interface FxSession {
  name: string;
  open: boolean;
  startUtc: number;
  endUtc: number;
}
/** Sessões abertas agora (FX é 24h em dias úteis). Horas UTC aproximadas. */
export function forexSessions(now = new Date()): { sessions: FxSession[]; weekend: boolean } {
  const day = now.getUTCDay(); // 0 dom … 6 sáb
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const weekend = day === 0 || day === 6;
  const defs: [string, number, number][] = [
    ["Tóquio", 0, 9],
    ["Londres", 7, 16],
    ["Nova York", 12, 21],
  ];
  const sessions = defs.map(([name, s, e]) => ({ name, startUtc: s, endUtc: e, open: !weekend && h >= s && h < e }));
  return { sessions, weekend };
}
