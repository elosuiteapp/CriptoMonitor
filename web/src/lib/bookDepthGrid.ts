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
