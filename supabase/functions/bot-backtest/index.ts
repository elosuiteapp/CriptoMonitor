// Edge Function: bot-backtest — mede a EXPECTÂNCIA da estratégia do robô sobre candles reais.
// Roda o MESMO cérebro estrutural do bot-run (computeSmc + structuralBias + voto/regime/gates +
// modelo de risco por ATR: stop, trailing com piso de estrutura, reversão) em walk-forward, sem
// lookahead, com taxas/slippage. Mede R por trade → expectância, win%, profit factor, max drawdown.
//
// LIMITE HONESTO: a camada de FLUXO (CVD/gamma/ETF/paredes/liquidações) NÃO é backtestável (não há
// microestrutura histórica) → o backtest mede o ESQUELETO (gatilho estrutural + gates + risco) com
// fluxo neutro. É o que decide a ENTRADA de qualquer forma. Pirâmide e saída-de-proteção ficam fora.
// computeSmc/structuralBias são cópia FIEL do bot-run — manter em sincronia se o motor mudar.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SWING = 20;
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ════════ Motor SMC — CÓPIA FIEL de bot-run (portado de web/src/lib/smc.ts) ════════
type Bias = "bullish" | "bearish";
interface Candle { time: number; open: number; high: number; low: number; close: number; volume?: number; delta?: number }
interface StructureBreak { time: number; price: number; type: "BOS" | "CHoCH"; bias: Bias; internal: boolean }
interface OrderBlock { top: number; bottom: number; mid: number; time: number; bias: Bias; internal: boolean }
interface FVG { top: number; bottom: number; mid: number; time: number; bias: Bias }
interface LiquidityPool { price: number; side: "buy" | "sell"; count: number; time: number; swept: boolean; sweptRecently: boolean }
interface Zone { top: number; bottom: number }
// Máx/mín do período ANTERIOR completo (dia/semana/mês UTC) — ímãs clássicos de liquidez
// (PDH/PDL/PWH/PWL/PMH/PML). null quando a janela de velas não cobre o período inteiro. (motor 7925e48)
interface PrevLevels { pdh: number | null; pdl: number | null; pwh: number | null; pwl: number | null; pmh: number | null; pml: number | null }
interface SmcResult { price: number; atr: number; swingBias: Bias | null; internalBias: Bias | null; lastSwing: StructureBreak | null; orderBlocks: OrderBlock[]; fvgs: FVG[]; liquidity: LiquidityPool[]; trailingTop: number; trailingBottom: number; swingLowLevel: number; swingHighLevel: number; internalLowLevel: number; internalHighLevel: number; premium: Zone; equilibrium: Zone; discount: Zone; prevLevels: PrevLevels; extremes: { high: "strong" | "weak"; low: "strong" | "weak" } | null }

// ─── Volume Profile (POC/VAH/VAL) — cópia FIEL de web/src/lib/marketData.ts (mesma do módulo) ───
interface VolumeProfile { poc: number; vah: number; val: number }
function computeVolumeProfile(candles: Candle[], bins = 50): VolumeProfile | null {
  if (candles.length < 2) return null;
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  if (hi <= lo) return null;
  const width = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    let idx = Math.floor((typical - lo) / width);
    idx = Math.max(0, Math.min(bins - 1, idx));
    vol[idx] += c.volume ?? 0;
  }
  let maxI = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[maxI]) maxI = i;
  const total = vol.reduce((a: number, b: number) => a + b, 0);
  if (total <= 0) return null;
  let loI = maxI, hiI = maxI, acc = vol[maxI];
  while (acc < total * 0.7 && (loI > 0 || hiI < bins - 1)) {
    const below = loI > 0 ? vol[loI - 1] : -1;
    const above = hiI < bins - 1 ? vol[hiI + 1] : -1;
    if (above >= below) acc += vol[++hiI];
    else acc += vol[--loI];
  }
  return { poc: lo + (maxI + 0.5) * width, vah: lo + (hiI + 1) * width, val: lo + loI * width };
}

// ─── Máx/mín do período anterior (dia/semana/mês UTC) — cópia FIEL de web/src/lib/smc.ts ───
function prevPeriodLevels(candles: Candle[]): PrevLevels {
  const DAY = 86400;
  const last = candles[candles.length - 1].time;
  const first = candles[0].time;
  // hi/lo do intervalo [start, end); null se a janela não cobre o INÍCIO do período (nível truncado = falso).
  const range = (start: number, end: number): { hi: number | null; lo: number | null } => {
    if (first > start) return { hi: null, lo: null };
    let hi = -Infinity, lo = Infinity, seen = false;
    for (const c of candles) {
      if (c.time >= start && c.time < end) {
        seen = true;
        if (c.high > hi) hi = c.high;
        if (c.low < lo) lo = c.low;
      }
    }
    return seen ? { hi, lo } : { hi: null, lo: null };
  };
  const dayStart = Math.floor(last / DAY) * DAY;
  const d = range(dayStart - DAY, dayStart);
  const dayIdx = Math.floor(last / DAY);
  const dow = (dayIdx + 4) % 7;
  const weekStart = (dayIdx - ((dow + 6) % 7)) * DAY;
  const w = range(weekStart - 7 * DAY, weekStart);
  const dt = new Date(last * 1000);
  const monthStart = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1) / 1000;
  const prevMonthStart = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() - 1, 1) / 1000;
  const m = range(prevMonthStart, monthStart);
  return { pdh: d.hi, pdl: d.lo, pwh: w.hi, pwl: w.lo, pmh: m.hi, pml: m.lo };
}

