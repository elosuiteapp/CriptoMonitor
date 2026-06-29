// Edge Function: forex-data — proxy Yahoo Finance focado em CÂMBIO (módulo Forex).
// Isolado do b3-data de propósito (módulos separados). Modos:
//   { mode: "chart", pair, tf }  -> candles do par no timeframe (15m/1h/4h/1d/1w/1M)
//   { mode: "overview" }         -> cotação + variação 24h de todos os pares + DXY
// Tudo grátis (Yahoo, sem token). Robusto: cada fetch devolve null/[] em falha.
// Deploy: supabase functions deploy forex-data --no-verify-jwt
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Pares (rótulo → símbolo Yahoo). Majors + BRL + alguns cruzamentos + DXY.
const PAIRS: Record<string, string> = {
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  "USD/JPY": "USDJPY=X",
  "USD/CHF": "USDCHF=X",
  "AUD/USD": "AUDUSD=X",
  "USD/CAD": "USDCAD=X",
  "NZD/USD": "NZDUSD=X",
  "USD/BRL": "USDBRL=X",
  "EUR/BRL": "EURBRL=X",
  "GBP/BRL": "GBPBRL=X",
  "EUR/GBP": "EURGBP=X",
  "EUR/JPY": "EURJPY=X",
  "GBP/JPY": "GBPJPY=X",
  "DXY": "DX-Y.NYB",
};

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

// Yahoo chart: intraday usa range presets; diário/semanal/mensal usa period1=0 (histórico
// denso — range=max faz downsampling). 4h é agregado de 1h (Yahoo não tem 4h).
async function yahooCandles(symbol: string, interval: string, range: string | null): Promise<Candle[]> {
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const qs = range
    ? `interval=${interval}&range=${range}`
    : `interval=${interval}&period1=0&period2=${Math.floor(Date.now() / 1000)}`;
  const r = await fetch(`${base}?${qs}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
  }
  return out;
}

// Agrega candles de 1h em blocos de 4h (âncora na grade UTC).
function to4h(c1h: Candle[]): Candle[] {
  const buckets = new Map<number, Candle[]>();
  for (const c of c1h) {
    const b = Math.floor(c.time / 14400) * 14400;
    (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(c);
  }
  const out: Candle[] = [];
  for (const [b, arr] of [...buckets.entries()].sort((a, z) => a[0] - z[0])) {
    arr.sort((a, z) => a.time - z.time);
    out.push({
      time: b,
      open: arr[0].open,
      high: Math.max(...arr.map((x) => x.high)),
      low: Math.min(...arr.map((x) => x.low)),
      close: arr[arr.length - 1].close,
      volume: arr.reduce((s, x) => s + (x.volume || 0), 0),
    });
  }
  return out;
}

const TF: Record<string, { interval: string; range: string | null }> = {
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "1h", range: "2y" },
  "1d": { interval: "1d", range: null },
  "1w": { interval: "1wk", range: null },
  "1M": { interval: "1mo", range: null },
};

async function quote(symbol: string): Promise<{ price: number | null; changePct: number | null } | null> {
  try {
    const c = await yahooCandles(symbol, "1d", "5d");
    if (c.length < 2) return c.length ? { price: c[c.length - 1].close, changePct: null } : null;
    const last = c[c.length - 1].close;
    const prev = c[c.length - 2].close;
    return { price: last, changePct: prev ? ((last - prev) / prev) * 100 : null };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode;

  if (mode === "chart") {
    const pair = String(body?.pair ?? "");
    const tf = String(body?.tf ?? "1d");
    const symbol = PAIRS[pair];
    if (!symbol) return json(400, { error: "par inválido" });
    try {
      if (tf === "4h") {
        const c1h = await yahooCandles(symbol, "1h", "2y");
        return json(200, { candles: to4h(c1h) });
      }
      const cfg = TF[tf] ?? TF["1d"];
      const candles = await yahooCandles(symbol, cfg.interval, cfg.range);
      return json(200, { candles });
    } catch (e) {
      return json(200, { candles: [], error: String(e).slice(0, 120) });
    }
  }

  if (mode === "overview") {
    const entries = Object.entries(PAIRS);
    const quotes = await Promise.all(entries.map(async ([label, sym]) => ({ pair: label, ...(await quote(sym)) })));
    return json(200, { quotes });
  }

  return json(400, { error: "modo inválido" });
});
