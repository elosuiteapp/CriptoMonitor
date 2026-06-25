// Edge Function: b3-data (proxy grátis da B3 — Yahoo + BCB + Fundamentus, sem token, sem CORS)
// Módulo B3 admin-only. Proxy read-only. Modos no body:
//   { mode: "overview" }            -> watchlist (IBOV, dólar, ações) + macro BR
//   { mode: "chart", ticker }       -> candles diários (3 meses)
//   { mode: "macro" }               -> macro global + correlações do IBOV + macro BR
//   { mode: "fundamentals" }        -> fundamentos das ações (P/L, P/VP, DY, ROE… via Fundamentus)
//   { mode: "dividends", ticker }   -> histórico de proventos (Yahoo events=div)
//   { mode: "proventos", ticker }   -> proventos com tipo (Div/JCP) + agenda (StatusInvest)
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
  ["PETR3", "PETR3.SA", "stock"],
  ["VALE3", "VALE3.SA", "stock"],
  ["ITUB4", "ITUB4.SA", "stock"],
  ["ITSA4", "ITSA4.SA", "stock"],
  ["BBDC4", "BBDC4.SA", "stock"],
  ["BBAS3", "BBAS3.SA", "stock"],
  ["BPAC11", "BPAC11.SA", "stock"],
  ["B3SA3", "B3SA3.SA", "stock"],
  ["WEGE3", "WEGE3.SA", "stock"],
  ["ABEV3", "ABEV3.SA", "stock"],
  ["PRIO3", "PRIO3.SA", "stock"],
  ["RAIL3", "RAIL3.SA", "stock"],
  ["RENT3", "RENT3.SA", "stock"],
  ["SUZB3", "SUZB3.SA", "stock"],
  ["CSAN3", "CSAN3.SA", "stock"],
  ["RDOR3", "RDOR3.SA", "stock"],
  ["GGBR4", "GGBR4.SA", "stock"],
  ["RADL3", "RADL3.SA", "stock"],
  ["LREN3", "LREN3.SA", "stock"],
  ["UGPA3", "UGPA3.SA", "stock"],
  ["EQTL3", "EQTL3.SA", "stock"],
  ["SBSP3", "SBSP3.SA", "stock"],
  ["CMIG4", "CMIG4.SA", "stock"],
  ["VBBR3", "VBBR3.SA", "stock"],
  ["MGLU3", "MGLU3.SA", "stock"],
  // Pagadoras clássicas de dividendos (reforçam a aba de proventos).
  ["TAEE11", "TAEE11.SA", "stock"],
  ["BBSE3", "BBSE3.SA", "stock"],
  ["CXSE3", "CXSE3.SA", "stock"],
  ["VIVT3", "VIVT3.SA", "stock"],
  ["CPLE6", "CPLE6.SA", "stock"],
  ["KLBN11", "KLBN11.SA", "stock"],
];
// Fundos imobiliários (FIIs) líquidos, por segmento (papel/CRI, logística, shopping, lajes/híbrido, FOF).
const SYMS_FII: [string, string][] = [
  ["MXRF11", "MXRF11.SA"],
  ["KNCR11", "KNCR11.SA"],
  ["KNIP11", "KNIP11.SA"],
  ["IRDM11", "IRDM11.SA"],
  ["RECR11", "RECR11.SA"],
  ["HGLG11", "HGLG11.SA"],
  ["XPLG11", "XPLG11.SA"],
  ["BTLG11", "BTLG11.SA"],
  ["VILG11", "VILG11.SA"],
  ["XPML11", "XPML11.SA"],
  ["VISC11", "VISC11.SA"],
  ["HGBS11", "HGBS11.SA"],
  ["KNRI11", "KNRI11.SA"],
  ["HGRU11", "HGRU11.SA"],
  ["HGRE11", "HGRE11.SA"],
  ["TRXF11", "TRXF11.SA"],
  ["RBRF11", "RBRF11.SA"],
];
const TMAP: Record<string, string> = Object.fromEntries([...SYMS.map(([l, s]) => [l, s]), ...SYMS_FII.map(([l, s]) => [l, s])]);
// Referências globais p/ correlação com o IBOV.
const GLOBALS: [string, string][] = [
  ["S&P 500", "^GSPC"],
  ["Nasdaq", "^IXIC"],
  ["Dólar", "USDBRL=X"],
  ["Ouro", "GC=F"],
  ["Petróleo (Brent)", "BZ=F"],
  ["VIX", "^VIX"],
];
// Commodities que movem o Ibovespa (Yahoo, grátis). Cada uma mapeada às ações da B3
// que ela costuma antecipar — o "minério subiu na Ásia → VALE3 abre em alta".
// GAP conhecido: minério de ferro não tem feed grátis bom → cobre serve de proxy de
// metais p/ VALE3/siderúrgicas (ver docs/b3-roadmap.md).
const COMMODITIES: [string, string, string][] = [
  ["Petróleo (Brent)", "BZ=F", "PETR4 · PRIO3"],
  ["Cobre", "HG=F", "VALE3 · CSNA3 · GGBR4"],
  ["Ouro", "GC=F", "mineradoras de ouro"],
];

