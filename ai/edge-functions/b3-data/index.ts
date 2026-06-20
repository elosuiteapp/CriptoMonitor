// Edge Function: b3-data (proxy grátis da B3 — Yahoo + BCB, sem token, sem CORS)
// Módulo B3 admin-only. Proxy read-only. Modos no body:
//   { mode: "overview" }            -> watchlist (IBOV, dólar, ações) + macro BR
//   { mode: "chart", ticker }       -> candles diários (3 meses)
//   { mode: "macro" }               -> macro global + correlações do IBOV + macro BR
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

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
// Referências globais p/ correlação com o IBOV.
const GLOBALS: [string, string][] = [
  ["S&P 500", "^GSPC"],
  ["Nasdaq", "^IXIC"],
  ["Dólar", "USDBRL=X"],
  ["Ouro", "GC=F"],
  ["Petróleo (Brent)", "BZ=F"],
  ["VIX", "^VIX"],
];

// Timeframe → (intervalo, janela) do Yahoo. 4h não existe no Yahoo → agrega 1h.
const TF_MAP: Record<string, { interval: string; range: string; agg?: number }> = {
  "15m": { interval: "15m", range: "5d" },
  "1h": { interval: "60m", range: "1mo" },
  "4h": { interval: "60m", range: "3mo", agg: 4 },
  "1d": { interval: "1d", range: "1y" },
  "1w": { interval: "1wk", range: "5y" },
  "1M": { interval: "1mo", range: "max" },
};
interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
function aggregate(c: Candle[], n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < c.length; i += n) {
    const g = c.slice(i, i + n);
    if (!g.length) continue;
    out.push({ time: g[0].time, open: g[0].open, high: Math.max(...g.map((x) => x.high)), low: Math.min(...g.map((x) => x.low)), close: g[g.length - 1].close, volume: g.reduce((s, x) => s + (x.volume || 0), 0) });
  }
  return out;
}

const Y = "https://query1.finance.yahoo.com/v8/finance/chart/";
// deno-lint-ignore no-explicit-any
async function yahoo(symbol: string, range: string, interval: string): Promise<any> {
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
  const m = j?.chart?.result?.[0]?.meta;
  if (!m || m.regularMarketPrice == null) return null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? null;
  const changePct = prev ? ((m.regularMarketPrice - prev) / prev) * 100 : null;
  return { symbol: label, kind, name: m.shortName ?? label, price: m.regularMarketPrice, changePct, volume: m.regularMarketVolume ?? null };
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
// deno-lint-ignore no-explicit-any
function closeMap(j: any): Record<string, number> {
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const cl: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
  const map: Record<string, number> = {};
  for (let i = 0; i < ts.length; i++) if (cl[i] != null) map[new Date(ts[i] * 1000).toISOString().slice(0, 10)] = cl[i] as number;
  return map;
}
function alignedReturns(a: Record<string, number>, b: Record<string, number>): [number[], number[]] {
  const dates = Object.keys(a).filter((d) => d in b).sort();
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const a0 = a[dates[i - 1]];
    const a1 = a[dates[i]];
    const b0 = b[dates[i - 1]];
    const b1 = b[dates[i]];
    if (a0 && b0) {
      ra.push((a1 - a0) / a0);
      rb.push((b1 - b0) / b0);
    }
  }
  return [ra, rb];
}
function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : null;
}

