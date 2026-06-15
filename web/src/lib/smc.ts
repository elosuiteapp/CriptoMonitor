// Motor Smart Money Concepts (SMC) — implementação original em TypeScript da
// metodologia dos dois indicadores de referência (LuxAlgo SMC + Strong Demands &
// Supplies + Liquidity). NÃO é tradução do código Pine (que é CC BY-NC-SA): é uma
// reimplementação dos algoritmos públicos de price action, calculada só com candles.
// Spec: docs/smc-indicators/*.md
//
// Detecta: estrutura de mercado (swing + interna) com BOS/CHoCH, order blocks,
// fair value gaps, zonas de liquidez (pools de stops), equal highs/lows, e zonas
// premium/discount/equilibrium. Tudo a partir de OHLCV.

import type { Candle } from "./marketData";

export type Bias = "bullish" | "bearish";

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  kind: "HH" | "LH" | "HL" | "LL";
  isHigh: boolean;
}

export interface StructureBreak {
  time: number;
  price: number;
  type: "BOS" | "CHoCH";
  bias: Bias;
  internal: boolean;
}

export interface OrderBlock {
  top: number;
  bottom: number;
  mid: number;
  time: number;
  bias: Bias;
  internal: boolean;
}

export interface FVG {
  top: number;
  bottom: number;
  mid: number;
  time: number;
  bias: Bias;
}

export interface LiquidityPool {
  price: number;
  side: "buy" | "sell"; // buy-side = stops de vendidos acima; sell-side = stops de comprados abaixo
  count: number;
  time: number;
  swept: boolean;
}

export interface EqualLevel {
  price: number;
  kind: "EQH" | "EQL";
  time: number;
}

export interface Zone {
  top: number;
  bottom: number;
}

export interface SmcResult {
  price: number;
  atr: number;
  swingBias: Bias | null;
  internalBias: Bias | null;
  swings: SwingPoint[];
  structures: StructureBreak[];
  lastSwing: StructureBreak | null;
  lastInternal: StructureBreak | null;
  orderBlocks: OrderBlock[];
  fvgs: FVG[];
  liquidity: LiquidityPool[];
  equals: EqualLevel[];
  trailingTop: number;
  trailingBottom: number;
  premium: Zone;
  equilibrium: Zone;
  discount: Zone;
}

// ─── ATR rolling (média simples do True Range) ───────────────────────────────
function atrArray(candles: Candle[], len: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
      continue;
    }
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i >= len) sum -= tr[i - len];
    out.push(sum / Math.min(i + 1, len));
  }
  return out;
}

interface Pivot {
  level: number;
  lastLevel: number;
  crossed: boolean;
  index: number;
  time: number;
}

const newPivot = (): Pivot => ({ level: NaN, lastLevel: NaN, crossed: false, index: 0, time: 0 });

/** Estado do detector de "perna" (leg) para um dado tamanho. 0 = baixa, 1 = alta. */
function makeLegUpdater(candles: Candle[], size: number) {
  let leg = 0;
  return (i: number): { flip: 1 | -1 | 0 } => {
    if (i < size) return { flip: 0 };
    let highest = -Infinity;
    let lowest = Infinity;
    for (let k = i - size + 1; k <= i; k++) {
      if (candles[k].high > highest) highest = candles[k].high;
      if (candles[k].low < lowest) lowest = candles[k].low;
    }
    const prev = leg;
    if (candles[i - size].high > highest) leg = 0; // topo de swing confirmado → perna de baixa
    else if (candles[i - size].low < lowest) leg = 1; // fundo de swing confirmado → perna de alta
    if (leg === prev) return { flip: 0 };
    return { flip: leg === 1 ? 1 : -1 };
  };
}

export interface SmcOptions {
  swing?: number;
  internal?: number;
  equalLen?: number;
  equalThreshold?: number;
  obCount?: number;
}

