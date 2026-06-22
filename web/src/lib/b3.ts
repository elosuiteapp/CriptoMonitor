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
export async function fetchB3Macro(): Promise<B3MacroData | null> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "macro" } });
    if (error || !data) return null;
    return data as B3MacroData;
  } catch {
    return null;
  }
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

/** Candles de qualquer ativo da B3 (IBOV/dólar/ações) no timeframe pedido
 *  (15m/1h/4h/1d/1w/1M). 4h é agregado de 1h no servidor. */
export async function fetchB3Chart(ticker: string, tf = "1d"): Promise<B3Candle[]> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "chart", ticker, tf } });
    if (error || !data) return [];
    return ((data as { candles?: B3Candle[] }).candles ?? []).filter((c) => Number.isFinite(c.close));
  } catch {
    return [];
  }
}

// ── Fundamentos via Fundamentus (1 request traz a bolsa toda, grátis, server-side) ──
export interface B3Fund {
  price: number | null;
  pl: number | null; // P/L
  pvp: number | null; // P/VP
  dy: number | null; // Dividend Yield (%)
  evEbitda: number | null;
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
export async function fetchB3FundamentalsAll(): Promise<B3Funds> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "fundamentals" } });
    if (error || !data) return {};
    return ((data as { funds?: B3Funds }).funds ?? {}) as B3Funds;
  } catch {
    return {};
  }
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
}
export type B3FiiFunds = Record<string, B3FiiFund>;

/** Fundamentos de TODOS os FIIs do universo (P/VP, DY, Cap Rate, Vacância…) numa só chamada. */
export async function fetchB3FiisAll(): Promise<B3FiiFunds> {
  try {
    const { data, error } = await supabase.functions.invoke("b3-data", { body: { mode: "fundamentals", kind: "fii" } });
    if (error || !data) return {};
    return ((data as { fiis?: B3FiiFunds }).fiis ?? {}) as B3FiiFunds;
  } catch {
    return {};
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
