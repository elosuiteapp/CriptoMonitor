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
interface Candle { time: number; open: number; high: number; low: number; close: number }
interface StructureBreak { time: number; price: number; type: "BOS" | "CHoCH"; bias: Bias; internal: boolean }
interface OrderBlock { top: number; bottom: number; mid: number; time: number; bias: Bias; internal: boolean }
interface FVG { top: number; bottom: number; mid: number; time: number; bias: Bias }
interface LiquidityPool { price: number; side: "buy" | "sell"; count: number; time: number; swept: boolean; sweptRecently: boolean }
interface Zone { top: number; bottom: number }
interface SmcResult { price: number; atr: number; swingBias: Bias | null; internalBias: Bias | null; lastSwing: StructureBreak | null; orderBlocks: OrderBlock[]; fvgs: FVG[]; liquidity: LiquidityPool[]; trailingTop: number; trailingBottom: number; swingLowLevel: number; swingHighLevel: number; premium: Zone; equilibrium: Zone; discount: Zone }

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
    orderBlocks, fvgs, liquidity, trailingTop, trailingBottom, swingLowLevel: swingLow.level, swingHighLevel: swingHigh.level, premium, equilibrium, discount,
  };
}
function structuralBias(smc: SmcResult | null, momTf: number): number {
  if (!smc) return 0;
  let n = 0, d = 0; const add = (score: number, w: number) => { n += score * w; d += w; };
  add(smc.swingBias === "bullish" ? 78 : smc.swingBias === "bearish" ? -78 : 0, 0.40);
  if (smc.lastSwing) add((smc.lastSwing.bias === "bullish" ? 1 : -1) * (smc.lastSwing.type === "CHoCH" ? 80 : 55), 0.20);
  let z = 0;
  if (smc.price <= smc.discount.top) z = smc.internalBias === "bullish" ? 72 : 0;
  else if (smc.price >= smc.premium.bottom) z = smc.internalBias === "bearish" ? -72 : 0;
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
interface SmcPlan { want: "long" | "short" | null; setup: string; stop: number | null; target: number | null; note: string }
function smcDecision(smc: SmcResult, lastPx: number, lastT: number, o: { imbalanceOn: boolean; imbMinPct: number; stopAtrMult: number; fut: boolean }): SmcPlan {
  const price = lastPx > 0 ? lastPx : smc.price;
  const atr = smc.atr || price * 0.01, buf = 0.25 * atr;
  const bull = smc.lastSwing?.bias === "bullish" || smc.internalBias === "bullish" || smc.swingBias === "bullish";
  const bear = smc.lastSwing?.bias === "bearish" || smc.internalBias === "bearish" || smc.swingBias === "bearish";
  const inDisc = price <= smc.discount.top, inPrem = price >= smc.premium.bottom;
  const sweptSell = smc.liquidity.some((l) => l.side === "sell" && l.sweptRecently);
  const sweptBuy = smc.liquidity.some((l) => l.side === "buy" && l.sweptRecently);
  const bullOB = smc.orderBlocks.filter((b) => b.bias === "bullish" && price >= b.bottom && price <= b.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearOB = smc.orderBlocks.filter((b) => b.bias === "bearish" && price <= b.top && price >= b.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  const bullFvg = smc.fvgs.filter((f) => f.bias === "bullish" && price >= f.bottom && price <= f.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearFvg = smc.fvgs.filter((f) => f.bias === "bearish" && price <= f.top && price >= f.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  const fresh = smc.fvgs.filter((f) => f.time >= lastT - 900 * 2 && Math.abs(f.top - f.bottom) / price * 100 >= o.imbMinPct);
  const freshBull = fresh.filter((f) => f.bias === "bullish").sort((a, b) => b.time - a.time)[0];
  const freshBear = fresh.filter((f) => f.bias === "bearish").sort((a, b) => b.time - a.time)[0];
  let want: "long" | "short" | null = null, setup = "", zone: { bottom: number; top: number } | null = null;
  if (o.imbalanceOn && freshBull && (!freshBear || freshBull.time >= freshBear.time)) { want = "long"; setup = "imbalance ↑"; zone = freshBull; }
  else if (o.imbalanceOn && freshBear && (!freshBull || freshBear.time >= freshBull.time)) { want = "short"; setup = "imbalance ↓"; zone = freshBear; }
  else if (bull && (bullOB || bullFvg) && (sweptSell || inDisc)) { want = "long"; setup = "OB/FVG + estrutura ↑"; zone = bullOB ?? bullFvg; }
  else if (bear && (bearOB || bearFvg) && (sweptBuy || inPrem)) { want = "short"; setup = "OB/FVG + estrutura ↓"; zone = bearOB ?? bearFvg; }
  if (!want) return { want: null, setup: "", stop: null, target: null, note: "sem setup" };
  if (want === "short" && !o.fut) return { want: null, setup: "", stop: null, target: null, note: "spot" };
  let stop: number;
  if (want === "long") {
    stop = (zone ? zone.bottom : (Number.isFinite(smc.swingLowLevel) ? smc.swingLowLevel : price - o.stopAtrMult * atr)) - buf;
    if (Number.isFinite(smc.swingLowLevel) && smc.swingLowLevel < price) stop = Math.min(stop, smc.swingLowLevel - buf);
    if (stop >= price) stop = price - o.stopAtrMult * atr;
  } else {
    stop = (zone ? zone.top : (Number.isFinite(smc.swingHighLevel) ? smc.swingHighLevel : price + o.stopAtrMult * atr)) + buf;
    if (Number.isFinite(smc.swingHighLevel) && smc.swingHighLevel > price) stop = Math.max(stop, smc.swingHighLevel + buf);
    if (stop <= price) stop = price + o.stopAtrMult * atr;
  }
  let target: number | null;
  if (want === "long") { const la = smc.liquidity.filter((l) => l.side === "buy" && l.price > price).sort((a, b) => a.price - b.price)[0]; target = la ? la.price : (price < smc.premium.bottom ? smc.premium.bottom : null); }
  else { const lb = smc.liquidity.filter((l) => l.side === "sell" && l.price < price).sort((a, b) => b.price - a.price)[0]; target = lb ? lb.price : (price > smc.discount.top ? smc.discount.top : null); }
  const risk = Math.abs(price - stop);
  if (target != null && risk > 0 && Math.abs(target - price) < risk) target = null;
  return { want, setup, stop, target, note: setup };
}

// ════════ Klines históricos REAIS — endpoint PÚBLICO de dados da Binance (geo-aberto). ════════
// data-api.binance.vision = mercado spot, feito p/ histórico (sem auth/geo-block). Estruturalmente
// idêntico ao perp p/ as majors (o backtest é de ESTRUTURA de preço), evitando bloqueio de futuros.
const DATA = "https://data-api.binance.vision";
const TF_MS: Record<string, number> = { "15m": 900000, "30m": 1800000, "1H": 3600000, "4H": 14400000, "1D": 86400000 };
const TF_INT: Record<string, string> = { "15m": "15m", "30m": "30m", "1H": "1h", "4H": "4h", "1D": "1d" };
const TFS = ["15m"]; // day-trade: só o 15m (motor SMC price-action, igual ao bot-run)

async function fetchKlines(symbol: string, tf: string, startMs: number, endMs: number): Promise<Candle[]> {
  const out: Candle[] = []; let cursor = startMs; const int = TF_INT[tf];
  for (let guard = 0; guard < 60 && cursor < endMs; guard++) {
    const url = `${DATA}/api/v3/klines?symbol=${symbol}&interval=${int}&startTime=${cursor}&endTime=${endMs}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) break;
    const rows = await r.json().catch(() => []) as (string | number)[][];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const x of rows) out.push({ time: Math.floor(Number(x[0]) / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4] });
    const last = Number(rows[rows.length - 1][0]);
    if (rows.length < 1000) break;
    cursor = last + TF_MS[tf];
  }
  return out;
}

interface Trade { side: "long" | "short"; entryTime: number; entryPx: number; exitTime: number; exitPx: number; stopPx: number; riskDist: number; reason: string; r: number; rNet: number; bars: number; counter: boolean }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Admin-only (mesmo padrão do bot-run).
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const u = userData?.user;
  if (!u) return json(401, { error: "nao autorizado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "somente admin" });

  const body = await req.json().catch(() => ({}));
  const asset = String(body.asset ?? "BTC").toUpperCase();
  const days = Math.max(3, Math.min(60, Number(body.days ?? 30)));
  const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return json(500, { error: "sem config" });

  // Parâmetros (do config atual) — o backtest reflete os ajustes reais do robô.
  const stopMult = Number(cfg.stop_atr_mult ?? 3); // fallback do stop quando não há nível estrutural
  const trailOn = !!cfg.trail_on, trailMult = Number(cfg.trail_atr_mult ?? 3);
  const imbalanceOn = cfg.imbalance_on !== false, imbMinPct = Number(cfg.imbalance_min_pct ?? 0);
  const riskPct = Number(cfg.risk_pct ?? 1);
  const feePct = Number(body.fee_pct ?? 0.04), slipPct = Number(body.slip_pct ?? 0.02); // taxa taker + slippage por lado (%)
  const costFrac = (feePct + slipPct) / 100;

  const quote = String(cfg.quote_ccy ?? "USDT");
  const symbol = `${asset}${quote}`;
  const now = Date.now();
  const windowStart = now - days * 86400000;
  const WARM = 320; // candles de aquecimento por TF (atr200 + estrutura)

  // Busca candles reais de cada TF (janela + aquecimento).
  const byTf: Record<string, Candle[]> = {};
  for (const tf of TFS) {
    byTf[tf] = await fetchKlines(symbol, tf, windowStart - WARM * TF_MS[tf], now);
  }
  const base = byTf["15m"];
  if (!base || base.length < WARM + 20) return json(400, { error: `poucos candles p/ ${symbol} (${base?.length ?? 0})` });

  // closeTime[tf][i] = fim da vela i (openTime + duração). Ponteiros avançam sem lookahead.
  const closeMs: Record<string, number[]> = {};
  for (const tf of TFS) closeMs[tf] = byTf[tf].map((c) => c.time * 1000 + TF_MS[tf]);
  const ptr: Record<string, number> = { "15m": -1, "30m": -1, "1H": -1, "4H": -1, "1D": -1 };
  const smcCache: Record<string, SmcResult | null> = {};
  const momCache: Record<string, number> = {};

  const LOOKBACK = 300; // casa com o bot-run (klines limit:300 por TF)
  const recompute = (tf: string, closedIdx: number) => {
    const arr = byTf[tf];
    const lo = Math.max(0, closedIdx - LOOKBACK + 1);
    const win = arr.slice(lo, closedIdx + 1);
    smcCache[tf] = computeSmc(win, SWING);
    const cl = win.map((c) => c.close);
    momCache[tf] = cl.length >= 4 ? (cl[cl.length - 1] - cl[cl.length - 4]) / cl[cl.length - 4] : 0;
  };

  // Estado da simulação (uma posição por vez, como o robô por moeda).
  let pos: "long" | "short" | "flat" = "flat";
  let entryPx = 0, stopPx = 0, targetPx = 0, peak = 0, riskDist0 = 0, entryTime = 0, entryIdx = 0, counter = false;
  const trades: Trade[] = [];
  let eq = 1; let peakEq = 1, maxDD = 0; const equity: { t: number; eq: number }[] = [];
  let barsInMarket = 0, evalBars = 0;

  const openTrade = (side: "long" | "short", px: number, t: number, idx: number, stop: number, target: number | null) => {
    riskDist0 = Math.abs(px - stop) || (px * 0.01);
    entryPx = px; entryTime = t; entryIdx = idx; counter = false; pos = side;
    stopPx = stop; targetPx = target ?? 0; peak = px;
  };
  const closeTrade = (px: number, t: number, idx: number, reason: string) => {
    const dir = pos === "long" ? 1 : -1;
    const grossPx = (px - entryPx) * dir;
    const costPx = (entryPx + px) * costFrac;         // taxa+slippage nos dois lados
    const rNet = (grossPx - costPx) / riskDist0;
    const r = grossPx / riskDist0;
    trades.push({ side: pos as "long" | "short", entryTime, entryPx, exitTime: t, exitPx: px, stopPx, riskDist: riskDist0, reason, r, rNet, bars: idx - entryIdx, counter });
    eq *= (1 + (riskPct / 100) * rNet);
    peakEq = Math.max(peakEq, eq); maxDD = Math.max(maxDD, (peakEq - eq) / peakEq);
    equity.push({ t, eq: Math.round(eq * 10000) / 10000 });
    pos = "flat";
  };

  // Walk-forward sobre as velas de 15m dentro da janela.
  for (let t = 0; t < base.length; t++) {
    const barCloseMs = base[t].time * 1000 + TF_MS["15m"];
    if (barCloseMs <= windowStart) continue;                    // ainda no aquecimento
    if (base[t].time * 1000 >= now) break;

    // 1) Gestão da posição: checa ALVO (take-profit) e STOP contra o range da vela.
    if (pos !== "flat") {
      barsInMarket++;
      const hitTarget = targetPx > 0 && (pos === "long" ? base[t].high >= targetPx : base[t].low <= targetPx);
      const hitStop = pos === "long" ? base[t].low <= stopPx : base[t].high >= stopPx;
      if (hitStop) closeTrade(stopPx, barCloseMs / 1000, t, "stop");           // conservador: se stop e alvo no mesmo candle, stop primeiro
      else if (hitTarget) closeTrade(targetPx, barCloseMs / 1000, t, "alvo");
    }
    // 2) Trailing por ATR + piso de estrutura (atualiza para o PRÓXIMO ciclo).
    // (feito depois de reavaliar o motor, que também dá o ATR/estrutura atuais — ver abaixo)

    // Avança ponteiros de cada TF (só velas JÁ FECHADAS até o fim desta vela de 15m).
    let changed = false;
    for (const tf of TFS) {
      let i = ptr[tf];
      while (i + 1 < byTf[tf].length && closeMs[tf][i + 1] <= barCloseMs) i++;
      if (i !== ptr[tf]) { ptr[tf] = i; if (i >= 0) { recompute(tf, i); changed = true; } }
      else if (smcCache[tf] === undefined && i >= 0) { recompute(tf, i); changed = true; }
    }
    void changed;
    const smc15 = smcCache["15m"];
    if (!smc15) continue;
    evalBars++;

    // Trailing (usa o ATR/estrutura de 15m atuais). Só quando há posição.
    if (pos !== "flat" && trailOn && trailMult > 0) {
      const atr = smc15.atr || entryPx * 0.01;
      const dist = trailMult * atr, buf = 0.25 * atr;
      peak = pos === "long" ? Math.max(peak, base[t].close) : Math.min(peak, base[t].close);
      const armed = pos === "long" ? peak - entryPx >= dist : entryPx - peak >= dist;
      if (armed) {
        let ts = pos === "long" ? peak - dist : peak + dist;
        const sl = smc15.swingLowLevel, sh = smc15.swingHighLevel;
        if (pos === "long") { if (Number.isFinite(sl) && sl < peak) ts = Math.min(ts, sl - buf); stopPx = Math.max(stopPx, ts); }
        else { if (Number.isFinite(sh) && sh > peak) ts = Math.max(ts, sh + buf); stopPx = Math.min(stopPx, ts); }
      }
    }

    // 3) DECISÃO SMC PRICE-ACTION (15m) — stop e alvo ESTRUTURAIS; fluxo neutro (não backtestável).
    const plan = smcDecision(smc15, base[t].close, base[t].time, { imbalanceOn, imbMinPct, stopAtrMult: stopMult, fut: true });
    const want = plan.want;
    const px = base[t].close, tsec = barCloseMs / 1000;

    // 4) Reversão / entrada (fill no fechamento; stop e alvo vêm do plano estrutural).
    if (pos !== "flat") {
      if (want && want !== pos && plan.stop != null) { closeTrade(px, tsec, t, "reversão"); openTrade(want, px, tsec, t, plan.stop, plan.target); }
    } else if (want && plan.stop != null) {
      openTrade(want, px, tsec, t, plan.stop, plan.target);
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
    bars_evaluated: evalBars,
  };
  const params = { asset, symbol, days, engine: "SMC price-action 15m", imbalance: imbalanceOn ? "on" : "off", stop: "estrutural", target: "liquidez", trailing: trailOn ? `${trailMult}×ATR` : "off", risk_pct: riskPct, fee_pct: feePct, slip_pct: slipPct, flow: "neutro (não backtestável)" };
  // Downsample da curva de equity (máx ~200 pontos) + amostra dos últimos trades.
  const step = Math.max(1, Math.ceil(equity.length / 200));
  const equityDs = equity.filter((_, i) => i % step === 0 || i === equity.length - 1);
  const tradeSample = trades.slice(-60).map((t) => ({ side: t.side, at: t.exitTime, r: Math.round(t.rNet * 100) / 100, reason: t.reason, counter: t.counter, bars: t.bars }));

  await admin.from("bot_backtests").upsert({ asset, params, metrics, trades: tradeSample, equity: equityDs, created_at: new Date().toISOString() }, { onConflict: "asset" });
  return json(200, { asset, params, metrics });
});
