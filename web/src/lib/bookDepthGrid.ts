import type { OrderbookDepthRow } from "./types";

/** Grade preço × tempo da escada do book (heatmap de liquidez parada). Cada coluna
 *  é um snapshot (ts), cada linha um bucket de preço. Os valores SOMAM as exchanges
 *  por bucket (Coinbase preenche o longe; Binance/OKX o perto do preço). Separa
 *  bid (suporte, abaixo) de ask (resistência, acima) p/ colorir verde/vermelho. */
export interface BookGrid {
  cols: number[]; // epoch (s) de cada snapshot, em ordem crescente
  nBins: number;
  priceTop: number; // preço no topo (bin 0)
  priceBottom: number; // preço no fundo (bin nBins-1)
  bid: Float32Array; // notional de bids por célula — index = col*nBins + bin
  ask: Float32Array; // notional de asks por célula
  max: number; // maior (bid+ask) de uma célula, p/ normalizar a intensidade
}

const MAX_BINS = 240;

export function buildBookDepthGrid(rows: OrderbookDepthRow[] | null): BookGrid | null {
  if (!rows || rows.length === 0) return null;

  // 1) Funde as exchanges por ts → mapa de bid/ask por preço de bucket.
  const byTs = new Map<number, { bid: Map<number, number>; ask: Map<number, number> }>();
  const prices = new Set<number>();
  let minP = Infinity;
  let maxP = -Infinity;

  const ingest = (target: Map<number, number>, side: Record<string, number> | null | undefined) => {
    if (!side) return;
    for (const k in side) {
      const p = Number(k);
      const n = Number(side[k]);
      if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0) continue;
      target.set(p, (target.get(p) ?? 0) + n);
      prices.add(p);
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
  };

  for (const r of rows) {
    const ts = Math.floor(new Date(r.ts).getTime() / 1000);
    if (!Number.isFinite(ts)) continue;
    let agg = byTs.get(ts);
    if (!agg) {
      agg = { bid: new Map(), ask: new Map() };
      byTs.set(ts, agg);
    }
    ingest(agg.bid, r.bids);
    ingest(agg.ask, r.asks);
  }

  if (byTs.size === 0 || !Number.isFinite(minP) || maxP <= minP) return null;

  // 2) Passo do bucket = menor distância entre buckets distintos (os preços são
  //    múltiplos do passo do ativo). Cap de bins p/ não explodir em faixa larga.
  const sorted = [...prices].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0 && d < step) step = d;
  }
  if (!Number.isFinite(step) || step <= 0) step = (maxP - minP) / 100;
  let nBins = Math.round((maxP - minP) / step) + 1;
  if (nBins > MAX_BINS) {
    step = (maxP - minP) / (MAX_BINS - 1);
    nBins = MAX_BINS;
  }
  if (nBins < 1) nBins = 1;

  const priceTop = maxP;
  const priceBottom = minP;
  const binOf = (p: number) => {
    const b = Math.round((priceTop - p) / step);
    return b < 0 ? 0 : b >= nBins ? nBins - 1 : b;
  };

  // 3) Colunas em ordem de tempo + preenchimento da grade.
  const cols = [...byTs.keys()].sort((a, b) => a - b);
  const bid = new Float32Array(cols.length * nBins);
  const ask = new Float32Array(cols.length * nBins);
  cols.forEach((ts, c) => {
    const agg = byTs.get(ts)!;
    for (const [p, n] of agg.bid) bid[c * nBins + binOf(p)] += n;
    for (const [p, n] of agg.ask) ask[c * nBins + binOf(p)] += n;
  });

  let max = 0;
  for (let i = 0; i < bid.length; i++) {
    const t = bid[i] + ask[i];
    if (t > max) max = t;
  }
  if (max <= 0) return null;

  return { cols, nBins, priceTop, priceBottom, bid, ask, max };
}

// ─── Paleta térmica única (estilo Bookmap) ───────────────────────────────────
// Frio/escuro = pouca liquidez → quente/claro = muita. O LADO não vem da cor —
// vem da POSIÇÃO vs preço (abaixo = compra/suporte, acima = venda/resistência).
type Stop = [number, [number, number, number]];
const THERMAL: Stop[] = [
  [0.0, [12, 16, 48]], // navy escuro (frio)
  [0.25, [70, 24, 104]], // roxo
  [0.5, [168, 44, 72]], // magenta-vermelho
  [0.7, [232, 104, 34]], // laranja
  [0.85, [250, 186, 48]], // âmbar
  [1.0, [255, 246, 206]], // branco quente
];