// Timeframe → (intervalo, janela) do Yahoo. 4h não existe no Yahoo → agrega 1h.
// Janelas generosas (mais histórico), respeitando os limites do Yahoo por intervalo
// (15m até 60d; 60m/1h até 730d; diário/semanal/mensal até "max").
const TF_MAP: Record<string, { interval: string; range: string; agg?: number }> = {
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "6mo" },
  "4h": { interval: "60m", range: "1y", agg: 4 },
  "1d": { interval: "1d", range: "5y" },
  "1w": { interval: "1wk", range: "max" },
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

// Roda em LOTES (limite de concorrência) — evita o throttle do Yahoo com muitos símbolos.
async function mapLimit<T, R>(arr: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < arr.length; i += limit) {
    out.push(...(await Promise.all(arr.slice(i, i + limit).map(fn))));
  }
  return out;
}

const Y = "https://query1.finance.yahoo.com/v8/finance/chart/";
// deno-lint-ignore no-explicit-any
async function yahoo(symbol: string, range: string, interval: string, events = false): Promise<any> {
  try {
    const ev = events ? "&events=div" : "";
    const r = await fetch(`${Y}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}${ev}`, { headers: { "User-Agent": "Mozilla/5.0" } });
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
  const ts: number[] = res?.timestamp ?? [];
  const cl: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
  const series: [number, number][] = [];
  for (let i = 0; i < ts.length; i++) if (cl[i] != null) series.push([ts[i], cl[i] as number]);
  const last = m.regularMarketPrice;
  const nowSec = series.length ? series[series.length - 1][0] : 0;
  // fechamento ao/antes de N dias corridos atrás (retorno por período).
  const ago = (days: number): number | null => {
    const t = nowSec - days * 86400;
    for (let i = series.length - 1; i >= 0; i--) if (series[i][0] <= t) return series[i][1];
    return null;
  };
  const pct = (from: number | null) => (from && Number.isFinite(from) ? ((last - from) / from) * 100 : null);
  return {
    symbol: label,
    kind,
    name: m.shortName ?? label,
    price: last,
    changePct: pct(ago(1)),
    volume: m.regularMarketVolume ?? null,
    w1: pct(ago(7)),
    d15: pct(ago(15)),
    d30: pct(ago(30)),
  };
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
// Últimos 2 pontos de uma série (p/ variação no período — ex.: IBC-Br mês a mês).
async function bcbLast2(code: number): Promise<[number, number] | null> {
  try {
    const r = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/2?formato=json`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const a = (await r.json()) as Array<{ valor: string }>;
    if (!a || a.length < 2) return null;
    const prev = Number(a[0].valor);
    const cur = Number(a[1].valor);
    return Number.isFinite(prev) && Number.isFinite(cur) ? [prev, cur] : null;
  } catch {
    return null;
  }
}
// Pacote macro BR (BCB SGS, grátis e sem chave) — usado pelos modos overview e macro.
// Selic 11 (% a.d. → anualizar no front), IPCA 433 (% mês), PTAX venda 1, CDI 4389
// (% a.a., já anualizado), IBC-Br 24364 (índice + var. mensal), desocupação PNAD 24369.
async function buildMacroBR() {
  const [selic, ipca, usd, cdi, ibc, unemployment] = await Promise.all([
    bcb(11), bcb(433), bcb(1), bcb(4389), bcbLast2(24364), bcb(24369),
  ]);
  const ibc_br = ibc && ibc[0] !== 0 ? { value: ibc[1], momPct: ((ibc[1] - ibc[0]) / ibc[0]) * 100 } : null;
  return { selic, ipca, usd_brl: usd, cdi, ibc_br, unemployment };
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

// ── Fundamentos via Fundamentus (resultado.php — 1 request traz a bolsa toda) ──
// Número no formato BR ("1.234,56" / "7,65%" / "-") → number | null.
function parseBR(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim().replace(/%/g, "");
  if (t === "" || t === "-") return null;
  const n = Number(t.replace(/\./g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}
interface Fund {
  price: number | null; pl: number | null; pvp: number | null; dy: number | null;
  evEbitda: number | null; mrgEbit: number | null; mrgLiq: number | null; liqCorr: number | null;
  roic: number | null; roe: number | null; liq2m: number | null; patrimLiq: number | null;
  divLiqPatrim: number | null; crescRec5a: number | null;
}
// Colunas do resultado.php (fd-column-N): 0=Papel 1=Cotação 2=P/L 3=P/VP 4=PSR 5=Div.Yield
// 6=P/Ativo 7=P/CapGiro 8=P/EBIT 9=P/AtivCircLiq 10=EV/EBIT 11=EV/EBITDA 12=MrgBruta
// 13=MrgEbit 14=Mrg.Líq 15=LiqCorr 16=ROIC 17=ROE 18=Liq2meses 19=PatrimLíq 20=DívLíq/Patrim 21=CrescRec5a
async function fundamentals(only: Set<string>): Promise<Record<string, Fund>> {
  try {
    const r = await fetch("https://www.fundamentus.com.br/resultado.php", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return {};
    const buf = await r.arrayBuffer();
    let html: string;
    try {
      html = new TextDecoder("iso-8859-1").decode(buf);
    } catch {
      html = new TextDecoder().decode(buf);
    }
    const out: Record<string, Fund> = {};
    const rowRe = /papel=([A-Z0-9]{4,6})">[A-Z0-9]+<\/a><\/span><\/td>(.*?)<\/tr>/gs;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) !== null) {
      const papel = m[1];
      if (!only.has(papel)) continue;
      const tds = [...m[2].matchAll(/<td[^>]*>\s*([^<]*?)\s*<\/td>/g)].map((x) => x[1]);
      if (tds.length < 21) continue;
      out[papel] = {
        price: parseBR(tds[0]), pl: parseBR(tds[1]), pvp: parseBR(tds[2]), dy: parseBR(tds[4]),
        evEbitda: parseBR(tds[10]), mrgEbit: parseBR(tds[12]), mrgLiq: parseBR(tds[13]), liqCorr: parseBR(tds[14]),
        roic: parseBR(tds[15]), roe: parseBR(tds[16]), liq2m: parseBR(tds[17]), patrimLiq: parseBR(tds[18]),
        divLiqPatrim: parseBR(tds[19]), crescRec5a: parseBR(tds[20]),
      };
    }
    return out;
  } catch {
    return {};
  }
}

// Fundamentos de FIIs (fii_resultado.php). Colunas (tds 0-idx): 0=Segmento(texto) 1=Cotação
// 2=FFO Yield 3=Div.Yield 4=P/VP 5=Valor de Mercado 6=Liquidez 7=Qtd imóveis 8=Preço m2
// 9=Aluguel m2 10=Cap Rate 11=Vacância Média 12=Endereço(texto).
interface FiiFund {
  segmento: string | null; price: number | null; ffoYield: number | null; dy: number | null;
  pvp: number | null; valorMercado: number | null; liquidez: number | null; qtdImoveis: number | null;
  capRate: number | null; vacancia: number | null;
}
async function fundamentalsFii(only: Set<string>): Promise<Record<string, FiiFund>> {
  try {
    const r = await fetch("https://www.fundamentus.com.br/fii_resultado.php", { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return {};
    const buf = await r.arrayBuffer();
    let html: string;
    try {
      html = new TextDecoder("iso-8859-1").decode(buf);
    } catch {
      html = new TextDecoder().decode(buf);
    }
    const out: Record<string, FiiFund> = {};
    const rowRe = /papel=([A-Z0-9]{4,6})">[A-Z0-9]+<\/a><\/span><\/td>(.*?)<\/tr>/gs;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) !== null) {
      const papel = m[1];
      if (!only.has(papel)) continue;
      const tds = [...m[2].matchAll(/<td[^>]*>\s*([^<]*?)\s*<\/td>/g)].map((x) => x[1]);
      if (tds.length < 12) continue;
      const qtd = parseBR(tds[7]);
      const physical = (qtd ?? 0) > 0; // FII de tijolo (tem imóvel) vs papel/CRI/FOF
      let capRate = parseBR(tds[10]);
      let vacancia = parseBR(tds[11]);
      // Cap rate e vacância só fazem sentido em FII de tijolo. Vacância >50% no Fundamentus
      // é erro de dado (FII líquido não opera ~vazio) → anula em vez de exibir lixo.
      if (!physical) {
        capRate = null;
        vacancia = null;
      } else if (vacancia != null && vacancia > 50) {
        vacancia = null;
      }
      out[papel] = {
        segmento: tds[0]?.trim() || null, price: parseBR(tds[1]), ffoYield: parseBR(tds[2]), dy: parseBR(tds[3]),
        pvp: parseBR(tds[4]), valorMercado: parseBR(tds[5]), liquidez: parseBR(tds[6]), qtdImoveis: qtd,
        capRate, vacancia,
      };
    }
    return out;
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));

  if (body.mode === "chart" && body.ticker) {
    const label = String(body.ticker);
    const sym = TMAP[label] ?? label;
    const tf = TF_MAP[String(body.tf)] ?? TF_MAP["1d"];
    const res = (await yahoo(sym, tf.range, tf.interval))?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const q = res?.indicators?.quote?.[0] ?? {};
    let candles = ts
      .map((t, i) => ({ time: t, open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i], volume: q.volume?.[i] }))
      .filter((c) => c.close != null);
    // IBOV (^BVSP) é índice e não tem volume no Yahoo → enxerta o volume do ETF
    // BOVA11 (que segue o Ibovespa), casando por timestamp, pra o gráfico ter volume.
    if (label === "IBOV" || sym === "^BVSP") {
      const vres = (await yahoo("BOVA11.SA", tf.range, tf.interval))?.chart?.result?.[0];
      const vts: number[] = vres?.timestamp ?? [];
      const vvol: (number | null)[] = vres?.indicators?.quote?.[0]?.volume ?? [];
      const volByTime: Record<number, number> = {};
      for (let i = 0; i < vts.length; i++) if (vvol[i] != null) volByTime[vts[i]] = vvol[i] as number;
      candles = candles.map((c) => ({ ...c, volume: volByTime[c.time] ?? c.volume ?? 0 }));
    }
    if (tf.agg) candles = aggregate(candles as Candle[], tf.agg);
    return json({ candles });
  }

  if (body.mode === "dividends" && body.ticker) {
    const sym = TMAP[String(body.ticker)] ?? String(body.ticker);
    const j = await yahoo(sym, String(body.range ?? "5y"), "1d", true);
    const res = j?.chart?.result?.[0];
    const price = res?.meta?.regularMarketPrice ?? null;
    const divObj = (res?.events?.dividends ?? {}) as Record<string, { date: number; amount: number }>;
    const dividends = Object.values(divObj)
      .filter((d) => d && Number.isFinite(d.amount) && d.amount > 0)
      .map((d) => ({ date: d.date, amount: d.amount }))
      .sort((a, b) => a.date - b.date);
    return json({ price, dividends });
  }

  // proventos: tipo (Dividendo/JCP/Rendimento) + AGENDA (provisionados futuros).
  // Fonte grátis: endpoint JSON interno do StatusInvest (data-com `ed`, pagamento
  // `pd`, tipo `et`/`etd`, valor `v`). Yahoo não distingue tipo nem traz agenda.
  if (body.mode === "proventos" && body.ticker) {
    const ticker = String(body.ticker).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const seg = body.kind === "fii" ? "fii" : "acao";
    const url = `https://statusinvest.com.br/${seg}/companytickerprovents?ticker=${ticker}&chartProventsType=2`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Referer": "https://statusinvest.com.br/", "Accept": "application/json" },
      });
      if (!r.ok) return json({ past: [], upcoming: [] });
      const j = await r.json();
      // deno-lint-ignore no-explicit-any
      const models: any[] = Array.isArray(j?.assetEarningsModels) ? j.assetEarningsModels : [];
      const nowMs = Date.now();
      const parseDate = (s: unknown): number | null => {
        if (typeof s !== "string") return null;
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? Math.floor(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 1000) : null;
      };
      const normType = (et: unknown, etd: unknown): string => {
        const t = `${et ?? ""} ${etd ?? ""}`.toLowerCase();
        if (t.includes("jcp") || t.includes("juros")) return "JCP";
        if (t.includes("dividendo")) return "Dividendo";
        if (t.includes("rendimento") || t.includes("rend")) return "Rendimento";
        return typeof et === "string" && et ? et : "Provento";
      };
      const past: { date: number; amount: number; type: string }[] = [];
      const upcoming: { exDate: number | null; payDate: number | null; amount: number; type: string }[] = [];
      for (const e of models) {
        const amount = Number(e?.v);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const ex = parseDate(e?.ed);
        const pay = parseDate(e?.pd);
        const type = normType(e?.et, e?.etd);
        const refMs = ((pay ?? ex ?? 0) as number) * 1000;
        if (refMs > nowMs) upcoming.push({ exDate: ex, payDate: pay, amount, type });
        else if (ex) past.push({ date: ex, amount, type });
      }
      past.sort((a, b) => a.date - b.date);
      upcoming.sort((a, b) => ((a.payDate ?? a.exDate ?? 0) - (b.payDate ?? b.exDate ?? 0)));
      return json({ past, upcoming });
    } catch {
      return json({ past: [], upcoming: [] });
    }
  }

  if (body.mode === "fundamentals") {
    if (body.kind === "fii") {
      const fiis = await fundamentalsFii(new Set(SYMS_FII.map(([l]) => l)));
      return json({ fiis });
    }
    const stocks = new Set(SYMS.filter(([, , k]) => k === "stock").map(([l]) => l));
    const funds = await fundamentals(stocks);
    return json({ funds });
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
    const [macro, focusData, adrs] = await Promise.all([buildMacroBR(), focus(), adrPremiums(usdSpot)]);
    return json({ globals, correlations, macro, focus: focusData, adrs });
  }

  // overview: watchlist (índice, dólar, ações e FIIs) + macro BR + commodities
  const ALL: [string, string, string][] = [...SYMS, ...SYMS_FII.map(([l, s]) => [l, s, "fii"] as [string, string, string])];
  const [quotes, commodities, macro] = await Promise.all([
    mapLimit(ALL, 8, async ([l, s, k]) => quoteOf(await yahoo(s, "3mo", "1d"), l, k)).then((a) => a.filter(Boolean)),
    Promise.all(
      COMMODITIES.map(async ([label, sym, impacts]) => {
        const q = quoteOf(await yahoo(sym, "1mo", "1d"), label, "commodity");
        return q ? { symbol: label, price: q.price, changePct: q.changePct, w1: q.w1, impacts } : null;
      }),
    ).then((a) => a.filter(Boolean)),
    buildMacroBR(),
  ]);
  return json({ quotes, commodities, macro });
});