function atrArray(candles: Candle[], len: number): number[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); continue; }
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const out: number[] = []; let sum = 0;
  for (let i = 0; i < tr.length; i++) { sum += tr[i]; if (i >= len) sum -= tr[i - len]; out.push(sum / Math.min(i + 1, len)); }
  return out;
}
interface Pivot { level: number; lastLevel: number; crossed: boolean; index: number; time: number }
const newPivot = (): Pivot => ({ level: NaN, lastLevel: NaN, crossed: false, index: 0, time: 0 });
function makeLegUpdater(candles: Candle[], size: number) {
  let leg = 0;
  return (i: number): { flip: 1 | -1 | 0 } => {
    if (i < size) return { flip: 0 };
    let highest = -Infinity, lowest = Infinity;
    for (let k = i - size + 1; k <= i; k++) { if (candles[k].high > highest) highest = candles[k].high; if (candles[k].low < lowest) lowest = candles[k].low; }
    const prev = leg;
    if (candles[i - size].high > highest) leg = 0;
    else if (candles[i - size].low < lowest) leg = 1;
    if (leg === prev) return { flip: 0 };
    return { flip: leg === 1 ? 1 : -1 };
  };
}
function computeSmc(candles: Candle[], swingLen = 50): SmcResult | null {
  const n = candles.length, internalLen = 5, obCount = 6;
  if (n < internalLen + 3) return null;
  const atr200 = atrArray(candles, 200), atr10 = atrArray(candles, 10);
  const swingHigh = newPivot(), swingLow = newPivot(), internalHigh = newPivot(), internalLow = newPivot();
  let swingTrend = 0, internalTrend = 0;
  let trailingTop = candles[0].high, trailingBottom = candles[0].low;
  const structures: StructureBreak[] = [], orderBlocksRaw: OrderBlock[] = [];
  const legSwing = makeLegUpdater(candles, swingLen), legInternal = makeLegUpdater(candles, internalLen);
  const captureOB = (pivotIndex: number, i: number, bias: Bias) => {
    let bestIdx = pivotIndex;
    if (bias === "bullish") { let min = Infinity; for (let k = pivotIndex; k <= i; k++) if (candles[k].low < min) { min = candles[k].low; bestIdx = k; } }
    else { let max = -Infinity; for (let k = pivotIndex; k <= i; k++) if (candles[k].high > max) { max = candles[k].high; bestIdx = k; } }
    const top = candles[bestIdx].high, bottom = candles[bestIdx].low;
    orderBlocksRaw.push({ top, bottom, mid: (top + bottom) / 2, time: candles[bestIdx].time, bias, internal: false });
  };
  for (let i = 0; i < n; i++) {
    const fs = legSwing(i).flip;
    if (fs !== 0 && i - swingLen >= 0) {
      const pi = i - swingLen;
      if (fs === -1) { swingHigh.lastLevel = swingHigh.level; swingHigh.level = candles[pi].high; swingHigh.crossed = false; swingHigh.index = pi; swingHigh.time = candles[pi].time; trailingTop = swingHigh.level; }
      else { swingLow.lastLevel = swingLow.level; swingLow.level = candles[pi].low; swingLow.crossed = false; swingLow.index = pi; swingLow.time = candles[pi].time; trailingBottom = candles[pi].low; }
    }
    const fi = legInternal(i).flip;
    if (fi !== 0 && i - internalLen >= 0) {
      const pi = i - internalLen;
      if (fi === -1) { internalHigh.lastLevel = internalHigh.level; internalHigh.level = candles[pi].high; internalHigh.crossed = false; internalHigh.index = pi; internalHigh.time = candles[pi].time; }
      else { internalLow.lastLevel = internalLow.level; internalLow.level = candles[pi].low; internalLow.crossed = false; internalLow.index = pi; internalLow.time = candles[pi].time; }
    }
    if (i === 0) continue;
    const c = candles[i].close, cp = candles[i - 1].close;
    if (!Number.isNaN(internalHigh.level) && c > internalHigh.level && cp <= internalHigh.level && !internalHigh.crossed && internalHigh.level !== swingHigh.level) {
      structures.push({ time: candles[i].time, price: internalHigh.level, type: internalTrend === -1 ? "CHoCH" : "BOS", bias: "bullish", internal: true });
      internalHigh.crossed = true; internalTrend = 1;
    }
    if (!Number.isNaN(internalLow.level) && c < internalLow.level && cp >= internalLow.level && !internalLow.crossed && internalLow.level !== swingLow.level) {
      structures.push({ time: candles[i].time, price: internalLow.level, type: internalTrend === 1 ? "CHoCH" : "BOS", bias: "bearish", internal: true });
      internalLow.crossed = true; internalTrend = -1;
    }
    if (!Number.isNaN(swingHigh.level) && c > swingHigh.level && cp <= swingHigh.level && !swingHigh.crossed) {
      structures.push({ time: candles[i].time, price: swingHigh.level, type: swingTrend === -1 ? "CHoCH" : "BOS", bias: "bullish", internal: false });
      swingHigh.crossed = true; swingTrend = 1; captureOB(swingHigh.index, i, "bullish");
    }
    if (!Number.isNaN(swingLow.level) && c < swingLow.level && cp >= swingLow.level && !swingLow.crossed) {
      structures.push({ time: candles[i].time, price: swingLow.level, type: swingTrend === 1 ? "CHoCH" : "BOS", bias: "bearish", internal: false });
      swingLow.crossed = true; swingTrend = -1; captureOB(swingLow.index, i, "bearish");
    }
  }
  for (let i = 0; i < n; i++) { if (candles[i].high >= trailingTop) trailingTop = candles[i].high; if (candles[i].low <= trailingBottom) trailingBottom = candles[i].low; }
  const lastTime = candles[n - 1].time;
  const orderBlocks = orderBlocksRaw.filter((ob) => {
    for (let k = 0; k < n; k++) { if (candles[k].time <= ob.time) continue; if (ob.bias === "bullish" && candles[k].close < ob.bottom) return false; if (ob.bias === "bearish" && candles[k].close > ob.top) return false; }
    return true;
  }).filter((ob) => ob.time < lastTime).slice(-obCount * 3);
  const fvgsRaw: FVG[] = [];
  for (let i = 2; i < n; i++) {
    const gapUp = candles[i].low - candles[i - 2].high, gapDn = candles[i - 2].low - candles[i].high, thr = 0.25 * atr200[i];
    if (gapUp > thr && candles[i - 1].close > candles[i - 2].high) fvgsRaw.push({ top: candles[i].low, bottom: candles[i - 2].high, mid: (candles[i - 2].high + candles[i].low) / 2, time: candles[i].time, bias: "bullish" });
    else if (gapDn > thr && candles[i - 1].close < candles[i - 2].low) fvgsRaw.push({ top: candles[i - 2].low, bottom: candles[i].high, mid: (candles[i].high + candles[i - 2].low) / 2, time: candles[i].time, bias: "bearish" });
  }
  const fvgs = fvgsRaw.filter((g) => {
    for (let k = 0; k < n; k++) { if (candles[k].time <= g.time) continue; if (g.bias === "bullish" && candles[k].low < g.bottom) return false; if (g.bias === "bearish" && candles[k].high > g.top) return false; }
    return true;
  }).slice(-5);
  const pivHighs: { price: number; idx: number }[] = [], pivLows: { price: number; idx: number }[] = [];
  const Lk = 7, Rk = 1;
  for (let i = Lk; i < n - Rk; i++) {
    let isHigh = true, isLow = true;
    for (let k = i - Lk; k <= i + Rk; k++) { if (k === i) continue; if (candles[k].high >= candles[i].high) isHigh = false; if (candles[k].low <= candles[i].low) isLow = false; }
    if (isHigh) pivHighs.push({ price: candles[i].high, idx: i });
    if (isLow) pivLows.push({ price: candles[i].low, idx: i });
  }
  const cluster = (pivs: { price: number; idx: number }[], side: "buy" | "sell"): LiquidityPool[] => {
    const pools: LiquidityPool[] = []; const used = new Array(pivs.length).fill(false);
    for (let a = 0; a < pivs.length; a++) {
      if (used[a]) continue;
      const tol = atr10[pivs[a].idx] / 1.449; const members = [a];
      for (let b = a + 1; b < pivs.length; b++) if (!used[b] && Math.abs(pivs[b].price - pivs[a].price) <= tol) members.push(b);
      if (members.length >= 3) {
        members.forEach((m) => (used[m] = true));
        const price = members.reduce((s, m) => s + pivs[m].price, 0) / members.length;
        const lastIdx = Math.max(...members.map((m) => pivs[m].idx));
        let sweptIdx = -1;
        for (let k = lastIdx + 1; k < n; k++) { if ((side === "buy" && candles[k].high > price + tol) || (side === "sell" && candles[k].low < price - tol)) { sweptIdx = k; break; } }
        const swept = sweptIdx >= 0;
        pools.push({ price, side, count: members.length, time: candles[lastIdx].time, swept, sweptRecently: swept && sweptIdx >= n - 10 });
      }
    }
    return pools;
  };
  const liquidity = [...cluster(pivHighs, "buy"), ...cluster(pivLows, "sell")].sort((x, y) => y.count - x.count).slice(0, 8);
  const top = trailingTop, bottom = trailingBottom;
  const premium: Zone = { top, bottom: 0.95 * top + 0.05 * bottom };
  const discount: Zone = { top: 0.95 * bottom + 0.05 * top, bottom };
  const equilibrium: Zone = { top: 0.525 * top + 0.475 * bottom, bottom: 0.525 * bottom + 0.475 * top };
  const swingStructs = structures.filter((s) => !s.internal);
  return {
    price: candles[n - 1].close, atr: atr200[n - 1],
    swingBias: swingTrend === 1 ? "bullish" : swingTrend === -1 ? "bearish" : null,
    internalBias: internalTrend === 1 ? "bullish" : internalTrend === -1 ? "bearish" : null,
    lastSwing: swingStructs.length ? swingStructs[swingStructs.length - 1] : null,
    orderBlocks, fvgs, liquidity, trailingTop, trailingBottom, swingLowLevel: swingLow.level, swingHighLevel: swingHigh.level, internalLowLevel: internalLow.level, internalHighLevel: internalHigh.level, premium, equilibrium, discount,
    prevLevels: prevPeriodLevels(candles),
    // Strong/Weak (LuxAlgo, motor 7925e48): baixa → topo FORTE (origem defendida) + fundo FRACO; alta → espelho.
    extremes: swingTrend === -1 ? { high: "strong" as const, low: "weak" as const } : swingTrend === 1 ? { high: "weak" as const, low: "strong" as const } : null,
  };
}
function structuralBias(smc: SmcResult | null, momTf: number): number {
  if (!smc) return 0;
  let n = 0, d = 0; const add = (score: number, w: number) => { n += score * w; d += w; };
  add(smc.swingBias === "bullish" ? 78 : smc.swingBias === "bearish" ? -78 : 0, 0.40);
  if (smc.lastSwing) add((smc.lastSwing.bias === "bullish" ? 1 : -1) * (smc.lastSwing.type === "CHoCH" ? 80 : 55), 0.20);
  let z = 0;
  // Classificação pela BANDA DE EQUILÍBRIO (motor novo, fix da auditoria 7925e48).
  if (smc.price < smc.equilibrium.bottom) z = smc.internalBias === "bullish" ? 72 : 0;
  else if (smc.price > smc.equilibrium.top) z = smc.internalBias === "bearish" ? -72 : 0;
  add(z, 0.18);
  const atr = smc.atr || smc.price * 0.01;
  const dem = smc.orderBlocks.filter((o) => o.bias === "bullish" && o.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
  const sup = smc.orderBlocks.filter((o) => o.bias === "bearish" && o.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
  const dDist = dem ? (smc.price - dem.mid) / atr : 99, sDist = sup ? (sup.mid - smc.price) / atr : 99;
  add(dDist < 1.5 && dDist <= sDist ? 55 : sDist < 1.5 && sDist < dDist ? -55 : 0, 0.10);
  const fDem = smc.fvgs.filter((f) => f.bias === "bullish" && f.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
  const fSup = smc.fvgs.filter((f) => f.bias === "bearish" && f.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
  const fdDist = fDem ? (smc.price - fDem.mid) / atr : 99, fsDist = fSup ? (fSup.mid - smc.price) / atr : 99;
  const fvgScore = fdDist < 1.5 && fdDist <= fsDist ? 45 + 40 * Math.max(0, 1 - fdDist / 1.5)
    : fsDist < 1.5 && fsDist < fdDist ? -(45 + 40 * Math.max(0, 1 - fsDist / 1.5)) : 0;
  add(fvgScore, 0.18);
  add(clamp((momTf / 0.006) * 60), 0.12);
  return d ? Math.round(clamp(n / d)) : 0;
}

// ════════ DECISÃO SMC PRICE-ACTION (15m) — CÓPIA FIEL do bot-run (manter em sincronia) ════════
interface SmcPlan { want: "long" | "short" | null; setup: string; stop: number | null; target: number | null; note: string; zoneKey?: string | null }
function smcDecision(smc: SmcResult, lastPx: number, lastT: number, o: { imbalanceOn: boolean; imbMinPct: number; stopAtrMult: number; fut: boolean; imbRetest?: boolean; maxZoneAtr?: number; oppZoneAtr?: number; barSec?: number; imbAlign?: boolean; structFirst?: boolean; dirMode?: string; zoneDiscipline?: boolean; zoneBreakWin?: number; zoneBreakInternal?: boolean; vp?: VolumeProfile | null; vpMode?: string; fadeMode?: string; obMode?: string; minRr?: number; extVeto?: boolean; structEntry?: string; structEntryWin?: number; structEntryInternal?: boolean }): SmcPlan {
  const price = lastPx > 0 ? lastPx : smc.price;
  const atr = smc.atr || price * 0.01, buf = 0.25 * atr;
  // EXPERIMENTO dir_mode (caso SOL 06/jul: short no topo com a interna JÁ bullish): "any" (atual) =
  // OU das 3 leituras (deixa estrutura VELHA vencer a recente); "majority" = 2 de 3 concordando;
  // "internal" = a estrutura INTERNA (recente) manda (fallback maioria quando neutra).
  const reads = [smc.lastSwing?.bias ?? null, smc.internalBias, smc.swingBias];
  const nBull = reads.filter((r) => r === "bullish").length, nBear = reads.filter((r) => r === "bearish").length;
  const dm = o.dirMode ?? "any";
  const bull = dm === "majority" ? nBull >= 2 : dm === "internal" ? (smc.internalBias ? smc.internalBias === "bullish" : nBull >= 2) : nBull > 0;
  const bear = dm === "majority" ? nBear >= 2 : dm === "internal" ? (smc.internalBias ? smc.internalBias === "bearish" : nBear >= 2) : nBear > 0;
  // Zona pela BANDA DE EQUILÍBRIO (motor novo 7925e48; as bordas 95/5 sufocavam o setup B).
  const inDisc = price < smc.equilibrium.bottom, inPrem = price > smc.equilibrium.top;
  const sweptSell = smc.liquidity.some((l) => l.side === "sell" && l.sweptRecently);
  const sweptBuy = smc.liquidity.some((l) => l.side === "buy" && l.sweptRecently);
  const bullOB = smc.orderBlocks.filter((b) => b.bias === "bullish" && price >= b.bottom && price <= b.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearOB = smc.orderBlocks.filter((b) => b.bias === "bearish" && price <= b.top && price >= b.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  const bullFvg = smc.fvgs.filter((f) => f.bias === "bullish" && price >= f.bottom && price <= f.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearFvg = smc.fvgs.filter((f) => f.bias === "bearish" && price <= f.top && price >= f.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  // MODO RETEST (igual ao módulo Smart Money): FVG é ZONA respeitada — só entra quando o preço
  // VOLTA pra dentro dela (janela de frescor maior, 16 velas ≈ 4h). Modo chase (antigo): entra
  // na FORMAÇÃO do gap (janela 2 velas), comprando o esticado do impulso.
  const freshWin = o.imbRetest ? 16 : 2;
  const barSec = o.barSec ?? 900; // duração da vela do TF base (a janela de frescor escala com o TF)
  const inZone = (f: FVG) => price >= f.bottom - buf && price <= f.top + buf;
  // EXPERIMENTO max_zone_atr: entrada imbalance só com o preço a ≤ X ATR da borda do FVG
  // (mata o "chase esticado" — comprar longe da zona de origem depois do impulso). 0 = off.
  const nearZone = (f: FVG) => !o.maxZoneAtr || o.maxZoneAtr <= 0 ? true
    : (f.bias === "bullish" ? (price - f.top) / atr <= o.maxZoneAtr : (f.bottom - price) / atr <= o.maxZoneAtr);
  const fresh = smc.fvgs.filter((f) => f.time >= lastT - barSec * freshWin && Math.abs(f.top - f.bottom) / price * 100 >= o.imbMinPct && (!o.imbRetest || inZone(f)) && nearZone(f));
  const freshBull = fresh.filter((f) => f.bias === "bullish").sort((a, b) => b.time - a.time)[0];
  const freshBear = fresh.filter((f) => f.bias === "bearish").sort((a, b) => b.time - a.time)[0];
  // EXPERIMENTO imb_align (playbook do dono): o setup de imbalance só vale A FAVOR da estrutura
  // (fim dos shorts de FVG contra alta — 31% de acerto no live). EXPERIMENTO setup_priority
  // "structure": o reteste de OB/FVG pós-BOS/CHoCH (o setup do print) tem prioridade sobre imbalance.
  const imbLongOk = o.imbalanceOn && !!freshBull && (!freshBear || freshBull.time >= freshBear.time) && (!o.imbAlign || bull);
  const imbShortOk = o.imbalanceOn && !!freshBear && (!freshBull || freshBear.time >= freshBull.time) && (!o.imbAlign || bear);
  // EXPERIMENTO ob_mode (painel apontou OB 60% na régua fraca; régua forte n=9 inconclusiva):
  // "default" = atual (OB/FVG + varredura ou zona); "solo" = reteste de OB dispensa a exigência
  // de varredura/zona (OB ganha mais poder de gatilho); "only" = setup B SÓ por OB (reteste puro).
  const om = o.obMode ?? "default";
  const structLongOk = om === "only" ? (bull && !!bullOB)
    : om === "solo" ? (bull && (!!bullOB || (!!bullFvg && (sweptSell || inDisc))))
    : (bull && !!(bullOB || bullFvg) && (sweptSell || inDisc));
  const structShortOk = om === "only" ? (bear && !!bearOB)
    : om === "solo" ? (bear && (!!bearOB || (!!bearFvg && (sweptBuy || inPrem))))
    : (bear && !!(bearOB || bearFvg) && (sweptBuy || inPrem));
  let want: "long" | "short" | null = null, setup = "", zone: { bottom: number; top: number; time?: number } | null = null;
  const pick = (w: "long" | "short", s: string, z: { bottom: number; top: number; time?: number } | null) => { want = w; setup = s; zone = z; };
  // EXPERIMENTO fade_mode "strong" (SETUP C — caso BTC 06/jul do dono): preço chega num EXTREMO
  // FORTE (extremes do motor 7925e48: topo defendido/origem do movimento) em premium/discount e
  // forma FVG CONTRÁRIO fresco (reação confirmada) → fade counter-trend, stop além do extremo.
  if (o.fadeMode === "strong" && smc.extremes) {
    const nearTop = Number.isFinite(smc.trailingTop) && smc.trailingTop - price <= 0.8 * atr && price <= smc.trailingTop + buf;
    const nearBot = Number.isFinite(smc.trailingBottom) && price - smc.trailingBottom <= 0.8 * atr && price >= smc.trailingBottom - buf;
    if (smc.extremes.high === "strong" && inPrem && nearTop && freshBear && o.fut) pick("short", "fade topo forte ↓", freshBear);
    else if (smc.extremes.low === "strong" && inDisc && nearBot && freshBull) pick("long", "fade fundo forte ↑", freshBull);
  }
  // EXPERIMENTO struct_entry (fase W, SPEC DO DONO 08/jul: "não precisa de OB pro robô operar —
  // quebrou estrutura de alta entra na venda, quebra de baixa entra na compra; só cuidar no
  // premium/discount"): a QUEBRA (BOS/CHoCH) recente é gatilho PRÓPRIO, sem exigir zona.
  //   "only" = SÓ a quebra dispara (setups de zona desligados); "add" = quebra entra como setup
  //   adicional quando não há setup de zona. Janela de frescor struct_entry_win velas (default 2).
  //   struct_entry_internal = quebras INTERNAS (CHoCH/BOS de ~1h) também disparam.
  //   O cuidado do dono nas regiões é a zoneDiscipline (abaixo), que já segura compra no premium
  //   e venda no discount — vale pra este setup também. Stop = swing oposto (invalidação real).
  const seMode = o.structEntry ?? "off";
  const structBreakPick = () => {
    const win = o.structEntryWin ?? 2;
    const ev = smc.lastSwing; // último evento de ESTRUTURA (BOS/CHoCH não-interno)
    const evOk = ev && ev.time >= lastT - barSec * win;
    const iBias = o.structEntryInternal ? smc.internalBias : null; // proxy: interna recém-virada
    if (evOk && ev!.bias === "bullish" && bull) pick("long", "quebra de estrutura ↑", null);
    else if (evOk && ev!.bias === "bearish" && bear && o.fut) pick("short", "quebra de estrutura ↓", null);
    else if (!evOk && iBias === "bullish" && bull) pick("long", "quebra interna ↑", null);
    else if (!evOk && iBias === "bearish" && bear && o.fut) pick("short", "quebra interna ↓", null);
  };
  if (!want && seMode === "only") {
    structBreakPick();
  } else if (!want) if (o.structFirst) {
    if (structLongOk) pick("long", "OB/FVG + estrutura ↑", bullOB ?? bullFvg);
    else if (structShortOk) pick("short", "OB/FVG + estrutura ↓", bearOB ?? bearFvg);
    else if (imbLongOk) pick("long", "imbalance ↑", freshBull);
    else if (imbShortOk) pick("short", "imbalance ↓", freshBear);
    else if (seMode === "add") structBreakPick();
  } else {
    if (imbLongOk) pick("long", "imbalance ↑", freshBull);
    else if (imbShortOk) pick("short", "imbalance ↓", freshBear);
    else if (structLongOk) pick("long", "OB/FVG + estrutura ↑", bullOB ?? bullFvg);
    else if (structShortOk) pick("short", "OB/FVG + estrutura ↓", bearOB ?? bearFvg);
    else if (seMode === "add") structBreakPick();
  }
  if (!want) return { want: null, setup: "", stop: null, target: null, note: "sem setup" };
  if (want === "short" && !o.fut) return { want: null, setup: "", stop: null, target: null, note: "spot" };
  // DISCIPLINA DE ZONA (pedido do dono 06/jul): no PREMIUM (topo) não compra — só vende, salvo
  // ROMPIMENTO de swing recente pra cima (sinal forte); no DISCOUNT (fundo), espelho. O fade
  // (setup C) é isento — ele é a venda do premium / compra do discount por definição.
  if (o.zoneDiscipline && !setup.startsWith("fade")) {
    const bw = o.zoneBreakWin ?? 16; // janela (velas) em que um rompimento de swing "vale" como sinal forte
    const swingBreak = smc.lastSwing && smc.lastSwing.time >= lastT - barSec * bw ? smc.lastSwing.bias : null;
    // zone_break_internal: a estrutura INTERNA recente também conta como evidência de rompimento
    const upOk = swingBreak === "bullish" || (o.zoneBreakInternal === true && smc.internalBias === "bullish");
    const dnOk = swingBreak === "bearish" || (o.zoneBreakInternal === true && smc.internalBias === "bearish");
    if (want === "long" && inPrem && !upOk) return { want: null, setup: "", stop: null, target: null, note: "premium sem rompimento — zona de venda" };
    if (want === "short" && inDisc && !dnOk) return { want: null, setup: "", stop: null, target: null, note: "discount sem quebra — zona de compra" };
  }
  // EXPERIMENTO ext_veto (fase S, aprendizado 07/jul: OB/zona é o que prediz; extremo defendido é
  // zona): extremo FORTE (strong high/low do LuxAlgo = origem defendida) colado à frente VETA a
  // entrada na direção dele — não se compra a ≤0,8 ATR de um topo forte nem se vende colado num
  // fundo forte. (Espelho-veto do fade_mode, que ENTRA contra nesses pontos; fade fica isento.)
  if (o.extVeto && smc.extremes && !setup.startsWith("fade")) {
    if (want === "long" && smc.extremes.high === "strong" && Number.isFinite(smc.trailingTop) && smc.trailingTop > price && smc.trailingTop - price <= 0.8 * atr)
      return { want: null, setup: "", stop: null, target: null, note: "topo forte colado acima — veta compra" };
    if (want === "short" && smc.extremes.low === "strong" && Number.isFinite(smc.trailingBottom) && smc.trailingBottom < price && price - smc.trailingBottom <= 0.8 * atr)
      return { want: null, setup: "", stop: null, target: null, note: "fundo forte colado abaixo — veta venda" };
  }
  // EXPERIMENTO opp_zone_atr: bloqueia a entrada quando há FVG/OB OPOSTO não-preenchido a ≤ X ATR
  // à frente (estaria entrando direto numa oferta/demanda fresca — o alvo morre nela). 0 = off.
  if (o.oppZoneAtr && o.oppZoneAtr > 0) {
    const ahead = o.oppZoneAtr * atr;
    const oppFvg = want === "long"
      ? smc.fvgs.some((f) => f.bias === "bearish" && f.bottom > price - buf && f.bottom - price <= ahead)
      : smc.fvgs.some((f) => f.bias === "bullish" && f.top < price + buf && price - f.top <= ahead);
    const oppOb = want === "long"
      ? smc.orderBlocks.some((b) => b.bias === "bearish" && b.bottom > price - buf && b.bottom - price <= ahead)
      : smc.orderBlocks.some((b) => b.bias === "bullish" && b.top < price + buf && price - b.top <= ahead);
    if (oppFvg || oppOb) return { want: null, setup: "", stop: null, target: null, note: "zona oposta fresca à frente" };
  }
  // EXPERIMENTO vp_mode "react" (camada Volume Profile do módulo): POC/VAH/VAL são níveis de
  // REAÇÃO — não entrar com um deles colado à frente (≤0,5 ATR): o movimento morre nele
  // (casos BTC/SOL 06/jul reagindo no VA High).
  if (o.vpMode === "react" && o.vp) {
    const lv = [o.vp.poc, o.vp.vah, o.vp.val];
    const aheadVp = want === "long"
      ? lv.some((L) => L > price && L - price <= 0.5 * atr)
      : lv.some((L) => L < price && price - L <= 0.5 * atr);
    if (aheadVp) return { want: null, setup: "", stop: null, target: null, note: "nível de VP colado à frente" };
  }
  let stop: number;
  if (want === "long") {
    stop = (zone ? (zone as Zone).bottom : (Number.isFinite(smc.swingLowLevel) ? smc.swingLowLevel : price - o.stopAtrMult * atr)) - buf;
    if (Number.isFinite(smc.swingLowLevel) && smc.swingLowLevel < price) stop = Math.min(stop, smc.swingLowLevel - buf);
    if (stop >= price) stop = price - o.stopAtrMult * atr;
  } else {
    stop = (zone ? (zone as Zone).top : (Number.isFinite(smc.swingHighLevel) ? smc.swingHighLevel : price + o.stopAtrMult * atr)) + buf;
    if (Number.isFinite(smc.swingHighLevel) && smc.swingHighLevel > price) stop = Math.max(stop, smc.swingHighLevel + buf);
    if (stop <= price) stop = price + o.stopAtrMult * atr;
  }
  // ALVO: próxima liquidez a favor; senão PDH/PWH/PMH e níveis de VP (ímãs); senão a zona oposta.
  let target: number | null;
  const pl = smc.prevLevels;
  const vpLv = o.vpMode === "react" && o.vp ? [o.vp.poc, o.vp.vah, o.vp.val] : [];
  if (want === "long") {
    const la = smc.liquidity.filter((l) => l.side === "buy" && l.price > price).sort((a, b) => a.price - b.price)[0];
    const fbUp = [pl.pdh, pl.pwh, pl.pmh, ...vpLv].filter((v): v is number => v != null && v > price).sort((a, b) => a - b)[0];
    target = la ? la.price : fbUp ?? (price < smc.premium.bottom ? smc.premium.bottom : null);
  } else {
    const lb = smc.liquidity.filter((l) => l.side === "sell" && l.price < price).sort((a, b) => b.price - a.price)[0];
    const fbDn = [pl.pdl, pl.pwl, pl.pml, ...vpLv].filter((v): v is number => v != null && v < price).sort((a, b) => b - a)[0];
    target = lb ? lb.price : fbDn ?? (price > smc.discount.top ? smc.discount.top : null);
  }
  const risk = Math.abs(price - stop);
  // EXPERIMENTO min_rr (fase R, caso 07/jul: ETH 1809/BNB 584/BTC 63769 comprando com o ímã COLADO):
  // exige alvo estrutural válido com R:R ≥ min_rr — sem alvo, ou com a próxima liquidez/ímã mais
  // perto que o risco, NÃO entra (antes: entrava "sem alvo" e corria só no trailing). 0 = off.
  if (o.minRr && o.minRr > 0) {
    const rr = target != null && risk > 0 ? Math.abs(target - price) / risk : 0;
    if (rr < o.minRr) return { want: null, setup: "", stop: null, target: null, note: "R:R abaixo do mínimo — ímã/alvo colado à frente" };
  }
  if (target != null && risk > 0 && Math.abs(target - price) < risk) target = null;
  // Identidade da zona de origem (p/ o experimento zone_once: 1 entrada por zona — stopou, não re-entra).
  const zoneKey = zone && (zone as { time?: number }).time ? `${setup}:${(zone as { time?: number }).time}` : null;
  return { want, setup, stop, target, note: setup, zoneKey };
}

// ════════ Klines históricos REAIS — endpoint PÚBLICO de dados da Binance (geo-aberto). ════════
// ════════ Indicadores clássicos (cópia FIEL de bot-run) — p/ o FILTRO TA opcional ════════
function emaLast(vals: number[], len: number): number | null {
  if (vals.length < len) return null;
  const k = 2 / (len + 1);
  let e = vals.slice(0, len).reduce((s, v) => s + v, 0) / len;
  for (let i = len; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
function adxDmi(cs: Candle[], len = 14): { adx: number; diP: number; diM: number } | null {
  if (cs.length < len * 3) return null;
  let trS = 0, pS = 0, mS = 0, adx = 0, dxN = 0;
  for (let i = 1; i < cs.length; i++) {
    const up = cs[i].high - cs[i - 1].high, dn = cs[i - 1].low - cs[i].low;
    const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(cs[i].high - cs[i].low, Math.abs(cs[i].high - cs[i - 1].close), Math.abs(cs[i].low - cs[i - 1].close));
    if (i <= len) { trS += tr; pS += pdm; mS += mdm; if (i < len) continue; }
    else { trS += tr - trS / len; pS += pdm - pS / len; mS += mdm - mS / len; }
    const diP = trS > 0 ? (100 * pS) / trS : 0, diM = trS > 0 ? (100 * mS) / trS : 0;
    const dx = diP + diM > 0 ? (100 * Math.abs(diP - diM)) / (diP + diM) : 0;
    dxN++;
    adx = dxN === 1 ? dx : (adx * (len - 1) + dx) / len;
    if (i === cs.length - 1) return { adx, diP, diM };
  }
  return null;
}
function dailyVwap(cs: Candle[]): number | null {
  if (!cs.length) return null;
  const dayStart = Math.floor(cs[cs.length - 1].time / 86400) * 86400;
  let pv = 0, vv = 0;
  for (const c of cs) { const v = c.volume ?? 0; if (c.time >= dayStart && v > 0) { pv += ((c.high + c.low + c.close) / 3) * v; vv += v; } }
  return vv > 0 ? pv / vv : null;
}

// data-api.binance.vision = mercado spot, feito p/ histórico (sem auth/geo-block). Estruturalmente
// idêntico ao perp p/ as majors (o backtest é de ESTRUTURA de preço), evitando bloqueio de futuros.
const DATA = "https://data-api.binance.vision";
const TF_MS: Record<string, number> = { "5m": 300000, "15m": 900000, "30m": 1800000, "1H": 3600000, "4H": 14400000, "1D": 86400000 };
const TF_INT: Record<string, string> = { "5m": "5m", "15m": "15m", "30m": "30m", "1H": "1h", "4H": "4h", "1D": "1d" };

async function fetchKlines(symbol: string, tf: string, startMs: number, endMs: number): Promise<Candle[]> {
  const out: Candle[] = []; let cursor = startMs; const int = TF_INT[tf];
  for (let guard = 0; guard < 60 && cursor < endMs; guard++) {
    const url = `${DATA}/api/v3/klines?symbol=${symbol}&interval=${int}&startTime=${cursor}&endTime=${endMs}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) break;
    const rows = await r.json().catch(() => []) as (string | number)[][];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const x of rows) out.push({ time: Math.floor(Number(x[0]) / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4], volume: +x[5] || 0, delta: 2 * (+x[10] || 0) - (+x[7] || 0) }); // delta por vela = taker buy − taker sell (USD)
    const last = Number(rows[rows.length - 1][0]);
    if (rows.length < 1000) break;
    cursor = last + TF_MS[tf];
  }
  return out;
}

// ─── FOREX (Yahoo Finance, grátis/sem chave) — MESMO motor SMC, só troca a fonte de candle.
//     Só p/ TESTE exploratório: majors têm 15m/1h; sem delta/volume real (delta=0). Guardado
//     por market:"forex" no body — não altera nada do fluxo cripto (Binance).
const YF_INT: Record<string, string> = { "5m": "5m", "15m": "15m", "30m": "30m", "1H": "60m", "4H": "60m", "1D": "1d" };
async function fetchForexYahoo(asset: string, tf: string, startMs: number, endMs: number): Promise<Candle[]> {
  const interval = YF_INT[tf] ?? "15m";
  const p1 = Math.floor(startMs / 1000), p2 = Math.floor(endMs / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${asset}=X?period1=${p1}&period2=${p2}&interval=${interval}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
  if (!r.ok) return [];
  const j = await r.json().catch(() => null);
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: ts[i], open: +o, high: +h, low: +l, close: +c, volume: +(q.volume?.[i] ?? 0), delta: 0 });
  }
  return out;
}

interface Trade { side: "long" | "short"; entryTime: number; entryPx: number; exitTime: number; exitPx: number; stopPx: number; riskDist: number; reason: string; r: number; rNet: number; bars: number; counter: boolean }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Admin (JWT) OU x-cron-key — mesmo padrão do bot-run (permite rodar experimentos sem browser).
  let authorized = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: sk } = await admin.from("app_secrets").select("value").eq("key", "newsletter_cron_key").maybeSingle();
    if (sk?.value && cronKey === sk.value) authorized = true;
  }
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const u = userData?.user;
    if (!u) return json(401, { error: "nao autorizado" });
    const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
    if (prof?.role !== "admin") return json(403, { error: "somente admin" });
  }

  const body = await req.json().catch(() => ({}));
  const asset = String(body.asset ?? "BTC").toUpperCase();
  const days = Math.max(3, Math.min(180, Number(body.days ?? 30))); // até 180d → cobre alta/queda/lateral (fetchKlines pagina)
  // FILTRO TA opcional (experimento SMC + clássicos): gateia só setups NÃO-imbalance (mesma
  // semântica do veto de fluxo ao vivo). Default tudo OFF = baseline intacto.
  const ta = { vwap: !!body?.ta?.vwap, ema: !!body?.ta?.ema, adx: !!body?.ta?.adx };
  const taOn = ta.vwap || ta.ema || ta.adx;
  // EXPERIMENTO ta_scope: "structural" (default, atual) = filtro técnico só nos setups não-imbalance;
  // "all" = TAMBÉM filtra o setup A (imbalance/FVG) — testa a hipótese "entrada a favor de EMA/VWAP
  // ganha mais" na porta PRINCIPAL de entrada do robô.
  const taAll = String(body?.ta_scope ?? "structural") === "all";
  // EXPERIMENTO entry_mode: "smc" (default, atual) = só setups SMC; "ta" = SÓ entrada TA-led
  // (pullback à EMA20 em tendência EMA20>50 + lado certo do VWAP; stop estrutural, alvo liquidez);
  // "both" = SMC + TA-led quando o SMC não tem setup. Hipótese do dono: médias/VWAP como BASE.
  const entryMode = String(body?.entry_mode ?? "smc");
  const entryTa = entryMode === "ta" || entryMode === "both";
  // EXPERIMENTOS DE CHURN (a matriz 90d mostrou: ~50% das saídas são reversão → o problema é
  // girar demais, não a entrada). Defaults reproduzem o comportamento atual do robô.
  const revMode = String(body?.rev_mode ?? "any");                      // any | imbalance (só FVG fresco vira a mão) | off (nunca reverte)
  const minHold = Math.max(0, Number(body?.min_hold_bars ?? 0));        // barras mínimas antes de poder reverter
  const cooldownBars = Math.max(0, Number(body?.cooldown_bars ?? 0));   // barras sem entrar após STOP (live: 15min ≈ 1 barra)
  const imbRetest = String(body?.imb_mode ?? "chase") === "retest";     // retest = entra na VOLTA à zona do FVG (igual módulo Smart Money); chase = na formação
  const htfOn = !!body?.htf_filter;                                     // estrutura do 1H como FILTRO de direção (não vota — só alinha)
  const maxZoneAtr = Math.max(0, Number(body?.max_zone_atr ?? 0));      // imbalance só a ≤ X ATR da borda do FVG (0=off)
  const oppZoneAtr = Math.max(0, Number(body?.opp_zone_atr ?? 0));      // bloqueia entrada com FVG/OB oposto a ≤ X ATR à frente (0=off)
  const useTarget = body?.use_target !== false;                         // false = SEM take-profit (sai só por stop/trailing) — REPROVADO 03/jul (pior em 7/8 janelas)
  const tpPartial = String(body?.tp_mode ?? "full") === "partial";      // partial = embolsa METADE no alvo, o resto corre no trailing com stop ≥ breakeven
  // FILTRO DE SESSÃO (experimento): horas UTC em que o robô NÃO ABRE posição nova (saídas seguem
  // normais). Ex.: [0,1,2,3] = sem entradas na madrugada UTC. Vazio = sem filtro (baseline).
  const blockHours = new Set<number>(Array.isArray(body?.block_hours) ? (body.block_hours as unknown[]).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) : []);
  // EXPERIMENTO base_tf: roda o MESMO motor em outro timeframe (15m | 30m | 1H | 4H) — mede se a
  // estratégia atual rende mais em velas mais lentas (menos ruído × menos sinais/stop mais largo).
  const baseTf = ["5m", "15m", "30m", "1H", "4H"].includes(String(body?.base_tf)) ? String(body?.base_tf) : "15m";
  // EXPERIMENTO trail_mode: "atr" (default, atual) = chandelier ATR + piso de estrutura;
  // "candle" = stop segue a mínima/máxima do ÚLTIMO candle FECHADO do trail_tf (ratchet, sem piso).
  // trail_arm_r > 0 = só arma o candle-trail após X R de lucro (modo runner; 0 = desde a entrada).
  const trailMode = String(body?.trail_mode ?? "atr");
  const trailTf = ["5m", "15m", "30m", "1H", "4H"].includes(String(body?.trail_tf)) ? String(body?.trail_tf) : baseTf;
  const trailArmR = Math.max(0, Number(body?.trail_arm_r ?? 0));
  // PLAYBOOK DO DONO (06/jul): imbalance A FAVOR da estrutura, reteste de OB/FVG com prioridade,
  // e 1 tiro por zona (stopou na zona → ela invalidou, não re-entra nela).
  const imbAlign = !!body?.imb_align;
  const structFirst = String(body?.setup_priority ?? "imbalance") === "structure";
  const zoneOnce = !!body?.zone_once;
  // CONTEXTO (caso SOL 06/jul): dir_mode = como as 3 leituras de estrutura viram direção;
  // htf_tf = timeframe do filtro HTF (era fixo 1H; agora testável com 4H = "bússola" do dono).
  const dirMode = ["any", "majority", "internal"].includes(String(body?.dir_mode)) ? String(body?.dir_mode) : "any";
  const htfTf = ["1H", "4H", "1D"].includes(String(body?.htf_tf)) ? String(body?.htf_tf) : "1H";
  // EXPERIMENTO vp_mode: "react" = POC/VAH/VAL (camada Volume Profile do módulo, mesma matemática)
  // como níveis de reação (bloqueia entrada com nível colado à frente) e alvo fallback. "off" = atual.
  const vpMode = String(body?.vp_mode ?? "off");
  // EXPERIMENTO fade_mode: "strong" = setup C (fade de extremo forte: premium/discount + topo/fundo
  // defendido + FVG contrário fresco = reação; counter-trend consciente). "off" = atual.
  const fadeMode = String(body?.fade_mode ?? "off");
  const obMode = ["default", "solo", "only"].includes(String(body?.ob_mode)) ? String(body?.ob_mode) : "default";
  // EXPERIMENTO delta_confirm (ideia do dono 06/jul): a VELA da entrada precisa ter DELTA
  // (volume comprador − vendedor, da própria formação do candle) a favor da direção.
  const deltaConfirm = String(body?.delta_confirm ?? "off") === "on";
  // EXPERIMENTO zone_discipline: premium = só venda (salvo rompimento recente); discount = só compra.
  const zoneDiscipline = String(body?.zone_discipline ?? "off") === "on";
  const zoneBreakWin = Math.max(2, Number(body?.zone_break_win ?? 16));
  const zoneBreakInternal = String(body?.zone_break_internal ?? "off") === "on";
  // EXPERIMENTO zone_mode "strong" (spec do dono): na zona, só rompimento COM volume (delta ≥1,5× média),
  // força (ADX≥25) e estrutura quebrando — compra e venda simétricos.
  const zoneStrong = String(body?.zone_mode ?? "off") === "strong";
  // EXPERIMENTO sq_filter (Squeeze Momentum LazyBear como filtro): bloqueia entrada quando o
  // momentum (linreg do desvio, 20 velas) esta FORTE contra a direcao (>=0,5 ATR).
  const sqFilter = String(body?.sq_filter ?? "off") === "on";
  // EXPERIMENTO sq_mode (fase Q, caso SOL 07/jul): "abs" = valor bruto (atual); "slope" = momentum
  // contra mas DESACELERANDO ha 2 velas seguidas libera (vendedor exausto pos-capitulacao — o
  // "maroon" do LazyBear; mesma nuance de inclinacao usada na Leitura do Mercado).
  const sqMode = String(body?.sq_mode ?? "abs") === "slope" ? "slope" : "abs";
  // EXPERIMENTO min_rr (fase R): R:R mínimo vs o alvo estrutural (próxima liquidez/PDH-PDL) — sem
  // alvo válido (ímã mais perto que o risco) não entra. 0 = off (comportamento atual: entra sem alvo).
  const minRr = Math.max(0, Number(body?.min_rr ?? 0));
  // EXPERIMENTO opp_htf_atr (fase R, prints 07/jul): zona OPOSTA fresca do TF MAIOR (OB/FVG do
  // htf_tf) a ≤ X ATR(HTF) à frente bloqueia a entrada — não se compra colado num OB 1H de venda.
  const oppHtfAtr = Math.max(0, Number(body?.opp_htf_atr ?? 0));
  // EXPERIMENTO ext_veto (fase S): topo/fundo FORTE colado à frente veta entrada na direção dele.
  const extVeto = String(body?.ext_veto ?? "off") === "on";
  // EXPERIMENTO struct_entry (fase W, spec do dono 08/jul): quebra de estrutura (BOS/CHoCH) como
  // GATILHO próprio — "fez padrão de alta compra, padrão de baixa vende; cuidar no premium/discount".
  const structEntry = ["add", "only"].includes(String(body?.struct_entry)) ? String(body?.struct_entry) : "off";
  const structEntryWin = Math.max(1, Number(body?.struct_entry_win ?? 2));
  const structEntryInternal = String(body?.struct_entry_internal ?? "off") === "on";
  // EXPERIMENTO trail_liq_mult (fase X): trailing aperta pra K×ATR quando o preço está na zona de
  // reação (±0,5 ATR) de uma poça de liquidez a favor; atravessou, volta ao trail normal. 0 = off.
  const trailLiqMult = Math.max(0, Number(body?.trail_liq_mult ?? 0));
  // EXPERIMENTO time_stop_bars (fase V, prática das plataformas): posição que NUNCA andou (pico de
  // lucro < 1R) após N velas sai a mercado — o setup de 15m que não performa perdeu a validade. 0=off.
  const timeStopBars = Math.max(0, Number(body?.time_stop_bars ?? 0));
  // EXPERIMENTO vol_max_atr (fase V): não entrar em vela de range esticado (> K×ATR — candle de
  // notícia/spike; as plataformas seguram pra não ser atropeladas). 0=off.
  const volMaxAtr = Math.max(0, Number(body?.vol_max_atr ?? 0));
  // EXPERIMENTO struct_exit (ideia do dono 08/jul, Opção 1): SAI da posição quando a estrutura
  // VIRA CONTRA na base — CHoCH contra a posição impresso APÓS a entrada. Segue o SMC também na
  // saída (não só no trailing/alvo): estrutura de alta virou baixa → fecha o long. "internal"
  // também conta a virada da estrutura INTERNA (~1h) como saída (mais sensível). 0/off = atual.
  const structExit = ["on", "internal"].includes(String(body?.struct_exit)) ? String(body?.struct_exit) : "off";
  const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return json(500, { error: "sem config" });

  // Parâmetros (do config atual; body pode SOBRESCREVER p/ experimentos A/B).
  const stopMult = Number(cfg.stop_atr_mult ?? 3); // fallback do stop quando não há nível estrutural
  const trailOn = !!cfg.trail_on, trailMult = Number(body?.trail_atr_mult ?? cfg.trail_atr_mult ?? 3);
  // EXPERIMENTO trail_floor: "structure" (default, atual) = piso de estrutura sempre afrouxa até o swing;
  // "smart" (Opção B) = o piso só vale enquanto o swing PROTEGE lucro (acima da entrada no long / espelho);
  // swing velho abaixo da entrada não segura mais o chandelier em runner vertical.
  // trail_floor: "structure" (default) = piso no último SWING (len 20 ≈ 5h — lento, prende o stop
  // perto da entrada em runner); "smart" (REPROVADO 03/jul manhã) = piso só se protege lucro;
  // "internal" (experimento 03/jul noite) = piso no último swing INTERNO (len 5 ≈ 1h) — o stop
  // acompanha a estrutura recente do runner (caso BNB: subiu 8 pts e o stop ficou na entrada).
  const floorMode = String(body?.trail_floor ?? "structure");
  const floorSmart = floorMode === "smart";
  const floorInternal = floorMode === "internal";
  const imbalanceOn = cfg.imbalance_on !== false, imbMinPct = Number(body?.imb_min_pct ?? cfg.imbalance_min_pct ?? 0);
  const riskPct = Number(cfg.risk_pct ?? 1);
  const feePct = Number(body.fee_pct ?? 0.04), slipPct = Number(body.slip_pct ?? 0.02); // taxa taker + slippage por lado (%)
  const costFrac = (feePct + slipPct) / 100;

  const isForex = String(body?.market ?? "") === "forex";
  const quote = String(cfg.quote_ccy ?? "USDT");
  const symbol = isForex ? asset : `${asset}${quote}`;
  const now = Date.now();
  const windowStart = now - days * 86400000;
  const WARM = 320; // candles de aquecimento por TF (atr200 + estrutura)

  // Busca candles reais de cada TF (janela + aquecimento). HTF e trail_tf entram junto se usados.
  const tfList = [...new Set([baseTf, ...(htfOn || oppHtfAtr > 0 ? [htfTf] : []), ...(trailMode === "candle" ? [trailTf] : [])])];
  const byTf: Record<string, Candle[]> = {};
  for (const tf of tfList) {
    byTf[tf] = isForex
      ? await fetchForexYahoo(asset, tf, windowStart - WARM * TF_MS[tf], now)
      : await fetchKlines(symbol, tf, windowStart - WARM * TF_MS[tf], now);
  }
  const base = byTf[baseTf];
  const barMs = TF_MS[baseTf], barSec = barMs / 1000;
  if (!base || base.length < WARM + 20) return json(400, { error: `poucos candles p/ ${symbol} (${base?.length ?? 0})` });

  // closeTime[tf][i] = fim da vela i (openTime + duração). Ponteiros avançam sem lookahead.
  const closeMs: Record<string, number[]> = {};
  for (const tf of tfList) closeMs[tf] = byTf[tf].map((c) => c.time * 1000 + TF_MS[tf]);
  const ptr: Record<string, number> = { "5m": -1, "15m": -1, "30m": -1, "1H": -1, "4H": -1, "1D": -1 };
  const smcCache: Record<string, SmcResult | null> = {};
  const momCache: Record<string, number> = {};

  const LOOKBACK = 300; // casa com o bot-run (klines limit:300 por TF)
  const taCache: { e20: number | null; e50: number | null; adx: number | null; vwap: number | null } = { e20: null, e50: null, adx: null, vwap: null };
  let vpCache: VolumeProfile | null = null;
  const recompute = (tf: string, closedIdx: number) => {
    const arr = byTf[tf];
    const lo = Math.max(0, closedIdx - LOOKBACK + 1);
    const win = arr.slice(lo, closedIdx + 1);
    smcCache[tf] = computeSmc(win, SWING);
    if (tf === baseTf && vpMode !== "off") vpCache = computeVolumeProfile(win);
    const cl = win.map((c) => c.close);
    momCache[tf] = cl.length >= 4 ? (cl[cl.length - 1] - cl[cl.length - 4]) / cl[cl.length - 4] : 0;
    if (tf === baseTf && (taOn || entryTa || zoneStrong)) { // indicadores clássicos na MESMA janela do motor (sem lookahead)
      taCache.e20 = emaLast(cl, 20); taCache.e50 = emaLast(cl, 50);
      taCache.adx = adxDmi(win, 14)?.adx ?? null;
      taCache.vwap = dailyVwap(win);
    }
  };

  // Estado da simulação (uma posição por vez, como o robô por moeda).
  let pos: "long" | "short" | "flat" = "flat";
  let entryPx = 0, stopPx = 0, targetPx = 0, peak = 0, riskDist0 = 0, entryTime = 0, entryIdx = 0, counter = false;
  let partialDone = false, partialR = 0; // TP parcial: metade já embolsada no alvo (R líquido da perna)
  let lastStopIdx = -1; // barra do último STOP (cooldown de reentrada)
  const usedZones = new Set<string>(); // zone_once: zonas que já deram entrada (não re-entra)
  const trades: Trade[] = [];
  let eq = 1; let peakEq = 1, maxDD = 0; const equity: { t: number; eq: number }[] = [];
  let barsInMarket = 0, evalBars = 0;

  const openTrade = (side: "long" | "short", px: number, t: number, idx: number, stop: number, target: number | null) => {
    riskDist0 = Math.abs(px - stop) || (px * 0.01);
    entryPx = px; entryTime = t; entryIdx = idx; counter = false; pos = side;
    stopPx = stop; targetPx = target ?? 0; peak = px;
    partialDone = false; partialR = 0;
  };
  const closeTrade = (px: number, t: number, idx: number, reason: string) => {
    const dir = pos === "long" ? 1 : -1;
    const grossPx = (px - entryPx) * dir;
    const costPx = (entryPx + px) * costFrac;         // taxa+slippage nos dois lados
    let rNet = (grossPx - costPx) / riskDist0;
    let r = grossPx / riskDist0;
    if (partialDone) { rNet = 0.5 * partialR + 0.5 * rNet; r = 0.5 * partialR + 0.5 * r; reason = `${reason}+parcial`; } // metade saiu no alvo; blend do R
    trades.push({ side: pos as "long" | "short", entryTime, entryPx, exitTime: t, exitPx: px, stopPx, riskDist: riskDist0, reason, r, rNet, bars: idx - entryIdx, counter });
    if (reason === "stop") lastStopIdx = idx;
    eq *= (1 + (riskPct / 100) * rNet);
    peakEq = Math.max(peakEq, eq); maxDD = Math.max(maxDD, (peakEq - eq) / peakEq);
    equity.push({ t, eq: Math.round(eq * 10000) / 10000 });
    pos = "flat";
  };

  // Walk-forward sobre as velas de 15m dentro da janela.
  for (let t = 0; t < base.length; t++) {
    const barCloseMs = base[t].time * 1000 + barMs;
    if (barCloseMs <= windowStart) continue;                    // ainda no aquecimento
    if (base[t].time * 1000 >= now) break;

    // 1) Gestão da posição: checa ALVO (take-profit) e STOP contra o range da vela.
    if (pos !== "flat") {
      barsInMarket++;
      const hitTarget = targetPx > 0 && (pos === "long" ? base[t].high >= targetPx : base[t].low <= targetPx);
      const hitStop = pos === "long" ? base[t].low <= stopPx : base[t].high >= stopPx;
      if (hitStop) closeTrade(stopPx, barCloseMs / 1000, t, "stop");           // conservador: se stop e alvo no mesmo candle, stop primeiro
      else if (timeStopBars > 0 && t - entryIdx >= timeStopBars && (pos === "long" ? peak - entryPx : entryPx - peak) < riskDist0) {
        closeTrade(base[t].close, barCloseMs / 1000, t, "time-stop"); // nunca chegou a +1R de pico em N velas → dormente, sai
      }
      else if (hitTarget) {
        if (!tpPartial) closeTrade(targetPx, barCloseMs / 1000, t, "alvo");
        else {
          // TP PARCIAL: embolsa METADE no alvo (R líquido da perna); o resto corre no trailing,
          // com o stop travado no mínimo em breakeven (winner não vira perda). Parcial só 1×.
          const dir = pos === "long" ? 1 : -1;
          partialR = ((targetPx - entryPx) * dir - (entryPx + targetPx) * costFrac) / riskDist0;
          partialDone = true;
          targetPx = 0;
          stopPx = pos === "long" ? Math.max(stopPx, entryPx) : Math.min(stopPx, entryPx);
        }
      }
    }
    // 2) Trailing por ATR + piso de estrutura (atualiza para o PRÓXIMO ciclo).
    // (feito depois de reavaliar o motor, que também dá o ATR/estrutura atuais — ver abaixo)

    // Avança ponteiros de cada TF (só velas JÁ FECHADAS até o fim desta vela de 15m).
    let changed = false;
    for (const tf of tfList) {
      let i = ptr[tf];
      while (i + 1 < byTf[tf].length && closeMs[tf][i + 1] <= barCloseMs) i++;
      if (i !== ptr[tf]) { ptr[tf] = i; if (i >= 0) { recompute(tf, i); changed = true; } }
      else if (smcCache[tf] === undefined && i >= 0) { recompute(tf, i); changed = true; }
    }
    void changed;
    const smc15 = smcCache[baseTf];
    if (!smc15) continue;
    evalBars++;

    // SAÍDA POR ESTRUTURA (struct_exit): CHoCH CONTRA na base 15m, impresso após a entrada, fecha
    // a posição (segue o SMC também na saída). Roda com o smc recém-recalculado, antes do trailing/
    // decisão; se fechou, o bloco de decisão abaixo pode reentrar no próximo setup (ou virar, se rev).
    if (pos !== "flat" && structExit !== "off") {
      const against = pos === "long" ? "bearish" : "bullish";
      const ls = smc15.lastSwing;
      const swingChoch = !!ls && ls.type === "CHoCH" && ls.bias === against && ls.time > entryTime;
      const internalChoch = structExit === "internal" && smc15.internalBias === against;
      if (swingChoch || internalChoch) closeTrade(base[t].close, barCloseMs / 1000, t, "estrutura");
    }

    // Trailing (usa o ATR/estrutura do TF base). Só quando há posição.
    if (pos !== "flat" && trailMode === "candle") {
      // STOP NO ÚLTIMO CANDLE FECHADO (trail_tf): long = mínima da vela; short = máxima.
      // Ratchet puro (só avança), SEM piso de estrutura — mede a técnica crua do dono.
      peak = pos === "long" ? Math.max(peak, base[t].close) : Math.min(peak, base[t].close);
      const armed = trailArmR <= 0 || (pos === "long" ? peak - entryPx : entryPx - peak) >= trailArmR * riskDist0;
      const tc = ptr[trailTf] >= 0 ? byTf[trailTf][ptr[trailTf]] : null;
      if (armed && tc) stopPx = pos === "long" ? Math.max(stopPx, tc.low) : Math.min(stopPx, tc.high);
    } else if (pos !== "flat" && trailOn && trailMult > 0) {
      const atr = smc15.atr || entryPx * 0.01;
      // EXPERIMENTO trail_liq_mult (fase X, ideia do dono 08/jul: "alvo rolante" como sensor do
      // trailing): preço DENTRO da zona de reação de uma poça de liquidez A FAVOR (±0,5 ATR dela)
      // → o trailing aperta pra este multiplicador (protege o lucro onde a reação é provável);
      // atravessou a poça → volta a folga normal (o ratchet preserva o que apertou). 0 = off.
      let multEff = trailMult;
      if (trailLiqMult > 0) {
        const nearPool = smc15.liquidity.some((l) => (pos === "long" ? l.side === "buy" && l.price > entryPx : l.side === "sell" && l.price < entryPx) && Math.abs(base[t].close - l.price) <= 0.5 * atr);
        if (nearPool) multEff = Math.min(multEff, trailLiqMult);
      }
      const dist = multEff * atr, buf = 0.25 * atr;
      peak = pos === "long" ? Math.max(peak, base[t].close) : Math.min(peak, base[t].close);
      const armed = pos === "long" ? peak - entryPx >= dist : entryPx - peak >= dist;
      if (armed) {
        let ts = pos === "long" ? peak - dist : peak + dist;
        const sl = floorInternal ? smc15.internalLowLevel : smc15.swingLowLevel, sh = floorInternal ? smc15.internalHighLevel : smc15.swingHighLevel;
        if (pos === "long") { if (Number.isFinite(sl) && sl < peak && (!floorSmart || sl > entryPx)) ts = Math.min(ts, sl - buf); if (peak - entryPx >= atr) ts = Math.max(ts, entryPx); stopPx = Math.max(stopPx, ts); } // trava de breakeven (≥1×ATR) — igual bot-run
        else { if (Number.isFinite(sh) && sh > peak && (!floorSmart || sh < entryPx)) ts = Math.max(ts, sh + buf); if (entryPx - peak >= atr) ts = Math.min(ts, entryPx); stopPx = Math.min(stopPx, ts); }
      }
    }

    // 3) DECISÃO SMC PRICE-ACTION (15m) — stop e alvo ESTRUTURAIS; fluxo neutro (não backtestável).
    const plan = smcDecision(smc15, base[t].close, base[t].time, { imbalanceOn, imbMinPct, stopAtrMult: stopMult, fut: true, imbRetest, maxZoneAtr, oppZoneAtr, barSec, imbAlign, structFirst, dirMode, vp: vpCache, vpMode, fadeMode, obMode, zoneDiscipline, zoneBreakWin, zoneBreakInternal, minRr, extVeto, structEntry, structEntryWin, structEntryInternal });
    let want = plan.want;
    const px = base[t].close, tsec = barCloseMs / 1000;
    // FILTRO TA (experimento): setup não-imbalance só entra alinhado aos clássicos escolhidos.
    if (want && taOn && plan.setup && (taAll || !plan.setup.startsWith("imbalance"))) {
      if (ta.ema && taCache.e20 != null && taCache.e50 != null && (want === "long" ? taCache.e20 <= taCache.e50 : taCache.e20 >= taCache.e50)) want = null;
      if (want && ta.vwap && taCache.vwap != null && (want === "long" ? px <= taCache.vwap : px >= taCache.vwap)) want = null;
      if (want && ta.adx && taCache.adx != null && taCache.adx < 20) want = null; // lateral/chop → segura continuação
    }
    // DISCIPLINA DE ZONA "STRONG" (spec do dono): premium não compra / discount não vende, SALVO
    // rompimento com VOLUME (delta ≥1,5× média 20), FORÇA (ADX≥25) e estrutura quebrando junto.
    if (zoneStrong && want && plan.setup && !plan.setup.startsWith("fade")) {
      const inPremZ = px > smc15.equilibrium.top, inDiscZ = px < smc15.equilibrium.bottom;
      if ((want === "long" && inPremZ) || (want === "short" && inDiscZ)) {
        const bw = zoneBreakWin;
        const swingBreak = smc15.lastSwing && smc15.lastSwing.time >= base[t].time - barSec * bw ? smc15.lastSwing.bias : null;
        const brkUp = swingBreak === "bullish" || smc15.internalBias === "bullish";
        const brkDn = swingBreak === "bearish" || smc15.internalBias === "bearish";
        let avg = 0, cN = 0;
        for (let k = Math.max(0, t - 20); k < t; k++) { avg += Math.abs(base[k].delta ?? 0); cN++; }
        avg = cN ? avg / cN : 0;
        const dNow = base[t].delta ?? 0;
        const adxOk = (taCache.adx ?? 0) >= 25;
        const strongUp = brkUp && avg > 0 && dNow >= 1.5 * avg && adxOk;
        const strongDn = brkDn && avg > 0 && -dNow >= 1.5 * avg && adxOk;
        if (want === "long" && !strongUp) want = null;
        if (want === "short" && !strongDn) want = null;
      }
    }
    // FILTRO SQUEEZE MOMENTUM (LazyBear): momentum forte CONTRA a direcao segura a entrada.
    if (sqFilter && want && t >= 20) {
      const n = 20;
      const momAt = (j: number) => {
        const win = base.slice(j - n + 1, j + 1);
        const clw = win.map((c) => c.close);
        const smaV = clw.reduce((a, b) => a + b, 0) / n;
        const hh = Math.max(...win.map((c) => c.high));
        const ll = Math.min(...win.map((c) => c.low));
        const mid = ((hh + ll) / 2 + smaV) / 2;
        const srcArr = win.map((c) => c.close - mid);
        const xm = (n - 1) / 2;
        const ym = srcArr.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        srcArr.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; });
        return ym + (den ? num / den : 0) * (n - 1 - xm);
      };
      const mom = momAt(t);
      const atrV = smc15.atr || 0;
      if (atrV > 0 && Math.abs(mom) >= 0.5 * atrV && ((want === "long" && mom < 0) || (want === "short" && mom > 0))) {
        // sq_mode slope: contra mas encolhendo ha 2 velas = exaustao → NAO segura.
        const easing = sqMode === "slope" && t >= 22 &&
          (want === "long" ? momAt(t) > momAt(t - 1) && momAt(t - 1) > momAt(t - 2) : momAt(t) < momAt(t - 1) && momAt(t - 1) < momAt(t - 2));
        if (!easing) want = null;
      }
    }
    // FILTRO DELTA (experimento): a vela atual precisa ter volume comprador (long) / vendedor (short).
    if (want && deltaConfirm) {
      const d = base[t].delta ?? 0;
      if ((want === "long" && d <= 0) || (want === "short" && d >= 0)) want = null;
    }
    // FILTRO DE VOLATILIDADE (experimento vol_max_atr): vela de range esticado (> K×ATR) não entra.
    if (want && volMaxAtr > 0 && smc15.atr > 0 && (base[t].high - base[t].low) > volMaxAtr * smc15.atr) want = null;
    // FILTRO HTF (experimento): entrada precisa alinhar com a estrutura do htf_tf (swing; fallback interna).
    // Setup C (fade) é counter-trend POR DESENHO → isento da bússola.
    if (want && htfOn && !plan.setup.startsWith("fade")) {
      const h = smcCache[htfTf];
      const hb = h?.swingBias ?? h?.internalBias ?? null;
      if (hb !== (want === "long" ? "bullish" : "bearish")) want = null;
    }
    // FILTRO ZONA OPOSTA DO HTF (experimento opp_htf_atr): OB/FVG CONTRÁRIO não-preenchido do TF
    // maior a ≤ X ATR(HTF) à frente segura a entrada — o caso dos prints 07/jul (compra 15m colada
    // num OB 1H de venda; o 15m não enxerga a zona do 1H). Mesma geometria do opp_zone_atr.
    if (want && oppHtfAtr > 0) {
      const h = smcCache[htfTf];
      if (h) {
        const hAtr = h.atr || px * 0.01, hBuf = 0.25 * hAtr, ahead = oppHtfAtr * hAtr;
        const oppF = want === "long"
          ? h.fvgs.some((f) => f.bias === "bearish" && f.bottom > px - hBuf && f.bottom - px <= ahead)
          : h.fvgs.some((f) => f.bias === "bullish" && f.top < px + hBuf && px - f.top <= ahead);
        const oppO = want === "long"
          ? h.orderBlocks.some((b) => b.bias === "bearish" && b.bottom > px - hBuf && b.bottom - px <= ahead)
          : h.orderBlocks.some((b) => b.bias === "bullish" && b.top < px + hBuf && px - b.top <= ahead);
        if (oppF || oppO) want = null;
      }
    }

    // ENTRADA TA-LED (experimento entry_mode): pullback à EMA20 em tendência (EMA20×50) e do lado
    // certo do VWAP — a vela TOCA a EMA20 e fecha de volta a favor. Stop estrutural, alvo liquidez.
    let eStop = plan.stop, eTarget = plan.target, eSetup = plan.setup;
    if (entryTa && taCache.e20 != null && taCache.e50 != null && taCache.vwap != null) {
      let taWant: "long" | "short" | null = null;
      if (taCache.e20 > taCache.e50 && px > taCache.vwap && base[t].low <= taCache.e20 && px > taCache.e20) taWant = "long";
      else if (taCache.e20 < taCache.e50 && px < taCache.vwap && base[t].high >= taCache.e20 && px < taCache.e20) taWant = "short";
      if (taWant && (entryMode === "ta" || !want)) {
        const atr = smc15.atr || px * 0.01, buf = 0.25 * atr;
        let taStop: number, taTarget: number | null;
        if (taWant === "long") {
          taStop = Number.isFinite(smc15.swingLowLevel) && smc15.swingLowLevel < px ? smc15.swingLowLevel - buf : px - stopMult * atr;
          const la = smc15.liquidity.filter((l) => l.side === "buy" && l.price > px).sort((a, b) => a.price - b.price)[0];
          taTarget = la ? la.price : null;
        } else {
          taStop = Number.isFinite(smc15.swingHighLevel) && smc15.swingHighLevel > px ? smc15.swingHighLevel + buf : px + stopMult * atr;
          const lb = smc15.liquidity.filter((l) => l.side === "sell" && l.price < px).sort((a, b) => b.price - a.price)[0];
          taTarget = lb ? lb.price : null;
        }
        const risk = Math.abs(px - taStop);
        if (taTarget != null && risk > 0 && Math.abs(taTarget - px) < risk) taTarget = null;
        want = taWant; eStop = taStop; eTarget = taTarget; eSetup = `ta-pullback ${taWant === "long" ? "↑" : "↓"}`;
      } else if (entryMode === "ta") {
        want = null; // modo "ta" puro: setups SMC não entram
      }
    } else if (entryMode === "ta") {
      want = null;
    }

    // 4) Reversão / entrada (fill no fechamento; stop e alvo vêm do plano estrutural).
    const hourBlocked = blockHours.size > 0 && blockHours.has(new Date(barCloseMs).getUTCHours());
    // zone_once: se a entrada vem do plano SMC (não do TA-led) e a zona já foi usada, segura.
    const fromPlan = eSetup === plan.setup;
    const zoneBlocked = zoneOnce && fromPlan && plan.zoneKey != null && usedZones.has(plan.zoneKey);
    const markZone = () => { if (zoneOnce && fromPlan && plan.zoneKey != null) usedZones.add(plan.zoneKey); };
    if (pos !== "flat") {
      const canRev = revMode === "any" ? true : revMode === "imbalance" ? !!eSetup && eSetup.startsWith("imbalance") : false;
      const heldEnough = t - entryIdx >= minHold;
      if (want && want !== pos && eStop != null && canRev && heldEnough && !hourBlocked && !zoneBlocked) { closeTrade(px, tsec, t, "reversão"); openTrade(want, px, tsec, t, eStop, useTarget ? eTarget : null); markZone(); }
    } else if (want && eStop != null) {
      const cooling = cooldownBars > 0 && lastStopIdx >= 0 && t - lastStopIdx <= cooldownBars;
      if (!cooling && !hourBlocked && !zoneBlocked) { openTrade(want, px, tsec, t, eStop, useTarget ? eTarget : null); markZone(); }
    }
  }
  // Fecha posição aberta no fim (marcação a mercado).
  if (pos !== "flat") closeTrade(base[base.length - 1].close, base[base.length - 1].time, base.length - 1, "fim");

  // ════════ Métricas ════════
  const nTr = trades.length;
  const wins = trades.filter((t) => t.rNet > 0);
  const losses = trades.filter((t) => t.rNet <= 0);
  const sum = (a: Trade[]) => a.reduce((s, t) => s + t.rNet, 0);
  const grossWin = sum(wins), grossLoss = Math.abs(sum(losses));
  const expectancy = nTr ? sum(trades) / nTr : 0;
  const longs = trades.filter((t) => t.side === "long"), shorts = trades.filter((t) => t.side === "short");
  const metrics = {
    trades: nTr,
    win_rate: nTr ? Math.round((wins.length / nTr) * 1000) / 10 : 0,
    expectancy_r: Math.round(expectancy * 1000) / 1000,                 // R médio por trade (líquido)
    profit_factor: grossLoss > 0 ? Math.round((grossWin / grossLoss) * 100) / 100 : (grossWin > 0 ? 99 : 0),
    total_return_pct: Math.round((eq - 1) * 1000) / 10,                 // com risco composto por trade
    max_drawdown_pct: Math.round(maxDD * 1000) / 10,
    avg_win_r: wins.length ? Math.round((grossWin / wins.length) * 1000) / 1000 : 0,
    avg_loss_r: losses.length ? Math.round((sum(losses) / losses.length) * 1000) / 1000 : 0,
    avg_bars: nTr ? Math.round(trades.reduce((s, t) => s + t.bars, 0) / nTr) : 0,
    exposure_pct: evalBars ? Math.round((barsInMarket / evalBars) * 1000) / 10 : 0,
    longs: longs.length, longs_win: longs.length ? Math.round((longs.filter((t) => t.rNet > 0).length / longs.length) * 1000) / 10 : 0,
    shorts: shorts.length, shorts_win: shorts.length ? Math.round((shorts.filter((t) => t.rNet > 0).length / shorts.length) * 1000) / 10 : 0,
    stops: trades.filter((t) => t.reason === "stop").length,
    reversals: trades.filter((t) => t.reason === "reversão").length,
    struct_exits: trades.filter((t) => t.reason === "estrutura").length,
    targets: trades.filter((t) => t.reason === "alvo" || t.reason === "alvo+parcial").length,
    bars_evaluated: evalBars,
    // Estudo de sessão: desempenho por bloco de 3h UTC da ENTRADA (n, win%, soma de R líquido).
    by_hour3: Array.from({ length: 8 }, (_, b) => {
      const inB = trades.filter((t) => Math.floor(new Date(t.entryTime * 1000).getUTCHours() / 3) === b);
      const w = inB.filter((t) => t.rNet > 0).length;
      return { h: `${b * 3}-${b * 3 + 3}`, n: inB.length, win: inB.length ? Math.round((w / inB.length) * 100) : 0, sum_r: Math.round(inB.reduce((s, t) => s + t.rNet, 0) * 100) / 100 };
    }),
  };
  const taLabel = [ta.ema && "EMA20×50", ta.vwap && "VWAP", ta.adx && "ADX≥20"].filter(Boolean).join("+") || "off";
  const params = { asset, symbol, days, engine: `SMC price-action ${baseTf}`, base_tf: baseTf, imbalance: imbalanceOn ? "on" : "off", stop: "estrutural", target: !useTarget ? "off (sem take-profit)" : tpPartial ? "liquidez (parcial 50%)" : "liquidez", trailing: trailMode === "candle" ? `candle ${trailTf}${trailArmR > 0 ? ` (arma ${trailArmR}R)` : ""}` : trailOn ? `${trailMult}×ATR` : "off", trail_mode: trailMode, trail_tf: trailTf, trail_arm_r: trailArmR, trail_floor: floorMode, ta_scope: taAll ? "all" : "structural", entry_mode: entryMode, risk_pct: riskPct, fee_pct: feePct, slip_pct: slipPct, flow: "neutro (não backtestável)", ta_filter: taLabel, rev_mode: revMode, min_hold_bars: minHold, cooldown_bars: cooldownBars, imb_min_pct: imbMinPct, imb_mode: imbRetest ? "retest" : "chase", imb_align: imbAlign ? "on" : "off", setup_priority: structFirst ? "structure" : "imbalance", zone_once: zoneOnce ? "on" : "off", dir_mode: dirMode, vp_mode: vpMode, fade_mode: fadeMode, ob_mode: obMode, delta_confirm: deltaConfirm ? "on" : "off", sq_filter: sqFilter ? (sqMode === "slope" ? "on(slope)" : "on") : "off", min_rr: minRr, opp_htf_atr: oppHtfAtr, ext_veto: extVeto ? "on" : "off", time_stop_bars: timeStopBars, vol_max_atr: volMaxAtr, struct_entry: structEntry === "off" ? "off" : `${structEntry}(win ${structEntryWin}${structEntryInternal ? "+interna" : ""})`, struct_exit: structExit, trail_liq_mult: trailLiqMult, zone_discipline: zoneStrong ? "strong(volume+ADX+quebra)" : zoneDiscipline ? `on(win ${zoneBreakWin}${zoneBreakInternal ? "+interna" : ""})` : "off", htf_filter: htfOn ? htfTf : "off", block_hours: blockHours.size ? [...blockHours].sort((a, b) => a - b).join(",") : "off" };
  // Downsample da curva de equity (máx ~200 pontos) + amostra dos últimos trades.
  const step = Math.max(1, Math.ceil(equity.length / 200));
  const equityDs = equity.filter((_, i) => i % step === 0 || i === equity.length - 1);
  const tradeSample = trades.slice(-60).map((t) => ({ side: t.side, at: t.exitTime, r: Math.round(t.rNet * 100) / 100, reason: t.reason, counter: t.counter, bars: t.bars }));

  await admin.from("bot_backtests").upsert({ asset, params, metrics, trades: tradeSample, equity: equityDs, created_at: new Date().toISOString() }, { onConflict: "asset" });
  return json(200, { asset, params, metrics });
});
