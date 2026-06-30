// Dados da B3 (módulo admin-only) — via edge `b3-data` (Yahoo + BCB, grátis, sem
// token, sem CORS). Fundamentos via brapi (grátis p/ 4 ações; token p/ as demais).

import { supabase } from "./supabase";

export type B3Kind = "index" | "currency" | "stock" | "fii";
export interface B3Quote {
  symbol: string; // IBOV, USD/BRL, PETR4, MXRF11…
  kind: B3Kind;
  name: string;
  price: number | null;
  changePct: number | null; // dia
  volume: number | null;
  w1?: number | null; // 7 dias
  d15?: number | null; // 15 dias
  d30?: number | null; // 30 dias
  fh52?: number | null; // máxima 52 semanas (Yahoo meta)
  fl52?: number | null; // mínima 52 semanas (Yahoo meta)
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
  selic: number | null; // % ao dia (BCB série 11) — anualizar no front
  ipca: number | null; // % no mês (BCB série 433)
  usd_brl: number | null; // PTAX venda (BCB série 1)
  cdi?: number | null; // % a.a. já anualizado (BCB série 4389) — referência de renda fixa/FII
  ibc_br?: { value: number; momPct: number } | null; // IBC-Br (BCB 24364) + variação mensal — atividade econômica
  unemployment?: number | null; // % desocupação PNAD Contínua (BCB 24369)
}
/** Commodity que move o Ibovespa (Yahoo) + as ações da B3 que ela costuma antecipar. */
export interface B3Commodity {
  symbol: string;
  price: number | null;
  changePct: number | null; // dia
  w1?: number | null; // 7 dias
  impacts: string; // ações que costuma mover
}
/** Componente do Medo & Ganância Brasil (0..100, transparente/auditável). */
export interface B3FngComponent {
  key: string;
  label: string;
  score: number; // 0..100
}
/** Índice Medo & Ganância Brasil (próprio) — 0=medo extremo, 100=ganância extrema. */
export interface B3Fng {
  score: number; // 0..100
  label: string; // Medo extremo / Medo / Neutro / Ganância / Ganância extrema
  components: B3FngComponent[];
}
export interface B3Overview {
  quotes: B3Quote[];
  macro: B3Macro;
  commodities?: B3Commodity[];
  fng?: B3Fng | null;
  ifix?: B3Global | null; // IFIX — índice de FIIs (benchmark da classe): preço + variação do dia
}

export interface B3Asset {
  symbol: string;
  name: string;
  kind: B3Kind;
}
/** Universo do módulo B3 (índice, dólar e ações líquidas) — alimenta o seletor.
 *  Sincronizado com a lista SYMS da edge b3-data. */
export const B3_ASSETS: B3Asset[] = [
  { symbol: "IBOV", name: "Ibovespa", kind: "index" },
  { symbol: "USD/BRL", name: "Dólar", kind: "currency" },
  { symbol: "PETR4", name: "Petrobras PN", kind: "stock" },
  { symbol: "PETR3", name: "Petrobras ON", kind: "stock" },
  { symbol: "VALE3", name: "Vale ON", kind: "stock" },
  { symbol: "ITUB4", name: "Itaú PN", kind: "stock" },
  { symbol: "ITSA4", name: "Itaúsa PN", kind: "stock" },
  { symbol: "BBDC4", name: "Bradesco PN", kind: "stock" },
  { symbol: "BBAS3", name: "Banco do Brasil", kind: "stock" },
  { symbol: "BPAC11", name: "BTG Pactual", kind: "stock" },
  { symbol: "B3SA3", name: "B3 ON", kind: "stock" },
  { symbol: "WEGE3", name: "WEG ON", kind: "stock" },
  { symbol: "ABEV3", name: "Ambev ON", kind: "stock" },
  { symbol: "PRIO3", name: "PRIO ON", kind: "stock" },
  { symbol: "RAIL3", name: "Rumo ON", kind: "stock" },
  { symbol: "RENT3", name: "Localiza ON", kind: "stock" },
  { symbol: "SUZB3", name: "Suzano ON", kind: "stock" },
  { symbol: "CSAN3", name: "Cosan ON", kind: "stock" },
  { symbol: "RDOR3", name: "Rede D'Or", kind: "stock" },
  { symbol: "GGBR4", name: "Gerdau PN", kind: "stock" },
  { symbol: "RADL3", name: "Raia Drogasil", kind: "stock" },
  { symbol: "LREN3", name: "Lojas Renner", kind: "stock" },
  { symbol: "UGPA3", name: "Ultrapar ON", kind: "stock" },
  { symbol: "EQTL3", name: "Equatorial", kind: "stock" },
  { symbol: "SBSP3", name: "Sabesp ON", kind: "stock" },
  { symbol: "CMIG4", name: "Cemig PN", kind: "stock" },
  { symbol: "VBBR3", name: "Vibra ON", kind: "stock" },
  { symbol: "MGLU3", name: "Magazine Luiza", kind: "stock" },
  { symbol: "TAEE11", name: "Taesa", kind: "stock" },
  { symbol: "BBSE3", name: "BB Seguridade", kind: "stock" },
  { symbol: "CXSE3", name: "Caixa Seguridade", kind: "stock" },
  { symbol: "VIVT3", name: "Vivo (Telefônica)", kind: "stock" },
  { symbol: "CPLE6", name: "Copel PNB", kind: "stock" },
  { symbol: "KLBN11", name: "Klabin", kind: "stock" },
];