/** Gradiente CSS pronto p/ a legenda (frio → quente). */
export const BOOK_HEAT_GRADIENT =
  "linear-gradient(to right, rgb(12,16,48), rgb(70,24,104), rgb(168,44,72), rgb(232,104,34), rgb(250,186,48), rgb(255,246,206))";

/** Cor térmica pela intensidade (0..1) — brilho/calor ∝ tamanho da liquidez. */
export function bookHeatColor(t: number): [number, number, number] {
  const v = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < THERMAL.length; i++) {
    if (v <= THERMAL[i][0]) {
      const [a0, c0] = THERMAL[i - 1];
      const [a1, c1] = THERMAL[i];
      const f = (v - a0) / (a1 - a0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return THERMAL[THERMAL.length - 1][1];
}

// ─── Desequilíbrio do book (Order Book Imbalance) ────────────────────────────
export interface BookImbalance {
  bid: number; // notional de bids no band (±bandPct do preço), somando exchanges
  ask: number; // notional de asks no band
  mid: number;
  tilt: number; // (bid − ask)/(bid + ask), −1..+1 (>0 = comprador, <0 = vendedor)
}

/** Pressão de CURTÍSSIMO prazo: soma bid vs ask perto do preço (±bandPct) do
 *  ÚLTIMO snapshot. Sinal de OBI — fraco, ruidoso e SPOOFÁVEL (não é previsão). */
export function latestBookImbalance(rows: OrderbookDepthRow[] | null, bandPct = 0.02): BookImbalance | null {
  if (!rows || rows.length === 0) return null;
  let latestTs = "";
  for (const r of rows) if (r.ts > latestTs) latestTs = r.ts;
  const snap = rows.filter((r) => r.ts === latestTs);
  const mids = snap.map((r) => r.mid).filter((m): m is number => m != null && Number.isFinite(m));
  if (mids.length === 0) return null;
  const mid = mids.reduce((a, b) => a + b, 0) / mids.length;
  const lo = mid * (1 - bandPct);
  const hi = mid * (1 + bandPct);
  let bid = 0;
  let ask = 0;
  for (const r of snap) {
    for (const k in r.bids ?? {}) {
      const p = Number(k);
      if (p >= lo && p <= hi) bid += Number(r.bids[k]) || 0;
    }
    for (const k in r.asks ?? {}) {
      const p = Number(k);
      if (p >= lo && p <= hi) ask += Number(r.asks[k]) || 0;
    }
  }
  if (bid + ask <= 0) return null;
  return { bid, ask, mid, tilt: (bid - ask) / (bid + ask) };
}

/** Pressão do book numa JANELA de tempo: agrega bid vs ask (±bandPct do mid de cada
 *  snapshot) em todos os snapshots dos últimos `sinceMs`. Permite comparar 48h × 24h
 *  × 12h × 6h e ver de que lado a liquidez vem ganhando força. */
export function windowedBookImbalance(rows: OrderbookDepthRow[] | null, bandPct: number, sinceMs: number): BookImbalance | null {
  if (!rows || rows.length === 0) return null;
  const cutoff = Date.now() - sinceMs;
  const byTs = new Map<string, OrderbookDepthRow[]>();
  for (const r of rows) {
    if (new Date(r.ts).getTime() < cutoff) continue;
    const arr = byTs.get(r.ts) ?? [];
    arr.push(r);
    byTs.set(r.ts, arr);
  }
  if (byTs.size === 0) return null;
  let bid = 0;
  let ask = 0;
  let midSum = 0;
  let midN = 0;
  for (const snap of byTs.values()) {
    const mids = snap.map((r) => r.mid).filter((m): m is number => m != null && Number.isFinite(m));
    if (mids.length === 0) continue;
    const mid = mids.reduce((a, b) => a + b, 0) / mids.length;
    const lo = mid * (1 - bandPct);
    const hi = mid * (1 + bandPct);
    midSum += mid;
    midN += 1;
    for (const r of snap) {
      for (const k in r.bids ?? {}) {
        const p = Number(k);
        if (p >= lo && p <= hi) bid += Number(r.bids[k]) || 0;
      }
      for (const k in r.asks ?? {}) {
        const p = Number(k);
        if (p >= lo && p <= hi) ask += Number(r.asks[k]) || 0;
      }
    }
  }
  if (bid + ask <= 0) return null;
  return { bid, ask, mid: midN ? midSum / midN : 0, tilt: (bid - ask) / (bid + ask) };
}
