// Edge Function: b3-data (proxy grátis da B3 — Yahoo + BCB, sem token, sem CORS)
// Módulo B3 admin-only. Proxy read-only (sem gravar nada): contorna o CORS/limite do
// browser pro Yahoo e BCB. Dois modos no body:
//   { mode: "overview" } -> watchlist (IBOV, dólar, ações) + macro BR (Selic/IPCA/câmbio)
//   { mode: "chart", ticker: "PETR4" } -> candles diários (3 meses) do ativo
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// label, símbolo Yahoo, tipo
const SYMS: [string, string, string][] = [
  ["IBOV", "^BVSP", "index"],
  ["USD/BRL", "USDBRL=X", "currency"],
  ["PETR4", "PETR4.SA", "stock"],
  ["VALE3", "VALE3.SA", "stock"],
  ["ITUB4", "ITUB4.SA", "stock"],
  ["BBDC4", "BBDC4.SA", "stock"],
  ["BBAS3", "BBAS3.SA", "stock"],
  ["B3SA3", "B3SA3.SA", "stock"],
  ["WEGE3", "WEGE3.SA", "stock"],
  ["ABEV3", "ABEV3.SA", "stock"],
  ["PRIO3", "PRIO3.SA", "stock"],
  ["ELET3", "ELET3.SA", "stock"],
  ["RENT3", "RENT3.SA", "stock"],
  ["MGLU3", "MGLU3.SA", "stock"],
];
const TMAP: Record<string, string> = Object.fromEntries(SYMS.map(([l, s]) => [l, s]));

const Y = "https://query1.finance.yahoo.com/v8/finance/chart/";
async function yahoo(symbol: string, range: string, interval: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${Y}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
// deno-lint-ignore no-explicit-any
function quoteOf(j: any, label: string, kind: string) {
  const res = j?.chart?.result?.[0];
  const m = res?.meta;
  if (!m || m.regularMarketPrice == null) return null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? null;
  const price = m.regularMarketPrice;
  const changePct = prev ? ((price - prev) / prev) * 100 : null;
  return { symbol: label, kind, name: m.shortName ?? label, price, changePct, volume: m.regularMarketVolume ?? null, prevClose: prev };
}
async function bcb(code: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const a = (await r.json()) as Array<{ valor: string }>;
    const v = Number(a?.[a.length - 1]?.valor);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));

  if (body.mode === "chart" && body.ticker) {
    const sym = TMAP[String(body.ticker)] ?? String(body.ticker);
    const j = await yahoo(sym, "3mo", "1d");
    // deno-lint-ignore no-explicit-any
    const res = (j as any)?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    const candles = ts
      .map((t, i) => ({ time: t, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i] }))
      .filter((c) => c.close != null);
    return json({ candles });
  }

  // overview: watchlist + macro BR
  const quotes = (await Promise.all(SYMS.map(async ([l, s, k]) => quoteOf(await yahoo(s, "5d", "1d"), l, k)))).filter(Boolean);
  const [selic, ipca, usd] = await Promise.all([bcb(11), bcb(433), bcb(1)]);
  return json({ quotes, macro: { selic, ipca, usd_brl: usd } });
});