/** Setor de cada ação (curado) — alimenta o filtro/comparador setorial do screener. */
export const B3_SECTORS: Record<string, string> = {
  ITUB4: "Bancos", BBDC4: "Bancos", BBAS3: "Bancos", BPAC11: "Bancos",
  ITSA4: "Seguros & Financeiro", B3SA3: "Seguros & Financeiro", BBSE3: "Seguros & Financeiro", CXSE3: "Seguros & Financeiro",
  PETR4: "Petróleo & Gás", PETR3: "Petróleo & Gás", PRIO3: "Petróleo & Gás", UGPA3: "Petróleo & Gás", VBBR3: "Petróleo & Gás", CSAN3: "Petróleo & Gás",
  VALE3: "Mineração & Siderurgia", GGBR4: "Mineração & Siderurgia",
  EQTL3: "Energia & Saneamento", CMIG4: "Energia & Saneamento", SBSP3: "Energia & Saneamento", TAEE11: "Energia & Saneamento", CPLE6: "Energia & Saneamento",
  ABEV3: "Consumo & Varejo", LREN3: "Consumo & Varejo", MGLU3: "Consumo & Varejo", RENT3: "Consumo & Varejo", RADL3: "Consumo & Varejo",
  RDOR3: "Saúde",
  WEGE3: "Indústria & Logística", RAIL3: "Indústria & Logística",
  SUZB3: "Papel & Celulose", KLBN11: "Papel & Celulose",
  VIVT3: "Telecom",
};
export const b3Sector = (symbol: string): string => B3_SECTORS[symbol] ?? "Outros";

/** Universo de FIIs (fundos imobiliários) — lista separada, alimenta o 2º seletor do header. */
export const B3_FIIS: B3Asset[] = [
  { symbol: "MXRF11", name: "Maxi Renda (CRI)", kind: "fii" },
  { symbol: "KNCR11", name: "Kinea Rendimentos (CRI)", kind: "fii" },
  { symbol: "KNIP11", name: "Kinea Índices (CRI)", kind: "fii" },
  { symbol: "IRDM11", name: "Iridium (CRI)", kind: "fii" },
  { symbol: "RECR11", name: "REC Recebíveis (CRI)", kind: "fii" },
  { symbol: "HGLG11", name: "CSHG Logística", kind: "fii" },
  { symbol: "XPLG11", name: "XP Log", kind: "fii" },
  { symbol: "BTLG11", name: "BTG Logística", kind: "fii" },
  { symbol: "VILG11", name: "Vinci Logística", kind: "fii" },
  { symbol: "XPML11", name: "XP Malls", kind: "fii" },
  { symbol: "VISC11", name: "Vinci Shopping", kind: "fii" },
  { symbol: "HGBS11", name: "Hedge Brasil Shopping", kind: "fii" },
  { symbol: "KNRI11", name: "Kinea Renda Imob.", kind: "fii" },
  { symbol: "HGRU11", name: "CSHG Renda Urbana", kind: "fii" },
  { symbol: "HGRE11", name: "CSHG Real Estate", kind: "fii" },
  { symbol: "TRXF11", name: "TRX Real Estate", kind: "fii" },
  { symbol: "RBRF11", name: "RBR Alpha (FOF)", kind: "fii" },
];
export const isFii = (symbol: string): boolean => B3_FIIS.some((f) => f.symbol === symbol);

