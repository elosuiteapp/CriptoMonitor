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
  group: "major" | "brl" | "cross" | "exotic" | "index";
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
  { symbol: "EUR/CHF", name: "Euro / Franco", group: "cross" },
  { symbol: "EUR/AUD", name: "Euro / Dólar Aus.", group: "cross" },
  { symbol: "EUR/CAD", name: "Euro / Dólar Can.", group: "cross" },
  { symbol: "GBP/CHF", name: "Libra / Franco", group: "cross" },
  { symbol: "GBP/AUD", name: "Libra / Dólar Aus.", group: "cross" },
  { symbol: "AUD/JPY", name: "Dólar Aus. / Iene", group: "cross" },
  { symbol: "AUD/NZD", name: "Dólar Aus. / Dólar NZ", group: "cross" },
  { symbol: "CAD/JPY", name: "Dólar Can. / Iene", group: "cross" },
  { symbol: "CHF/JPY", name: "Franco / Iene", group: "cross" },
  { symbol: "NZD/JPY", name: "Dólar NZ / Iene", group: "cross" },
  { symbol: "USD/MXN", name: "Dólar / Peso Mex.", group: "exotic" },
  { symbol: "USD/ZAR", name: "Dólar / Rand", group: "exotic" },
  { symbol: "USD/SGD", name: "Dólar / Dólar Sing.", group: "exotic" },
  { symbol: "DXY", name: "Índice do Dólar", group: "index" },
];

// Taxas básicas de juros (aprox., % a.a.) por moeda — o CARRY/diferencial de juros é
// o motor central do câmbio. ATUALIZAR quando os bancos centrais mexerem (mudam raro).
export const POLICY_RATES: Record<string, number> = {
  USD: 4.25, EUR: 2.0, GBP: 4.0, JPY: 0.5, AUD: 3.6, CAD: 2.75, CHF: 0.5, NZD: 3.0, BRL: 13.0,
};
export interface Carry {
  base: string;
  quote: string;
  baseRate: number;
  quoteRate: number;
  diff: number; // base − cotação (% a.a.). >0 = comprar o par rende juros (carry positivo).
}
/** Carry do par = juro da moeda BASE − juro da moeda de COTAÇÃO. */
export function pairCarry(pair: string): Carry | null {
  if (pair === "DXY" || !pair.includes("/")) return null;
  const [base, quote] = pair.split("/");
  const br = POLICY_RATES[base];
  const qr = POLICY_RATES[quote];
  if (br == null || qr == null) return null;
  return { base, quote, baseRate: br, quoteRate: qr, diff: br - qr };
}

// ── Posicionamento institucional (COT/CFTC) — futuros de FX na CME (lê a tabela
//    compartilhada cot_positioning; o COT é "moeda vs USD"). ──────────────────
export interface ForexCot {
  currency: string;
  reportDate: string;
  assetMgrNet: number; // institucional ("real money") líquido
  assetMgrNetChg: number; // variação semanal
  levMoneyNet: number; // fundos alavancados (hedge funds) líquido
  levMoneyNetChg: number;
  nonreptNet: number; // pequenos especuladores (varejo) líquido
  nonreptNetChg: number;
  openInterest: number;
}
/** Moeda e direção do COT relevantes p/ o par. Como o COT é "moeda vs USD":
 *  XXX/USD → COT de XXX (direção +1); USD/XXX → COT de XXX (direção −1, invertido);
 *  cross → COT da base (proxy, +1). DXY → sem COT único. */
export function cotForPair(pair: string): { currency: string; direction: 1 | -1; proxy: boolean } | null {
  if (pair === "DXY" || !pair.includes("/")) return null;
  const [base, quote] = pair.split("/");
  if (quote === "USD") return { currency: base, direction: 1, proxy: false };
  if (base === "USD") return { currency: quote, direction: -1, proxy: false };
  return { currency: base, direction: 1, proxy: true }; // cross: proxy pela moeda base
}
export function fetchForexCot(currency: string): Promise<ForexCot | null> {
  return cached(
    `cot:${currency}`,
    600_000,
    async () => {
      try {
        const { data, error } = await supabase
          .from("cot_positioning")
          .select("asset, report_date, asset_mgr_net, asset_mgr_net_chg, lev_money_net, lev_money_net_chg, nonrept_net, nonrept_net_chg, open_interest")
          .eq("asset", currency)
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        const d = data as Record<string, unknown>;
        return {
          currency,
          reportDate: String(d.report_date ?? "").slice(0, 10),
          assetMgrNet: Number(d.asset_mgr_net ?? 0),
          assetMgrNetChg: Number(d.asset_mgr_net_chg ?? 0),
          levMoneyNet: Number(d.lev_money_net ?? 0),
          levMoneyNetChg: Number(d.lev_money_net_chg ?? 0),
          nonreptNet: Number(d.nonrept_net ?? 0),
          nonreptNetChg: Number(d.nonrept_net_chg ?? 0),
          openInterest: Number(d.open_interest ?? 0),
        };
      } catch {
        return null;
      }
    },
    (v) => v == null,
  );
}