export function computeSmc(candles: Candle[], opts: SmcOptions = {}): SmcResult | null {
  const n = candles.length;
  const swingLen = opts.swing ?? 50;
  const internalLen = opts.internal ?? 5;
  const equalLen = opts.equalLen ?? 3;
  const equalThr = opts.equalThreshold ?? 0.1;
  const obCount = opts.obCount ?? 6;
  if (n < internalLen + 3) return null;

  const atr200 = atrArray(candles, 200);
  const atr10 = atrArray(candles, 10);

  // Valores "parsed" para order blocks: em barras muito voláteis usa o corpo.
  const parsedHigh: number[] = [];
  const parsedLow: number[] = [];
  for (let i = 0; i < n; i++) {
    const highVol = candles[i].high - candles[i].low >= 2 * atr200[i];
    parsedHigh.push(highVol ? candles[i].low : candles[i].high);
    parsedLow.push(highVol ? candles[i].high : candles[i].low);
  }

  const swingHigh = newPivot();
  const swingLow = newPivot();
  const internalHigh = newPivot();
  const internalLow = newPivot();
  const equalHigh = newPivot();
  const equalLow = newPivot();

  let swingTrend = 0; // 1 alta, -1 baixa
  let internalTrend = 0;

  let trailingTop = candles[0].high;
  let trailingBottom = candles[0].low;
  let trailTopTime = candles[0].time;
  let trailBtmTime = candles[0].time;

  const swings: SwingPoint[] = [];
  const structures: StructureBreak[] = [];
  const equals: EqualLevel[] = [];
  const orderBlocksRaw: OrderBlock[] = [];

  const legSwing = makeLegUpdater(candles, swingLen);
  const legInternal = makeLegUpdater(candles, internalLen);
  const legEqual = makeLegUpdater(candles, equalLen);

  const captureOB = (pivotIndex: number, i: number, bias: Bias, internal: boolean) => {
    let bestIdx = pivotIndex;
    if (bias === "bullish") {
      let min = Infinity;
      for (let k = pivotIndex; k <= i; k++) if (parsedLow[k] < min) (min = parsedLow[k]), (bestIdx = k);
    } else {
      let max = -Infinity;
      for (let k = pivotIndex; k <= i; k++) if (parsedHigh[k] > max) (max = parsedHigh[k]), (bestIdx = k);
    }
    const top = parsedHigh[bestIdx];
    const bottom = parsedLow[bestIdx];
    orderBlocksRaw.push({ top, bottom, mid: (top + bottom) / 2, time: candles[bestIdx].time, bias, internal });
  };

  for (let i = 0; i < n; i++) {
    // ─── Swing pivots (len grande) ───
    const fs = legSwing(i).flip;
    if (fs !== 0 && i - swingLen >= 0) {
      const pi = i - swingLen;
      if (fs === -1) {
        // topo de swing
        swingHigh.lastLevel = swingHigh.level;
        swingHigh.level = candles[pi].high;
        swingHigh.crossed = false;
        swingHigh.index = pi;
        swingHigh.time = candles[pi].time;
        trailingTop = swingHigh.level;
        trailTopTime = swingHigh.time;
        swings.push({ index: pi, time: candles[pi].time, price: swingHigh.level, isHigh: true, kind: swingHigh.level > swingHigh.lastLevel ? "HH" : "LH" });
      } else {
        const pl = candles[pi].low;
        swingLow.lastLevel = swingLow.level;
        swingLow.level = pl;
        swingLow.crossed = false;
        swingLow.index = pi;
        swingLow.time = candles[pi].time;
        trailingBottom = pl;
        trailBtmTime = candles[pi].time;
        swings.push({ index: pi, time: candles[pi].time, price: pl, isHigh: false, kind: pl < swingLow.lastLevel ? "LL" : "HL" });
      }
    }

    // ─── Internal pivots (len 5) ───
    const fi = legInternal(i).flip;
    if (fi !== 0 && i - internalLen >= 0) {
      const pi = i - internalLen;
      if (fi === -1) {
        internalHigh.lastLevel = internalHigh.level;
        internalHigh.level = candles[pi].high;
        internalHigh.crossed = false;
        internalHigh.index = pi;
        internalHigh.time = candles[pi].time;
      } else {
        internalLow.lastLevel = internalLow.level;
        internalLow.level = candles[pi].low;
        internalLow.crossed = false;
        internalLow.index = pi;
        internalLow.time = candles[pi].time;
      }
    }

    // ─── Equal highs/lows (len 3) ───
    const fe = legEqual(i).flip;
    if (fe !== 0 && i - equalLen >= 0) {
      const pi = i - equalLen;
      if (fe === -1) {
        if (!Number.isNaN(equalHigh.level) && Math.abs(equalHigh.level - candles[pi].high) < equalThr * atr200[i]) {
          equals.push({ price: candles[pi].high, kind: "EQH", time: candles[pi].time });
        }
        equalHigh.level = candles[pi].high;
      } else {
        if (!Number.isNaN(equalLow.level) && Math.abs(equalLow.level - candles[pi].low) < equalThr * atr200[i]) {
          equals.push({ price: candles[pi].low, kind: "EQL", time: candles[pi].time });
        }
        equalLow.level = candles[pi].low;
      }
    }

    if (i === 0) continue;
    const c = candles[i].close;
    const cp = candles[i - 1].close;

    // ─── Internal structure breaks ───
    if (!Number.isNaN(internalHigh.level) && c > internalHigh.level && cp <= internalHigh.level && !internalHigh.crossed && internalHigh.level !== swingHigh.level) {
      const type = internalTrend === -1 ? "CHoCH" : "BOS";
      structures.push({ time: candles[i].time, price: internalHigh.level, type, bias: "bullish", internal: true });
      internalHigh.crossed = true;
      internalTrend = 1;
      captureOB(internalHigh.index, i, "bullish", true);
    }
    if (!Number.isNaN(internalLow.level) && c < internalLow.level && cp >= internalLow.level && !internalLow.crossed && internalLow.level !== swingLow.level) {
      const type = internalTrend === 1 ? "CHoCH" : "BOS";
      structures.push({ time: candles[i].time, price: internalLow.level, type, bias: "bearish", internal: true });
      internalLow.crossed = true;
      internalTrend = -1;
      captureOB(internalLow.index, i, "bearish", true);
    }

    // ─── Swing structure breaks ───
    if (!Number.isNaN(swingHigh.level) && c > swingHigh.level && cp <= swingHigh.level && !swingHigh.crossed) {
      const type = swingTrend === -1 ? "CHoCH" : "BOS";
      structures.push({ time: candles[i].time, price: swingHigh.level, type, bias: "bullish", internal: false });
      swingHigh.crossed = true;
      swingTrend = 1;
      captureOB(swingHigh.index, i, "bullish", false);
    }
    if (!Number.isNaN(swingLow.level) && c < swingLow.level && cp >= swingLow.level && !swingLow.crossed) {
      const type = swingTrend === 1 ? "CHoCH" : "BOS";
      structures.push({ time: candles[i].time, price: swingLow.level, type, bias: "bearish", internal: false });
      swingLow.crossed = true;
      swingTrend = -1;
      captureOB(swingLow.index, i, "bearish", false);
    }
  }

  // Trailing extremes até a última barra
  for (let i = 0; i < n; i++) {
    if (candles[i].high >= trailingTop) {
      trailingTop = candles[i].high;
      trailTopTime = candles[i].time;
    }
    if (candles[i].low <= trailingBottom) {
      trailingBottom = candles[i].low;
      trailBtmTime = candles[i].time;
    }
  }
  void trailTopTime;
  void trailBtmTime;

  // ─── Order blocks: mantém só os não mitigados, mais recentes ───
  const lastTime = candles[n - 1].time;
  const orderBlocks = orderBlocksRaw
    .filter((ob) => {
      // mitigado quando o preço fecha através do bloco depois de formado
      for (let k = 0; k < n; k++) {
        if (candles[k].time <= ob.time) continue;
        if (ob.bias === "bullish" && candles[k].low < ob.bottom) return false;
        if (ob.bias === "bearish" && candles[k].high > ob.top) return false;
      }
      return true;
    })
    .filter((ob) => ob.time < lastTime)
    .slice(-obCount * 2);

  // ─── Fair value gaps (3 velas), só os não preenchidos ───
  const fvgs: FVG[] = [];
  for (let i = 2; i < n; i++) {
    const gapUp = candles[i].low - candles[i - 2].high;
    const gapDn = candles[i - 2].low - candles[i].high;
    const thr = 0.25 * atr200[i];
    if (gapUp > thr && candles[i - 1].close > candles[i - 2].high) {
      fvgs.push({ bottom: candles[i - 2].high, top: candles[i].low, mid: (candles[i - 2].high + candles[i].low) / 2, time: candles[i].time, bias: "bullish" });
    } else if (gapDn > thr && candles[i - 1].close < candles[i - 2].low) {
      fvgs.push({ bottom: candles[i].high, top: candles[i - 2].low, mid: (candles[i].high + candles[i - 2].low) / 2, time: candles[i].time, bias: "bearish" });
    }
  }
  const openFvgs = fvgs
    .filter((g) => {
      for (let k = 0; k < n; k++) {
        if (candles[k].time <= g.time) continue;
        if (g.bias === "bullish" && candles[k].low < g.bottom) return false;
        if (g.bias === "bearish" && candles[k].high > g.top) return false;
      }
      return true;
    })
    .slice(-5);

  // ─── Zonas de liquidez (clusters de pivôs = pools de stops) ───
  const pivHighs: { price: number; idx: number }[] = [];
  const pivLows: { price: number; idx: number }[] = [];
  const L = 7;
  const R = 1;
  for (let i = L; i < n - R; i++) {
    let isHigh = true;
    let isLow = true;
    for (let k = i - L; k <= i + R; k++) {
      if (k === i) continue;
      if (candles[k].high >= candles[i].high) isHigh = false;
      if (candles[k].low <= candles[i].low) isLow = false;
    }
    if (isHigh) pivHighs.push({ price: candles[i].high, idx: i });
    if (isLow) pivLows.push({ price: candles[i].low, idx: i });
  }
  const cluster = (pivs: { price: number; idx: number }[], side: "buy" | "sell"): LiquidityPool[] => {
    const pools: LiquidityPool[] = [];
    const used = new Array(pivs.length).fill(false);
    for (let a = 0; a < pivs.length; a++) {
      if (used[a]) continue;
      const tol = atr10[pivs[a].idx] / 1.449;
      const members = [a];
      for (let b = a + 1; b < pivs.length; b++) {
        if (!used[b] && Math.abs(pivs[b].price - pivs[a].price) <= tol) members.push(b);
      }
      if (members.length >= 3) {
        members.forEach((m) => (used[m] = true));
        const price = members.reduce((s, m) => s + pivs[m].price, 0) / members.length;
        const lastIdx = Math.max(...members.map((m) => pivs[m].idx));
        let swept = false;
        for (let k = lastIdx + 1; k < n; k++) {
          if (side === "buy" && candles[k].high > price + tol) swept = true;
          if (side === "sell" && candles[k].low < price - tol) swept = true;
        }
        pools.push({ price, side, count: members.length, time: candles[lastIdx].time, swept });
      }
    }
    return pools;
  };
  const liquidity = [...cluster(pivHighs, "buy"), ...cluster(pivLows, "sell")]
    .sort((x, y) => y.count - x.count)
    .slice(0, 8);

  // ─── Zonas premium / discount / equilibrium ───
  const top = trailingTop;
  const bottom = trailingBottom;
  const premium: Zone = { top, bottom: 0.95 * top + 0.05 * bottom };
  const discount: Zone = { top: 0.95 * bottom + 0.05 * top, bottom };
  const equilibrium: Zone = { top: 0.525 * top + 0.475 * bottom, bottom: 0.525 * bottom + 0.475 * top };

  const swingStructs = structures.filter((s) => !s.internal);
  const internalStructs = structures.filter((s) => s.internal);

  return {
    price: candles[n - 1].close,
    atr: atr200[n - 1],
    swingBias: swingTrend === 1 ? "bullish" : swingTrend === -1 ? "bearish" : null,
    internalBias: internalTrend === 1 ? "bullish" : internalTrend === -1 ? "bearish" : null,
    swings,
    structures,
    lastSwing: swingStructs.length ? swingStructs[swingStructs.length - 1] : null,
    lastInternal: internalStructs.length ? internalStructs[internalStructs.length - 1] : null,
    orderBlocks,
    fvgs: openFvgs,
    liquidity,
    equals: equals.slice(-6),
    trailingTop,
    trailingBottom,
    premium,
    equilibrium,
    discount,
  };
}