export interface B3Global {
  symbol: string;
  price: number | null;
  changePct: number | null;
}
export interface B3Corr {
  ref: string;
  c30: number | null;
  c90: number | null;
}
export interface B3Focus {
  year: number;
  ipca: number | null;
  selic: number | null;
  pib: number | null;
  cambio: number | null;
}
export interface B3Adr {
  name: string;
  ticker: string;
  premiumPct: number; // ADR (USD×PTAX) vs ação local
}
export interface B3MacroData {
  globals: B3Global[];
  correlations: B3Corr[];
  macro: B3Macro;
  focus?: B3Focus | null;
  adrs?: B3Adr[];
}

/** Macro global + correlações do IBOV + macro BR (aba Macro & Correlações da B3). */
// ── Cache em memória com TTL (B3-only) — evita re-buscar o MESMO dado de mercado a
//    cada troca de aba (o "pisca"). Guarda a PROMISE (dedupa chamadas simultâneas);
//    resultado vazio/erro NÃO fica cacheado (permite retry). Não toca o cripto. ──
const _b3Cache = new Map<string, { t: number; p: Promise<unknown> }>();
function b3Cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, isEmpty: (v: T) => boolean): Promise<T> {
  const now = Date.now();
  const hit = _b3Cache.get(key);
  if (hit && now - hit.t < ttlMs) return hit.p as Promise<T>;
  const p = fn();
  _b3Cache.set(key, { t: now, p });
  const drop = () => {
    if (_b3Cache.get(key)?.p === p) _b3Cache.delete(key);
  };
  p.then((v) => {
    if (isEmpty(v)) drop();
  }, drop);
  return p;
}

export function fetchB3Macro(): Promise<B3MacroData | null> {
  return b3Cached(
    "macro",
    180_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "macro" } });
        if (error || !data) return null;
        return data as B3MacroData;
      } catch {
        return null;
      }
    },
    (v) => v == null,
  );
}

/** Watchlist (IBOV + dólar + ações) + macro BR. */
export function fetchB3Overview(): Promise<B3Overview | null> {
  return b3Cached(
    "overview",
    180_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "overview" } });
        if (error || !data) return null;
        return data as B3Overview;
      } catch {
        return null;
      }
    },
    (v) => v == null,
  );
}

export interface B3FlowRow {
  date: string;
  foreign_mi: number | null;
  institutional_mi: number | null;
  retail_mi: number | null;
  financial_mi: number | null;
  other_mi: number | null;
}

/** Fluxo de investimento na B3 por tipo de investidor (estrangeiro/institucional/PF/…),
 *  diário em R$ milhões — via raspagem do dadosdemercado (edge b3-flow). Market-wide. */
export function fetchB3Flow(): Promise<B3FlowRow[]> {
  return b3Cached(
    "flow",
    600_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-flow", { body: {} });
        if (error || !data) return [];
        return (data as { flow?: B3FlowRow[] }).flow ?? [];
      } catch {
        return [];
      }
    },
    (v) => v.length === 0,
  );
}

/** Candles de qualquer ativo da B3 (IBOV/dólar/ações) no timeframe pedido
 *  (15m/1h/4h/1d/1w/1M). 4h é agregado de 1h no servidor. */
export function fetchB3Chart(ticker: string, tf = "1d"): Promise<B3Candle[]> {
  return b3Cached(
    `chart:${ticker}:${tf}`,
    120_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "chart", ticker, tf } });
        if (error || !data) return [];
        // Sanitiza: descarta velas corrompidas (OHLC <= 0 ou inválido) que vêm às vezes
        // do provedor e viram um "spike" gigante no gráfico (ex.: low=0).
        return ((data as { candles?: B3Candle[] }).candles ?? []).filter(
          (c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0) && c.high >= c.low,
        );
      } catch {
        return [];
      }
    },
    (v) => v.length === 0,
  );
}