// ── Calendário econômico (ForexFactory via econ-calendar) — multi-moeda p/ FX ──
export interface ForexEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string | null;
  previous: string | null;
}
/** Moedas de um par (base, cotação) + USD (move tudo). Sem duplicar; ignora DXY. */
export function pairCurrencies(pair: string): string[] {
  const set = new Set<string>(["USD"]);
  if (pair !== "DXY" && pair.includes("/")) pair.split("/").forEach((c) => set.add(c));
  return [...set];
}
export function fetchForexCalendar(currencies: string[]): Promise<ForexEvent[]> {
  const key = currencies.slice().sort().join(",");
  return cached(
    `cal:${key}`,
    600_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("econ-calendar", { body: { countries: currencies } });
        if (error || !data) return [];
        return (data as { events?: ForexEvent[] }).events ?? [];
      } catch {
        return [];
      }
    },
    (v) => v.length === 0,
  );
}

// ── Força das moedas (Currency Strength) — padrão do FX. Para cada moeda, média do
//    movimento dela contra TODAS as outras (base = +%, cotação = −%). Só preço. ──
export const STRENGTH_CCYS = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "BRL"];
export interface CurrencyStrength {
  ccy: string;
  score: number; // % médio de variação da moeda contra as demais (>0 = forte)
  n: number; // quantos pares entraram na conta
}
export function computeCurrencyStrength(quotes: ForexQuote[]): CurrencyStrength[] {
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const c of STRENGTH_CCYS) acc[c] = { sum: 0, n: 0 };
  for (const q of quotes) {
    if (q.pair === "DXY" || !q.pair.includes("/") || q.changePct == null) continue;
    const [base, quote] = q.pair.split("/");
    if (acc[base]) { acc[base].sum += q.changePct; acc[base].n += 1; }
    if (acc[quote]) { acc[quote].sum -= q.changePct; acc[quote].n += 1; }
  }
  return STRENGTH_CCYS.map((c) => ({ ccy: c, score: acc[c].n ? acc[c].sum / acc[c].n : 0, n: acc[c].n }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.score - a.score);
}

export const isBrlPair = (s: string) => s.endsWith("/BRL");
/** Casas decimais de cotação do par (JPY = 3, índice/alto valor = 2-4, demais = 4/5). */
export function pairDecimals(s: string): number {
  if (s === "DXY") return 2;
  if (s.includes("JPY")) return 3;
  if (s.includes("MXN") || s.includes("ZAR")) return 4; // cotações altas (~17-18)
  if (isBrlPair(s)) return 4;
  return 5;
}

// ── Perfil tempo-no-preço (TPO) — FX NÃO tem volume real (vem 0), então o
//    "Volume Profile" por volume degenera. Aqui contamos a PRESENÇA de cada vela
//    em cada faixa de preço (low→high) = tempo gasto em cada nível. POC = preço de
//    maior aceitação; VAH/VAL = área de valor (70%). Mesma forma {poc,vah,val}. ──
export function computeForexProfile(candles: ForexCandle[], bins = 48): { poc: number; vah: number; val: number } | null {
  if (candles.length < 2) return null;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  if (!(hi > lo)) return null;
  const width = (hi - lo) / bins;
  const count = new Array<number>(bins).fill(0);
  for (const c of candles) {
    let a = Math.floor((c.low - lo) / width);
    let b = Math.floor((c.high - lo) / width);
    a = Math.max(0, Math.min(bins - 1, a));
    b = Math.max(0, Math.min(bins - 1, b));
    for (let i = a; i <= b; i++) count[i] += 1;
  }
  let maxI = 0;
  for (let i = 1; i < bins; i++) if (count[i] > count[maxI]) maxI = i;
  const total = count.reduce((s, v) => s + v, 0);
  let loI = maxI, hiI = maxI, acc = count[maxI];
  while (acc < total * 0.7 && (loI > 0 || hiI < bins - 1)) {
    const below = loI > 0 ? count[loI - 1] : -1;
    const above = hiI < bins - 1 ? count[hiI + 1] : -1;
    if (above >= below) acc += count[++hiI];
    else acc += count[--loI];
  }
  return { poc: lo + (maxI + 0.5) * width, vah: lo + (hiI + 1) * width, val: lo + loI * width };
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
        // Sanitiza velas corrompidas (OHLC <= 0 ou inválido) que viram "spike" no gráfico.
        return ((data as { candles?: ForexCandle[] }).candles ?? []).filter(
          (c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) && c.high >= c.low,
        );
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