// Boletim Focus (BCB Olinda) — expectativas de mercado para o ano corrente.
async function focus(): Promise<Record<string, number | null> | null> {
  const yr = new Date().getFullYear();
  const url = `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=200&$orderby=Data desc&$format=json&$filter=DataReferencia eq '${yr}'`;
  try {
    const r = await fetch(encodeURI(url), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const rows = ((await r.json())?.value ?? []) as Array<{ Indicador: string; Mediana: number }>;
    const pick = (ind: string) => rows.find((x) => x.Indicador === ind)?.Mediana ?? null; // 1º = mais recente (ordenado desc)
    return { year: yr, ipca: pick("IPCA"), selic: pick("Selic"), pib: pick("PIB Total"), cambio: pick("Câmbio") };
  } catch {
    return null;
  }
}

// ADRs na NYSE × ação local → prêmio/desconto (termômetro do estrangeiro). Ratio 1:1.
const ADRS: [string, string, string][] = [
  ["Vale", "VALE", "VALE3.SA"],
  ["Itaú", "ITUB", "ITUB4.SA"],
  ["Bradesco", "BBD", "BBDC4.SA"],
  ["Ambev", "ABEV", "ABEV3.SA"],
];
async function adrPremiums(usdBrl: number | null): Promise<Array<{ name: string; ticker: string; premiumPct: number }>> {
  if (!usdBrl) return [];
  const out: Array<{ name: string; ticker: string; premiumPct: number }> = [];
  await Promise.all(
    ADRS.map(async ([name, adr, local]) => {
      const [ja, jl] = await Promise.all([yahoo(adr, "1d", "1d"), yahoo(local, "1d", "1d")]);
      const pa = ja?.chart?.result?.[0]?.meta?.regularMarketPrice;
      const pl = jl?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (pa && pl) out.push({ name, ticker: local.replace(".SA", ""), premiumPct: ((pa * usdBrl) / pl - 1) * 100 });
    }),
  );
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));

  if (body.mode === "chart" && body.ticker) {
    const sym = TMAP[String(body.ticker)] ?? String(body.ticker);
    const tf = TF_MAP[String(body.tf)] ?? TF_MAP["1d"];
    const res = (await yahoo(sym, tf.range, tf.interval))?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    let candles = ts
      .map((t, i) => ({ time: t, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i] }))
      .filter((c) => c.close != null);
    if (tf.agg) candles = aggregate(candles as Candle[], tf.agg);
    return json({ candles });
  }

  if (body.mode === "macro") {
    const refs: [string, string][] = [["IBOV", "^BVSP"], ...GLOBALS];
    const fetched = await Promise.all(refs.map(async ([l, s]) => [l, await yahoo(s, "6mo", "1d")] as [string, unknown]));
    const byLabel: Record<string, { map: Record<string, number>; price: number | null; changePct: number | null }> = {};
    for (const [l, j] of fetched) {
      // deno-lint-ignore no-explicit-any
      const m = (j as any)?.chart?.result?.[0]?.meta;
      const prev = m?.chartPreviousClose ?? m?.previousClose ?? null;
      byLabel[l] = { map: closeMap(j), price: m?.regularMarketPrice ?? null, changePct: prev && m?.regularMarketPrice != null ? ((m.regularMarketPrice - prev) / prev) * 100 : null };
    }
    const ibov = byLabel["IBOV"]?.map ?? {};
    const correlations = GLOBALS.map(([l]) => {
      const [ra, rb] = alignedReturns(ibov, byLabel[l]?.map ?? {});
      return { ref: l, c30: pearson(ra.slice(-30), rb.slice(-30)), c90: pearson(ra.slice(-90), rb.slice(-90)) };
    });
    const globals = GLOBALS.map(([l]) => ({ symbol: l, price: byLabel[l]?.price ?? null, changePct: byLabel[l]?.changePct ?? null }));
    const usdSpot = byLabel["Dólar"]?.price ?? null;
    const [selic, ipca, usd, focusData, adrs] = await Promise.all([bcb(11), bcb(433), bcb(1), focus(), adrPremiums(usdSpot)]);
    return json({ globals, correlations, macro: { selic, ipca, usd_brl: usd }, focus: focusData, adrs });
  }

  // overview: watchlist + macro BR
  const quotes = (await Promise.all(SYMS.map(async ([l, s, k]) => quoteOf(await yahoo(s, "5d", "1d"), l, k)))).filter(Boolean);
  const [selic, ipca, usd] = await Promise.all([bcb(11), bcb(433), bcb(1)]);
  return json({ quotes, macro: { selic, ipca, usd_brl: usd } });
});