// ── Fundamentos via Fundamentus (1 request traz a bolsa toda, grátis, server-side) ──
export interface B3Fund {
  price: number | null;
  pl: number | null; // P/L
  pvp: number | null; // P/VP
  dy: number | null; // Dividend Yield (%)
  psr: number | null; // P/Receita (preço sobre vendas)
  pEbit: number | null; // P/EBIT
  evEbit: number | null; // EV/EBIT
  evEbitda: number | null;
  mrgBruta: number | null; // margem bruta (%)
  mrgEbit: number | null; // margem EBIT (%)
  mrgLiq: number | null; // margem líquida (%)
  liqCorr: number | null; // liquidez corrente
  roic: number | null; // ROIC (%)
  roe: number | null; // ROE (%)
  liq2m: number | null; // liquidez média 2 meses (R$/dia)
  patrimLiq: number | null; // patrimônio líquido (R$)
  divLiqPatrim: number | null; // dívida líquida / patrimônio
  crescRec5a: number | null; // crescimento da receita em 5 anos (%)
}
export type B3Funds = Record<string, B3Fund>;

/** Fundamentos de TODAS as ações do universo (P/L, P/VP, DY, ROE…) numa só chamada. */
export function fetchB3FundamentalsAll(): Promise<B3Funds> {
  return b3Cached(
    "fund-all",
    300_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "fundamentals" } });
        if (error || !data) return {};
        return ((data as { funds?: B3Funds }).funds ?? {}) as B3Funds;
      } catch {
        return {};
      }
    },
    (v) => Object.keys(v).length === 0,
  );
}

// ── Fundamentos de FIIs (Fundamentus fii_resultado.php — indicadores próprios de FII) ──
export interface B3FiiFund {
  segmento: string | null; // Logística, Shopping, Papel/CRI, Lajes…
  price: number | null;
  ffoYield: number | null; // FFO Yield (%)
  dy: number | null; // Dividend Yield (%)
  pvp: number | null; // P/VP
  valorMercado: number | null; // R$
  liquidez: number | null; // R$/dia
  qtdImoveis: number | null;
  capRate: number | null; // %
  vacancia: number | null; // vacância média (%)
  precoM2: number | null; // preço do m² (R$) — só FII de tijolo
  aluguelM2: number | null; // aluguel do m² (R$) — só FII de tijolo
}
export type B3FiiFunds = Record<string, B3FiiFund>;

/** Fundamentos de TODOS os FIIs do universo (P/VP, DY, Cap Rate, Vacância…) numa só chamada. */
export function fetchB3FiisAll(): Promise<B3FiiFunds> {
  return b3Cached(
    "fii-all",
    300_000,
    async () => {
      try {
        const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "fundamentals", kind: "fii" } });
        if (error || !data) return {};
        return ((data as { fiis?: B3FiiFunds }).fiis ?? {}) as B3FiiFunds;
      } catch {
        return {};
      }
    },
    (v) => Object.keys(v).length === 0,
  );
}

