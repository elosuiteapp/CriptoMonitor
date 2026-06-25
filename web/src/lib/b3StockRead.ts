// Leitura "de ação" (o que o investidor de bolsa realmente olha): força relativa
// vs IBOV, médias móveis, suporte/resistência por pivôs e volume vs média.
// Tudo calculado dos candles diários — sem fonte paga. Complementa o SMC/ICT
// (que é fraco em candle diário de ação), que fica como camada avançada opcional.
import type { Candle } from "./marketData";
import { last, sma } from "./indicators/ta";

export interface RelWindow {
  label: string;
  assetPct: number;
  ibovPct: number;
  rs: number; // assetPct - ibovPct (pontos percentuais); >0 = bate o índice
}
export interface RelStrength {
  windows: RelWindow[];
  verdict: "outperform" | "underperform" | "inline";
  avgRs: number;
}
export interface MovingAverages {
  price: number;
  mm20: number | null;
  mm50: number | null;
  mm200: number | null;
  trend: "alta" | "alta fraca" | "baixa" | "baixa fraca" | "lateral";
  cross: "golden" | "death" | null;
}
export interface VolumeRead {
  last: number;
  avg20: number;
  ratio: number; // last / avg20
  label: "muito acima" | "acima" | "na média" | "abaixo";
}
export interface SRLevel {
  price: number;
  distPct: number; // vs preço atual (assinado)
}
export interface StockRead {
  rel: RelStrength | null;
  ma: MovingAverages | null;
  vol: VolumeRead | null;
  support: SRLevel | null;
  resistance: SRLevel | null;
  beta: number | null; // beta vs IBOV (~1 ano de retornos diários); >1 amplifica o índice
}

const pctChange = (closes: number[], n: number): number | null => {
  if (closes.length <= n) return null;
  const a = closes[closes.length - 1];
  const b = closes[closes.length - 1 - n];
  return b ? ((a - b) / b) * 100 : null;
};

/** Força relativa do ativo vs IBOV em 1M/3M/6M (dias úteis aproximados). */
function relStrength(closes: number[], ibov: number[]): RelStrength | null {
  const defs: [string, number][] = [["1 mês", 21], ["3 meses", 63], ["6 meses", 126]];
  const windows: RelWindow[] = [];
  for (const [label, n] of defs) {
    const a = pctChange(closes, n);
    const b = pctChange(ibov, n);
    if (a == null || b == null) continue;
    windows.push({ label, assetPct: a, ibovPct: b, rs: a - b });
  }
  if (!windows.length) return null;
  const avgRs = windows.reduce((s, w) => s + w.rs, 0) / windows.length;
  const verdict = avgRs > 2 ? "outperform" : avgRs < -2 ? "underperform" : "inline";
  return { windows, verdict, avgRs };
}

function movingAverages(candles: Candle[]): MovingAverages | null {
  const closes = candles.map((c) => c.close);
  if (closes.length < 21) return null;
  const price = closes[closes.length - 1];
  const mm20 = closes.length >= 20 ? last(sma(closes, 20)) : null;
  const mm50 = closes.length >= 50 ? last(sma(closes, 50)) : null;
  const mm200 = closes.length >= 200 ? last(sma(closes, 200)) : null;
  let trend: MovingAverages["trend"] = "lateral";
  if (mm20 != null && mm50 != null) {
    if (price > mm20) trend = mm20 > mm50 ? "alta" : "alta fraca";
    else trend = mm20 < mm50 ? "baixa" : "baixa fraca";
  } else if (mm20 != null) {
    trend = price > mm20 ? "alta fraca" : "baixa fraca";
  }
  const cross = mm50 != null && mm200 != null ? (mm50 > mm200 ? "golden" : "death") : null;
  return { price, mm20, mm50, mm200, trend, cross };
}

function volumeRead(candles: Candle[]): VolumeRead | null {
  const vols = candles.map((c) => c.volume).filter((v) => Number.isFinite(v) && v > 0);
  if (vols.length < 10) return null;
  const lastV = candles[candles.length - 1].volume;
  if (!(lastV > 0)) return null;
  const win = vols.slice(-21, -1); // 20 anteriores ao último
  if (!win.length) return null;
  const avg20 = win.reduce((s, v) => s + v, 0) / win.length;
  if (!(avg20 > 0)) return null;
  const ratio = lastV / avg20;
  const label = ratio >= 1.8 ? "muito acima" : ratio >= 1.15 ? "acima" : ratio <= 0.85 ? "abaixo" : "na média";
  return { last: lastV, avg20, ratio, label };
}

/** Pivôs simples (fractal de janela k): topos e fundos locais. */
function pivots(candles: Candle[], k = 3): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push(candles[i].high);
    if (isLow) lows.push(candles[i].low);
  }
  return { highs, lows };
}

/** Suporte (pivô de fundo mais próximo abaixo) e resistência (pivô de topo acima). */
function supportResistance(candles: Candle[]): { support: SRLevel | null; resistance: SRLevel | null } {
  if (candles.length < 20) return { support: null, resistance: null };
  const recent = candles.slice(-150);
  const price = recent[recent.length - 1].close;
  const { highs, lows } = pivots(recent, 3);
  const resAbove = highs.filter((h) => h > price * 1.002).sort((a, b) => a - b)[0] ?? null;
  const supBelow = lows.filter((l) => l < price * 0.998).sort((a, b) => b - a)[0] ?? null;
  const mk = (p: number | null): SRLevel | null => (p == null ? null : { price: p, distPct: ((p - price) / price) * 100 });
  return { support: mk(supBelow), resistance: mk(resAbove) };
}

/** Beta vs IBOV — sensibilidade do ativo ao índice (cov/var dos retornos diários,
 *  ~1 ano). >1 amplifica o IBOV; <1 é mais defensivo. Pareia por pregão (mesma B3). */
function computeBeta(candles: Candle[], ibovCandles: Candle[]): number | null {
  const m = Math.min(candles.length, ibovCandles.length);
  if (m < 60) return null;
  const s = candles.slice(-m).map((c) => c.close);
  const b = ibovCandles.slice(-m).map((c) => c.close);
  const sr: number[] = [];
  const br: number[] = [];
  for (let i = Math.max(1, m - 252); i < m; i++) {
    if (s[i - 1] > 0 && b[i - 1] > 0) {
      sr.push((s[i] - s[i - 1]) / s[i - 1]);
      br.push((b[i] - b[i - 1]) / b[i - 1]);
    }
  }
  if (sr.length < 30) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const ms = mean(sr);
  const mb = mean(br);
  let cov = 0;
  let varb = 0;
  for (let i = 0; i < sr.length; i++) {
    cov += (sr[i] - ms) * (br[i] - mb);
    varb += (br[i] - mb) ** 2;
  }
  return varb > 0 ? cov / varb : null;
}

/** Leitura completa da ação a partir dos candles diários do ativo e do IBOV. */
export function computeStockRead(candles: Candle[], ibovCandles: Candle[]): StockRead {
  const closes = candles.map((c) => c.close);
  const ibov = ibovCandles.map((c) => c.close);
  const { support, resistance } = supportResistance(candles);
  return {
    rel: closes.length && ibov.length ? relStrength(closes, ibov) : null,
    ma: movingAverages(candles),
    vol: volumeRead(candles),
    support,
    resistance,
    beta: computeBeta(candles, ibovCandles),
  };
}