// ── Detalhe POR FII (Fundamentus detalhes.php — 1 request por fundo, on-demand) ──
export interface B3FiiDetail {
  vpCota: number | null; // valor patrimonial por cota (R$) — base do deságio/ágio
  ffoCota: number | null; // FFO por cota (geração de caixa)
  divCota: number | null; // dividendo/rendimento por cota declarado (último)
  patrimLiq: number | null; // patrimônio líquido (R$) — porte do fundo
  valorMercado: number | null; // valor de mercado (R$)
  numCotas: number | null; // nº total de cotas
  min52: number | null; // mínima 52 semanas (R$)
  max52: number | null; // máxima 52 semanas (R$)
}
/** Detalhe de um FII (VP/Cota, patrimônio, nº de cotas…) via Fundamentus. null se o scrape falhar. */
// ── Maré macro GLOBAL (FRED via macro_global) — já coletada p/ o cripto; o B3
//    apenas LÊ a tabela compartilhada (market-wide). Liquidez do Fed, juros real,
//    spread HY, condições financeiras (NFCI) e curva 2s10s = pano de fundo risk-on/off
//    que move muito a bolsa BR. Isolado: nenhum arquivo do cripto é alterado. ──
export interface B3MacroGlobal {
  netLiquidityBusd: number | null;
  nlChg30dPct: number | null;
  realYield10y: number | null;
  hySpread: number | null;
  nfci: number | null;
  yieldCurve: number | null;
  m2: number | null;
}
const _num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export function fetchMacroGlobal(): Promise<B3MacroGlobal | null> {
  return b3Cached(
    "macro-global",
    300_000,
    async () => {
      try {
        const { data, error } = await supabase
          .from("macro_global")
          .select("net_liquidity_busd, nl_chg_30d_pct, real_yield_10y, hy_spread, nfci, yield_curve, m2")
          .order("ts", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        const d = data as Record<string, unknown>;
        return {
          netLiquidityBusd: _num(d.net_liquidity_busd),
          nlChg30dPct: _num(d.nl_chg_30d_pct),
          realYield10y: _num(d.real_yield_10y),
          hySpread: _num(d.hy_spread),
          nfci: _num(d.nfci),
          yieldCurve: _num(d.yield_curve),
          m2: _num(d.m2),
        };
      } catch {
        return null;
      }
    },
    (v) => v == null,
  );
}

/** Score risk-on/off (-100..+100) da maré global — favorece (≥) ou pressiona (≤) ativos
 *  de risco como a B3. Liquidez subindo, NFCI frouxo, HY apertado, juros real baixo e
 *  curva normal = favorável; o oposto = adverso. */
export function globalTideScore(mg: B3MacroGlobal | null): { score: number; label: string } | null {
  if (!mg) return null;
  let s = 0;
  let n = 0;
  if (mg.nlChg30dPct != null) { s += mg.nlChg30dPct >= 0.5 ? 1 : mg.nlChg30dPct <= -0.5 ? -1 : 0; n++; }
  if (mg.nfci != null) { s += mg.nfci < -0.2 ? 1 : mg.nfci > 0.2 ? -1 : 0; n++; }
  if (mg.hySpread != null) { s += mg.hySpread < 3.5 ? 1 : mg.hySpread > 5 ? -1 : 0; n++; }
  if (mg.realYield10y != null) { s += mg.realYield10y < 1.5 ? 1 : mg.realYield10y > 2 ? -1 : 0; n++; }
  if (mg.yieldCurve != null) { s += mg.yieldCurve < 0 ? -1 : 0; n++; }
  if (n === 0) return null;
  const score = Math.round((s / n) * 100);
  const label = score >= 25 ? "favorável a risco (risk-on)" : score <= -25 ? "adverso (risk-off)" : "misto";
  return { score, label };
}

export async function fetchB3FiiDetail(ticker: string): Promise<B3FiiDetail | null> {
  if (!isFii(ticker)) return null;
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "fii-detail", ticker } });
    if (error || !data) return null;
    return ((data as { detail?: B3FiiDetail | null }).detail ?? null);
  } catch {
    return null;
  }
}

export interface B3Dividend {
  date: number; // epoch (s)
  amount: number; // R$ por ação
}
export interface B3DividendsData {
  price: number | null;
  dividends: B3Dividend[];
}
/** Histórico de proventos de um ativo (Yahoo events=div). */
export async function fetchB3Dividends(ticker: string, range = "5y"): Promise<B3DividendsData> {
  if (ticker.startsWith("^") || ticker.includes("/")) return { price: null, dividends: [] };
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "dividends", ticker, range } });
    if (error || !data) return { price: null, dividends: [] };
    return data as B3DividendsData;
  } catch {
    return { price: null, dividends: [] };
  }
}

// ── Proventos com tipo (Dividendo/JCP/Rendimento) + agenda futura (StatusInvest) ──
export interface B3ProventoPast {
  date: number; // epoch (s) — data-com / data ex
  amount: number; // R$ por ação/cota
  type: string; // 'Dividendo' | 'JCP' | 'Rendimento' | ...
}
export interface B3ProventoUpcoming {
  exDate: number | null; // data-com (epoch s)
  payDate: number | null; // data de pagamento (epoch s)
  amount: number;
  type: string;
}
export interface B3ProventosData {
  past: B3ProventoPast[];
  upcoming: B3ProventoUpcoming[];
}
/** Proventos tipados + agenda de provisionados (data-com/pagamento futuros). */
export async function fetchB3Proventos(ticker: string, kind: "stock" | "fii"): Promise<B3ProventosData> {
  if (ticker.startsWith("^") || ticker.includes("/")) return { past: [], upcoming: [] };
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "proventos", ticker, kind } });
    if (error || !data) return { past: [], upcoming: [] };
    return data as B3ProventosData;
  } catch {
    return { past: [], upcoming: [] };
  }
}
