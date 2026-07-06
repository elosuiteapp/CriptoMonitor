// Edge Function: bot-run (v17 — MOTOR DE CONFLUÊNCIA) — robô FUTUROS Binance testnet (demo).
// Redesenho do dono (03/jul): "confluência de tudo — deu maioria, o robô executa".
// PIPELINE: (1) o SMC 15m ARMA o setup (FVG/imbalance ou OB+estrutura) e dá zona, STOP e ALVO
// estruturais, com 2 regras de QUALIDADE: entrada só perto da zona de origem (max_zone_atr,
// mata o chase esticado) e nunca contra FVG/OB oposto fresco colado à frente (opp_zone_atr).
// (2) 4 GRUPOS VOTAM na direção do setup: Estrutura (bias SMC 15m) · Fluxo (placar LIMPO:
// book inst+varejo, liquidações, gamma, divergência CVD) · Técnico (EMA20×50 + VWAP) ·
// Sentimento (Fear&Greed, Long/Short). (3) MAIORIA DECIDE (cfg.conf_min, default 3-de-4) —
// vale p/ TODA entrada, imbalance incluído (fim do passe livre). Setup segurado fica logado
// com o placar (gate) → o aprendizado mede o que teria acontecido.
// FORA DO PLACAR (só medidos p/ aprendizado): absorção 47%, paredes 49%, pressão do book 48%,
// CVD agregado 50%, funding 41% (invertido), ADX — hit-rates n≥600 do bot_learning em 03/jul.
// Saídas (stop estrutural, alvo liquidez, trailing 4×ATR, rev_mode) e risco: INTOCADOS (validados).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SWING = 20;
const TFS = ["15m"]; // DAY-TRADE: só o 15m (os TFs maiores saíam abaixo de cara-ou-coroa no aprendizado)

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ════════ Binance USDⓈ-M Futures DEMO (long+short; OKX bloqueia derivativos p/ BR) ════════
// Demo Trading da Binance (demo.binance.com) — base de futuros = demo-fapi.binance.com.
// (Carteira de Futuros do demo é separada do Spot; abastecida via Reset na aba Futures.)
const BNB_BASE = "https://demo-fapi.binance.com";
const BNB_INTERVAL: Record<string, string> = { "15m": "15m", "30m": "30m", "1H": "1h", "4H": "4h", "1D": "1d" };
interface BnbCreds { key: string; secret: string }
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// deno-lint-ignore no-explicit-any
async function bnb(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number | boolean>, c: BnbCreds, signed: boolean): Promise<{ status: number; body: any }> {
  let qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  if (signed) { qs += (qs ? "&" : "") + "recvWindow=5000&timestamp=" + Date.now(); qs += "&signature=" + await hmacHex(c.secret, qs); }
  const r = await fetch(BNB_BASE + path + (qs ? "?" + qs : ""), { method, headers: { "X-MBX-APIKEY": c.key } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
// Ordem com RECONCILIAÇÃO de -1007 ("Timeout… execution status unknown", visto 02/jul no demo):
// envia com newClientOrderId; no timeout, consulta a ordem pelo clientId antes de tratar como
// falha — a ordem PODE ter executado no backend (evita posição órfã / dupla entrada no retry).
// deno-lint-ignore no-explicit-any
async function bnbOrder(params: Record<string, string | number | boolean>, c: BnbCreds): Promise<{ status: number; body: any }> {
  const cid = `ov${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  let r = await bnb("POST", "/fapi/v1/order", { ...params, newClientOrderId: cid }, c, true);
  if (r.body?.code === -1007) {
    await new Promise((res) => setTimeout(res, 2500));
    const q = await bnb("GET", "/fapi/v1/order", { symbol: String(params.symbol), origClientOrderId: cid }, c, true);
    if (q.body?.orderId) r = { status: q.status, body: q.body }; // executou apesar do timeout → segue como sucesso
  }
  return r;
}

// ════════ Motor Smart Money (SMC) — portado de web/src/lib/smc.ts ════════
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
  // Fair value gaps (3 velas) NÃO preenchidos = imbalance deixado pelo impulso (zona que o preço respeita).
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

// ════════ Bias estrutural de UM timeframe (estrutura + momentum daquele TF) ════════
function structuralBias(smc: SmcResult | null, momTf: number): number {
  if (!smc) return 0;
  let n = 0, d = 0; const add = (score: number, w: number) => { n += score * w; d += w; };
  add(smc.swingBias === "bullish" ? 78 : smc.swingBias === "bearish" ? -78 : 0, 0.40);
  if (smc.lastSwing) add((smc.lastSwing.bias === "bullish" ? 1 : -1) * (smc.lastSwing.type === "CHoCH" ? 80 : 55), 0.20);
  // Zona só vira viés se ESTIVER SENDO RESPEITADA: discount = compra apenas com a estrutura interna
  // virando pra cima (CHoCH a favor); premium = venda apenas com a interna pra baixo. Senão, neutra.
  // (estar barato não garante que o discount segura — pode romper pra baixo; idem premium.)
  let z = 0;
  // Classificação pela BANDA DE EQUILÍBRIO (motor novo, fix da auditoria 7925e48) — as bordas 95/5
  // antigas faziam discount/premium quase nunca serem verdade (só nos 5% extremos do range).
  if (smc.price < smc.equilibrium.bottom) z = smc.internalBias === "bullish" ? 72 : 0;
  else if (smc.price > smc.equilibrium.top) z = smc.internalBias === "bearish" ? -72 : 0;
  add(z, 0.18);
  const atr = smc.atr || smc.price * 0.01;
  const dem = smc.orderBlocks.filter((o) => o.bias === "bullish" && o.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
  const sup = smc.orderBlocks.filter((o) => o.bias === "bearish" && o.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
  const dDist = dem ? (smc.price - dem.mid) / atr : 99, sDist = sup ? (sup.mid - smc.price) / atr : 99;
  add(dDist < 1.5 && dDist <= sDist ? 55 : sDist < 1.5 && sDist < dDist ? -55 : 0, 0.10);
  // FVG/imbalance: zona não preenchida perto do preço vira demanda (abaixo) / oferta (acima).
  // Quanto mais colado/dentro da zona (respeitando), mais forte — igual o gráfico do módulo.
  const fDem = smc.fvgs.filter((f) => f.bias === "bullish" && f.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
  const fSup = smc.fvgs.filter((f) => f.bias === "bearish" && f.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
  const fdDist = fDem ? (smc.price - fDem.mid) / atr : 99, fsDist = fSup ? (fSup.mid - smc.price) / atr : 99;
  const fvgScore = fdDist < 1.5 && fdDist <= fsDist ? 45 + 40 * Math.max(0, 1 - fdDist / 1.5)
    : fsDist < 1.5 && fsDist < fdDist ? -(45 + 40 * Math.max(0, 1 - fsDist / 1.5)) : 0;
  add(fvgScore, 0.18); // imbalance é o nível mais respeitado em todas as moedas (dono validou nos 4 prints) → mais voz que OB/zona
  add(clamp((momTf / 0.006) * 60), 0.12);
  return d ? Math.round(clamp(n / d)) : 0;
}

// ════════ Indicadores CLÁSSICOS (VWAP diário, ADX/DMI, EMA 20×50) — só MEDIDOS ════════
// Fora do gatilho e do flowTilt/veto (igual funding/F&G): entram no aprendizado por moeda e,
// se algum provar >55% com amostra, aí sim vira gate/veto. Mesma matemática plotada no gráfico.
function emaLast(vals: number[], len: number): number | null {
  if (vals.length < len) return null;
  const k = 2 / (len + 1);
  let e = vals.slice(0, len).reduce((s, v) => s + v, 0) / len; // seed = SMA dos primeiros len
  for (let i = len; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
// ADX/DMI (Wilder): ADX = força da tendência (sem direção); DI+ × DI− = quem manda.
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
// VWAP DIÁRIO (âncora do dia UTC): preço médio ponderado por volume desde 00:00 UTC.
function dailyVwap(cs: Candle[]): number | null {
  if (!cs.length) return null;
  const dayStart = Math.floor(cs[cs.length - 1].time / 86400) * 86400;
  let pv = 0, vv = 0;
  for (const c of cs) { const v = c.volume ?? 0; if (c.time >= dayStart && v > 0) { pv += ((c.high + c.low + c.close) / 3) * v; vv += v; } }
  return vv > 0 ? pv / vv : null;
}

// ════════ DECISÃO SMC PRICE-ACTION (15m) — o robô OPERA A ESTRUTURA ════════
// Entra em zona de origem (Order Block / FVG) e o STOP + o ALVO vêm da própria estrutura:
//  • Setup A (imbalance): FVG novo → entra a favor (independe de outros indicadores).
//  • Setup B (smart money): preço volta a um OB/FVG a favor de um BOS/CHoCH recente, após varrer
//    liquidez (stop-hunt) ou em discount/premium.
//  • STOP = abaixo do OB/mínima varrida (long) / acima (short) — a invalidação real.
//  • ALVO = próxima poça de LIQUIDEZ (EQH/EQL) / zona oposta — R:R vindo do gráfico.
// Usa só: Order Blocks, Imbalance(FVG), Liquidez/EQH-EQL, Zonas, BOS/CHoCH. (VP/liq-heatmap/HTF fora.)
interface SmcPlan { want: "long" | "short" | null; setup: string; stop: number | null; target: number | null; note: string; zoneKey?: string | null }
function smcDecision(smc: SmcResult, lastPx: number, lastT: number, o: { imbalanceOn: boolean; imbMinPct: number; stopAtrMult: number; fut: boolean; maxZoneAtr?: number; oppZoneAtr?: number; imbRetest?: boolean; imbAlign?: boolean; structFirst?: boolean; dirMode?: string; zoneDiscipline?: boolean }): SmcPlan {
  const price = lastPx > 0 ? lastPx : smc.price;
  const atr = smc.atr || price * 0.01, buf = 0.25 * atr;
  // DIREÇÃO (cfg.dir_mode, sql/106 — caso SOL 06/jul: short no topo com a interna JÁ bullish):
  // "any" (antigo) = OU das 3 leituras (deixava estrutura VELHA vencer a recente); "majority"
  // (default) = 2 de 3 concordando; "internal" = a estrutura INTERNA manda (fallback maioria).
  const reads = [smc.lastSwing?.bias ?? null, smc.internalBias, smc.swingBias];
  const nBull = reads.filter((r) => r === "bullish").length, nBear = reads.filter((r) => r === "bearish").length;
  const dm = o.dirMode ?? "majority";
  const bull = dm === "majority" ? nBull >= 2 : dm === "internal" ? (smc.internalBias ? smc.internalBias === "bullish" : nBull >= 2) : nBull > 0;
  const bear = dm === "majority" ? nBear >= 2 : dm === "internal" ? (smc.internalBias ? smc.internalBias === "bearish" : nBear >= 2) : nBear > 0;
  // Zona pela BANDA DE EQUILÍBRIO (motor novo 7925e48): discount = abaixo da banda, premium = acima
  // (igual ao módulo Smart Money pós-auditoria; as bordas 95/5 sufocavam o setup B).
  const inDisc = price < smc.equilibrium.bottom, inPrem = price > smc.equilibrium.top;
  const sweptSell = smc.liquidity.some((l) => l.side === "sell" && l.sweptRecently); // stop-hunt de baixa → a favor de long
  const sweptBuy = smc.liquidity.some((l) => l.side === "buy" && l.sweptRecently);
  const bullOB = smc.orderBlocks.filter((b) => b.bias === "bullish" && price >= b.bottom && price <= b.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearOB = smc.orderBlocks.filter((b) => b.bias === "bearish" && price <= b.top && price >= b.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  const bullFvg = smc.fvgs.filter((f) => f.bias === "bullish" && price >= f.bottom && price <= f.top + buf).sort((a, b) => b.mid - a.mid)[0];
  const bearFvg = smc.fvgs.filter((f) => f.bias === "bearish" && price <= f.top && price >= f.bottom - buf).sort((a, b) => a.mid - b.mid)[0];
  // QUALIDADE 1 (max_zone_atr): entrada imbalance só com o preço a ≤ X ATR da borda do FVG —
  // mata o "chase esticado" (comprar longe da zona de origem depois do impulso). 0 = off.
  const nearZone = (f: FVG) => !o.maxZoneAtr || o.maxZoneAtr <= 0 ? true
    : (f.bias === "bullish" ? (price - f.top) / atr <= o.maxZoneAtr : (f.bottom - price) / atr <= o.maxZoneAtr);
  // MODO RETEST (igual ao módulo Smart Money, playbook 06/jul): FVG é ZONA respeitada — só entra
  // quando o preço VOLTA pra dentro dela (janela de frescor 16 velas ≈ 4h). Modo chase (antigo):
  // entrava na FORMAÇÃO do gap (2 velas), comprando o esticado do impulso.
  const freshWin = o.imbRetest ? 16 : 2;
  const inZone = (f: FVG) => price >= f.bottom - buf && price <= f.top + buf;
  const fresh = smc.fvgs.filter((f) => f.time >= lastT - 900 * freshWin && Math.abs(f.top - f.bottom) / price * 100 >= o.imbMinPct && (!o.imbRetest || inZone(f)) && nearZone(f));
  const freshBull = fresh.filter((f) => f.bias === "bullish").sort((a, b) => b.time - a.time)[0];
  const freshBear = fresh.filter((f) => f.bias === "bearish").sort((a, b) => b.time - a.time)[0];

  // PLAYBOOK 06/jul: imbalance só A FAVOR da estrutura (imb_align — os 16 trades contra-estrutura
  // da semana fizeram 31% de acerto e TODAS as 8 stopadas cheias); com setup_priority 'structure',
  // o reteste de OB/FVG pós-BOS/CHoCH (o setup do print do dono) tem prioridade sobre o imbalance.
  const imbLongOk = o.imbalanceOn && !!freshBull && (!freshBear || freshBull.time >= freshBear.time) && (!o.imbAlign || bull);
  const imbShortOk = o.imbalanceOn && !!freshBear && (!freshBull || freshBear.time >= freshBull.time) && (!o.imbAlign || bear);
  const structLongOk = bull && !!(bullOB || bullFvg) && (sweptSell || inDisc);
  const structShortOk = bear && !!(bearOB || bearFvg) && (sweptBuy || inPrem);
  let want: "long" | "short" | null = null, setup = "", zone: { bottom: number; top: number; time?: number } | null = null;
  const pick = (w: "long" | "short", s: string, z: { bottom: number; top: number; time?: number } | null) => { want = w; setup = s; zone = z; };
  if (o.structFirst) {
    if (structLongOk) pick("long", "OB/FVG + estrutura ↑", bullOB ?? bullFvg);
    else if (structShortOk) pick("short", "OB/FVG + estrutura ↓", bearOB ?? bearFvg);
    else if (imbLongOk) pick("long", "imbalance ↑", freshBull);
    else if (imbShortOk) pick("short", "imbalance ↓", freshBear);
  } else {
    if (imbLongOk) pick("long", "imbalance ↑", freshBull);
    else if (imbShortOk) pick("short", "imbalance ↓", freshBear);
    else if (structLongOk) pick("long", "OB/FVG + estrutura ↑", bullOB ?? bullFvg);
    else if (structShortOk) pick("short", "OB/FVG + estrutura ↓", bearOB ?? bearFvg);
  }
  if (!want) return { want: null, setup: "", stop: null, target: null, note: "sem setup SMC" };
  if (want === "short" && !o.fut) return { want: null, setup: "", stop: null, target: null, note: "spot não faz short" };
  // DISCIPLINA DE ZONA (sql/113, spec do dono 06/jul, fase M2 — melhorou as 4 moedas, R total
  // recorde +59,9): no PREMIUM (topo) não compra e no DISCOUNT (fundo) não vende, SALVO
  // rompimento de swing recente (≤16 velas) OU estrutura INTERNA já virada na direção
  // (= rompimento em andamento — a exceção que preserva as continuações com força do ETH).
  if (o.zoneDiscipline) {
    const swingBreak = smc.lastSwing && smc.lastSwing.time >= lastT - 900 * 16 ? smc.lastSwing.bias : null;
    const upOk = swingBreak === "bullish" || smc.internalBias === "bullish";
    const dnOk = swingBreak === "bearish" || smc.internalBias === "bearish";
    if (want === "long" && inPrem && !upOk) return { want: null, setup: "", stop: null, target: null, note: "premium sem rompimento — zona de venda, compra só com quebra forte" };
    if (want === "short" && inDisc && !dnOk) return { want: null, setup: "", stop: null, target: null, note: "discount sem quebra — zona de compra, venda só com força" };
  }
  // QUALIDADE 2 (opp_zone_atr): não entrar com FVG/OB OPOSTO não-preenchido a ≤ X ATR à frente —
  // estaria entrando direto numa oferta/demanda fresca (o alvo morre nela). 0 = off.
  if (o.oppZoneAtr && o.oppZoneAtr > 0) {
    const ahead = o.oppZoneAtr * atr;
    const oppFvg = want === "long"
      ? smc.fvgs.some((f) => f.bias === "bearish" && f.bottom > price - buf && f.bottom - price <= ahead)
      : smc.fvgs.some((f) => f.bias === "bullish" && f.top < price + buf && price - f.top <= ahead);
    const oppOb = want === "long"
      ? smc.orderBlocks.some((b) => b.bias === "bearish" && b.bottom > price - buf && b.bottom - price <= ahead)
      : smc.orderBlocks.some((b) => b.bias === "bullish" && b.top < price + buf && price - b.top <= ahead);
    if (oppFvg || oppOb) return { want: null, setup: "", stop: null, target: null, note: "zona oposta fresca à frente — segura" };
  }

  // STOP estrutural (invalidação): abaixo do OB/FVG e da mínima varrida (long); espelho no short.
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
  // ALVO estrutural: próxima poça de liquidez a favor; senão PDH/PWH/PMH (ímãs clássicos do motor
  // novo — caso BNB pós-rally sem pool); senão a zona oposta.
  let target: number | null;
  const pl = smc.prevLevels;
  if (want === "long") {
    const la = smc.liquidity.filter((l) => l.side === "buy" && l.price > price).sort((a, b) => a.price - b.price)[0];
    const prevUp = [pl.pdh, pl.pwh, pl.pmh].filter((v): v is number => v != null && v > price).sort((a, b) => a - b)[0];
    target = la ? la.price : prevUp ?? (price < smc.premium.bottom ? smc.premium.bottom : null);
  } else {
    const lb = smc.liquidity.filter((l) => l.side === "sell" && l.price < price).sort((a, b) => b.price - a.price)[0];
    const prevDn = [pl.pdl, pl.pwl, pl.pml].filter((v): v is number => v != null && v < price).sort((a, b) => b - a)[0];
    target = lb ? lb.price : prevDn ?? (price > smc.discount.top ? smc.discount.top : null);
  }
  const risk = Math.abs(price - stop);
  if (target != null && risk > 0 && Math.abs(target - price) < risk) target = null; // R:R < 1 → sem alvo (usa trailing)
  // Identidade da zona de origem (zone_once: 1 entrada por zona — stopou nela, não re-entra).
  const zoneKey = zone && (zone as { time?: number }).time ? `${setup}:${(zone as { time?: number }).time}` : null;
  return { want, setup, stop, target, note: `${setup}${zone ? ` @ ${(((zone as Zone).bottom + (zone as Zone).top) / 2).toFixed(2)}` : ""}`, zoneKey };
}

// ════════ AUTO-PONDERAÇÃO POR MOEDA (usa os hit-rates do aprendizado) ════════
// DESLIGADA por padrão (cfg.auto_weight=false). Deixa o robô pesar cada sinal conforme o que
// ELE aprendeu que funciona NAQUELA moeda (estrutura pesada no SOL, leve no BTC). Trava anti-overfit:
//   • amostra mínima (MIN_N) — sinal com pouca história não mexe em nada;
//   • shrinkage (conf = n/(n+K)) — o ajuste cresce devagar com a amostra, nunca de uma vez;
//   • limites duros — cada sinal fica em [0.5×, 1.5×] e o structW se move no máx ±0.12.
// Sinal preditivo (hitRate>50%) pesa MAIS; ruidoso/contrário (<50%) pesa MENOS.
interface Tune { sigMult: Record<string, number>; structWAdj: number; applied: { key: string; label?: string; mult: number; n: number; hit: number }[] }
const NEUTRAL_TUNE: Tune = { sigMult: {}, structWAdj: 0, applied: [] };
function buildTune(assetLearn: { key: string; label?: string; hitRate: number; n: number }[] | null, on: boolean): Tune {
  if (!on || !assetLearn?.length) return NEUTRAL_TUNE;
  const MIN_N = 20, K_SHRINK = 40, GAIN = 1.2, STRUCT_GAIN = 0.5;
  const structKeys = new Set(["tf_15m", "swing", "bos"]); // só TFs/estrutura VIVOS (15m)
  const sigMult: Record<string, number> = {}; const applied: Tune["applied"] = [];
  let structEdge = 0, structConf = 0;
  for (const s of assetLearn) {
    if (!s || !Number.isFinite(s.hitRate) || s.n < MIN_N) continue;
    const edge = s.hitRate / 100 - 0.5;      // -0.5..+0.5 (acerto acima/abaixo da moeda ao ar)
    const conf = s.n / (s.n + K_SHRINK);      // shrinkage 0..~1 (confiança pela amostra)
    const mult = Math.max(0.5, Math.min(1.5, 1 + edge * conf * GAIN));
    sigMult[s.key] = mult;
    applied.push({ key: s.key, label: s.label, mult: Math.round(mult * 100) / 100, n: s.n, hit: s.hitRate });
    if (structKeys.has(s.key)) { structEdge += edge * conf; structConf += conf; }
  }
  const structWAdj = structConf > 0 ? Math.max(-0.12, Math.min(0.12, (structEdge / structConf) * STRUCT_GAIN)) : 0;
  applied.sort((a, b) => Math.abs(b.mult - 1) - Math.abs(a.mult - 1));
  return { sigMult, structWAdj, applied };
}

// ════════ Confluência: estrutura POR TF (15m/30m/1H) + fluxo ════════
interface Signal { key: string; group: string; label: string; score: number; weight: number; note: string }
interface TfRead { tf: string; smc: SmcResult | null; mom: number; bias: number; candles?: Candle[] }
const TFW: Record<string, number> = { "15m": 0.16, "30m": 0.15, "1H": 0.15, "4H": 0.16, "1D": 0.16 };
function computeReading(tfReads: TfRead[], p: any, imb: any[], walls: any[], spot: number, cvdRetail: number | null, cvdInst: number | null, pressWin: { label: string; bid: number; ask: number }[], tune: Tune = NEUTRAL_TUNE, toggles: Record<string, boolean> = {}) {
  const sig: Signal[] = [];
  // Peso final = peso base × multiplicador aprendido daquela moeda (1× quando a auto-ponderação está off).
  const add = (key: string, group: string, label: string, weight: number, score: number, note: string) => sig.push({ key, group, label, weight: Math.round(weight * (tune.sigMult[key] ?? 1) * 1000) / 1000, score: Math.round(clamp(score)), note });
  const der = p?.derivatives ?? {}, g = p?.gamma ?? {};
  const mom = tfReads[0]?.mom ?? 0;
  let absScore = 0;

  // ── ESTRUTURA POR TIMEFRAME — cada TF vota (compra/venda) ──
  for (const t of tfReads) {
    if (!t.smc) continue;
    add(`tf_${t.tf}`, "Estrutura por TF", `Estrutura ${t.tf}`, TFW[t.tf] ?? 0.15, t.bias, `${t.smc.swingBias === "bullish" ? "alta" : t.smc.swingBias === "bearish" ? "baixa" : "neutra"}${t.smc.lastSwing ? ` · ${t.smc.lastSwing.type}` : ""}${t.smc.price < t.smc.equilibrium.bottom ? " · discount" : t.smc.price > t.smc.equilibrium.top ? " · premium" : ""}`);
  }

  // ── MICROESTRUTURA: book + paredes/ímã + ABSORÇÃO (estado atual do mercado) ──
  const byEx: Record<string, any> = {};
  for (const r of imb) if (!byEx[r.exchange]) byEx[r.exchange] = r;
  // Pesos recalibrados pelo bot_learning 03/jul (n≥600): book varejo 56% e institucional 54% são
  // os fluxos PREDITIVOS → voz de verdade no placar; absorção 47%/paredes 49%/pressão 48%/CVD 50%
  // saíram do placar (peso simbólico, só medidos — eram os MAIORES pesos do veto antigo).
  const cb = byEx["coinbase"];
  if (cb) { const bid = Number(cb.bid_wide_usd || cb.bid_near_usd || 0), ask = Number(cb.ask_wide_usd || cb.ask_near_usd || 0); if (bid + ask > 0) { const r = (bid - ask) / (bid + ask); add("book_inst", "Microestrutura", "Book institucional (Coinbase)", 0.10, r * 150, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((bid / (bid + ask)) * 100)}% bid`); } }
  let rbid = 0, rask = 0;
  for (const ex of ["binance", "okx"]) { const r = byEx[ex]; if (r) { rbid += Number(r.bid_near_usd || 0); rask += Number(r.ask_near_usd || 0); } }
  if (rbid + rask > 0) { const r = (rbid - rask) / (rbid + rask); add("book_retail", "Microestrutura", "Book varejo (Binance+OKX)", 0.10, r * 140, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((rbid / (rbid + rask)) * 100)}% bid`); }
  if (spot > 0 && walls.length) {
    // Absorção: a MAIOR parede colada no preço (±0,7%) sendo testada agora.
    // Paredes de baleia: MESMO medidor do gráfico — suporte (ABAIXO do preço) × resistência (ACIMA).
    // Classifica pela POSIÇÃO vs preço ao vivo (não pelo w.side do snapshot): se o preço caiu,
    // uma parede 'bid' antiga fica ACIMA e vira resistência (igual o gráfico colore). Ponderado por
    // proximidade (colada=1; a 0,5%≈0,5). Substitui os antigos "barreira"+"ímã" que se contradiziam.
    let bestN = 0, bestSide = "", bestPx = 0, bestDist = 9;
    let wSup = 0, wRes = 0;
    for (const w of walls) {
      const price = Number(w.price), nn = Number(w.notional_usd || 0);
      if (!(price > 0) || nn <= 0) continue;
      const below = price < spot; // abaixo do preço = suporte; acima = resistência
      const distPct = Math.abs(price - spot) / spot * 100;
      if (distPct <= 0.7 && nn > bestN) { bestN = nn; bestSide = below ? "bid" : "ask"; bestPx = price; bestDist = distPct; }
      const pw = 1 / (1 + (distPct / 100) / 0.01); // meia-força a 1% (não crucifica paredes distantes)
      if (below) wSup += nn * pw; else wRes += nn * pw;
    }
    let absNote = "sem parede grande sendo testada";
    if (bestN >= 4e6) {
      const prox = 1 - bestDist / 0.7, mag = Math.min(bestN / 15e6, 1);
      const strength = 40 + 60 * mag * prox;
      if (bestSide === "bid") { absScore = strength; absNote = `parede de COMPRA $${(bestN / 1e6).toFixed(1)}M defendendo ~$${Math.round(bestPx / 1000)}k → bounce provável`; }
      else { absScore = -strength; absNote = `parede de VENDA $${(bestN / 1e6).toFixed(1)}M barrando ~$${Math.round(bestPx / 1000)}k → rejeição provável`; }
    }
    add("absorb", "Microestrutura", "Teste de parede (absorção)", 0.02, absScore, absNote); // 47% n739 → fora do placar, só medido
    const wTot = wSup + wRes;
    if (wTot > 0) { const r = (wSup - wRes) / wTot; add("walls", "Microestrutura", "Paredes de baleia (suporte × resistência)", 0.02, r * 120, `${r >= 0 ? "suporte" : "resistência"} ${Math.round((r >= 0 ? wSup : wRes) / wTot * 100)}% · $${(wSup / 1e6).toFixed(1)}M sup × $${(wRes / 1e6).toFixed(1)}M res`); } // 49% n2326 → só medido
  }

  // ── PRESSÃO DO BOOK (±2%): TENDÊNCIA recente (agora vs início da janela coletada) — o
  //    desempate que faltava: capta a compra/venda GANHANDO força, não só o placar estático. ──
  const byTs: Record<string, { b: number; a: number }> = {};
  for (const r of imb) { const tk = String(r.ts); if (!byTs[tk]) byTs[tk] = { b: 0, a: 0 }; byTs[tk].b += Number(r.bid_wide_usd || 0); byTs[tk].a += Number(r.ask_wide_usd || 0); }
  const tss = Object.keys(byTs).sort();
  if (tss.length >= 4) {
    const bidPctAt = (tk: string) => { const x = byTs[tk]; const s = x.b + x.a; return s > 0 ? x.b / s : 0.5; };
    const recent = (bidPctAt(tss[tss.length - 1]) + bidPctAt(tss[tss.length - 2])) / 2;
    const older = (bidPctAt(tss[0]) + bidPctAt(tss[1])) / 2;
    const accel = recent - older; // >0 = pressão ficando mais compradora
    add("book_trend", "Microestrutura", "Pressão do book (tendência)", 0.02, clamp(accel * 600), `${accel >= 0 ? "compra" : "venda"} ganhando força · ${Math.round(recent * 100)}% bid agora vs ${Math.round(older * 100)}% antes`);
  }

  // ── IMBALANCE / FVG (fair value gaps não preenchidos perto do preço, no TF base) ──
  const psmc = tfReads[0]?.smc;
  if (psmc && psmc.fvgs?.length) {
    const atrp = psmc.atr || psmc.price * 0.01;
    const fDem = psmc.fvgs.filter((f) => f.bias === "bullish" && f.mid < psmc.price).sort((a, b) => b.mid - a.mid)[0];
    const fSup = psmc.fvgs.filter((f) => f.bias === "bearish" && f.mid > psmc.price).sort((a, b) => a.mid - b.mid)[0];
    const fd = fDem ? (psmc.price - fDem.mid) / atrp : 99, fs = fSup ? (fSup.mid - psmc.price) / atrp : 99;
    let sc = 0, note = "sem FVG aberto perto do preço";
    if (fd < 1.5 && fd <= fs) { sc = 45 + 40 * Math.max(0, 1 - fd / 1.5); note = `FVG de alta (demanda) ~${fd.toFixed(1)} ATR abaixo — suporte/ímã de compra`; }
    else if (fs < 1.5 && fs < fd) { sc = -(45 + 40 * Math.max(0, 1 - fs / 1.5)); note = `FVG de baixa (oferta) ~${fs.toFixed(1)} ATR acima — resistência/ímã de venda`; }
    add("fvg", "Microestrutura", "Imbalance / FVG", 0.08, sc, note);
  }

  // ── COMPLEMENTO / DIAGNÓSTICO (medidos pelo aprendizado em TODAS as moedas; NÃO entram no
  //    gatilho — o dono definiu como "leitura complementar". Antes só o BTC tinha histórico deles;
  //    agora BTC/ETH/SOL/BNB registram o MESMO conjunto → análise por moeda fica completa/comparável). ──
  // Derivativos (por moeda): funding e long/short são CONTRÁRIOS (extremo = multidão no lado errado).
  const fr = N(der.funding_rate); // Coinalyze CEX = PERCENT (0,01 = 0,01%); normaliza por 0,05%.
  if (fr != null && fr !== 0) add("funding", "Fluxo", "Funding (contrário)", 0.02, -Math.sign(fr) * Math.min(Math.abs(fr) / 0.05, 1) * 55, `funding ${fr >= 0 ? "+" : ""}${fr.toFixed(4)}% — ${fr > 0 ? "longs pagam (aperto de longs)" : "shorts pagam (aperto de shorts)"}`); // 41% n832 (invertido) → fora de tudo, só medido
  const ls = N(der.long_short_ratio);
  if (ls != null && ls > 0) add("ls_ratio", "Sentimento", "Long/Short (contrário)", 0.04, -Math.sign(ls - 1) * Math.min(Math.abs(ls - 1) / 0.5, 1) * 50, `L/S ${ls.toFixed(2)} — ${ls > 1 ? "mais longs (multidão comprada)" : "mais shorts (multidão vendida)"}`); // 53% n1958 → vota no grupo Sentimento
  // Market-wide (igual p/ todas): Fear & Greed CONTRÁRIO — 56% n1958, o medido mais preditivo.
  const fng = N(p?.sentiment?.fng_value);
  if (fng != null) add("feargreed", "Sentimento", "Fear & Greed (contrário)", 0.04, ((50 - fng) / 50) * 55, `${fng}/100 ${p?.sentiment?.classification ?? ""}`.trim());
  // Diagnóstico SMC por moeda (já entram no voto via structuralBias; aqui é só p/ MEDIR cada peça).
  if (psmc) {
    const at = psmc.atr || psmc.price * 0.01;
    add("swing", "Estrutura", "Tendência de estrutura (swing)", 0.02, psmc.swingBias === "bullish" ? 78 : psmc.swingBias === "bearish" ? -78 : 0, `swing ${psmc.swingBias === "bullish" ? "de alta" : psmc.swingBias === "bearish" ? "de baixa" : "neutro"}`);
    if (psmc.lastSwing) add("bos", "Estrutura", "Último evento (BOS/CHoCH)", 0.02, (psmc.lastSwing.bias === "bullish" ? 1 : -1) * (psmc.lastSwing.type === "CHoCH" ? 80 : 55), `${psmc.lastSwing.type} ${psmc.lastSwing.bias === "bullish" ? "de alta" : "de baixa"}`);
    const dem = psmc.orderBlocks.filter((o) => o.bias === "bullish" && o.mid < psmc.price).sort((a, b) => b.mid - a.mid)[0];
    const sup = psmc.orderBlocks.filter((o) => o.bias === "bearish" && o.mid > psmc.price).sort((a, b) => a.mid - b.mid)[0];
    const dD = dem ? (psmc.price - dem.mid) / at : 99, sD = sup ? (sup.mid - psmc.price) / at : 99;
    add("ob", "Estrutura", "Order block (demanda × oferta)", 0.02, dD < 1.5 && dD <= sD ? 55 : sD < 1.5 && sD < dD ? -55 : 0, dD < 1.5 && dD <= sD ? "demanda colada (suporte)" : sD < 1.5 && sD < dD ? "oferta colada (resistência)" : "sem OB colado");
    const liqAbove = psmc.liquidity.filter((l) => l.price > psmc.price).sort((a, b) => a.price - b.price)[0];
    const liqBelow = psmc.liquidity.filter((l) => l.price < psmc.price).sort((a, b) => b.price - a.price)[0];
    const laD = liqAbove ? (liqAbove.price - psmc.price) / at : 99, lbD = liqBelow ? (psmc.price - liqBelow.price) / at : 99;
    add("sweep", "Estrutura", "Liquidez (varredura/ímã)", 0.02, laD < lbD && laD < 2 ? 40 : lbD < laD && lbD < 2 ? -40 : 0, laD < lbD && laD < 2 ? "liquidez acima (ímã de alta)" : lbD < laD && lbD < 2 ? "liquidez abaixo (ímã de baixa)" : "sem pool perto");
  }

  // ── TÉCNICO CLÁSSICO (15m) — VWAP diário, ADX/DMI 14, EMA 20×50. Só MEDIDOS (peso simbólico,
  //    fora do gatilho e do flowTilt/veto): o aprendizado decide por moeda se algum vira gate. ──
  const cs15 = tfReads[0]?.candles ?? [];
  if (cs15.length >= 60 && spot > 0) {
    const atrT = psmc?.atr || spot * 0.01;
    const vwap = dailyVwap(cs15);
    if (vwap != null && atrT > 0) {
      const d = (spot - vwap) / atrT;
      add("vwap", "Técnico", "VWAP diário (lado do preço)", 0.02, Math.sign(d) * (35 + 45 * Math.min(Math.abs(d) / 1.5, 1)), `preço ${d >= 0 ? "ACIMA" : "ABAIXO"} do VWAP (${Math.abs(d).toFixed(1)} ATR) — dia ${d >= 0 ? "comprador" : "vendedor"}`);
    }
    const a = adxDmi(cs15, 14);
    if (a) {
      const dir = a.diP > a.diM ? 1 : a.diP < a.diM ? -1 : 0;
      const strength = Math.min(Math.max(a.adx - 15, 0) / 25, 1); // ADX 15→0 · 40+→1 (lateral ⇒ score ~0, o aprendizado ignora)
      add("adx", "Técnico", "ADX/DMI 14 (força da tendência)", 0.02, dir * strength * 80, `ADX ${a.adx.toFixed(0)} — ${a.adx < 20 ? "LATERAL (chop)" : a.adx < 30 ? "tendência fraca" : "tendência forte"} · DI${dir >= 0 ? "+" : "−"} manda`);
    }
    const closes15 = cs15.map((c) => c.close);
    const e20 = emaLast(closes15, 20), e50 = emaLast(closes15, 50);
    if (e20 != null && e50 != null && atrT > 0) {
      const spread = (e20 - e50) / atrT;
      let sc = Math.sign(spread) * (30 + 50 * Math.min(Math.abs(spread) / 1.2, 1));
      if ((spread > 0 && spot < e20) || (spread < 0 && spot > e20)) sc *= 0.5; // preço já do lado contrário da 20 → tendência enfraquecendo
      add("ema2050", "Técnico", "EMA 20×50 (tendência curta)", 0.02, sc, `EMA20 ${spread >= 0 ? ">" : "<"} EMA50 (${Math.abs(spread).toFixed(1)} ATR) · preço ${spot >= e20 ? "acima" : "abaixo"} da EMA20`);
    }
  }

  // ── FLUXO / OPÇÕES / INSTITUCIONAL (estado atual) ──
  // CVD agregado é ruído (~50% no aprendizado) → peso baixo. O valor está na DIVERGÊNCIA
  // institucional (Coinbase, mão forte) × varejo (Binance+OKX, mão fraca): seguir o institucional.
  const cvdAgg = (cvdRetail ?? 0) + (cvdInst ?? 0);
  if (cvdRetail != null || cvdInst != null) add("cvd", "Fluxo", "CVD agregado (~30 min)", 0.02, (cvdAgg / 2500000) * 70, `${cvdAgg >= 0 ? "compra" : "venda"} líquida $${Math.abs(cvdAgg / 1e6).toFixed(1)}M`); // 50% n2099 → só medido
  if (cvdInst != null && cvdRetail != null && Math.sign(cvdInst) !== 0 && Math.sign(cvdRetail) !== 0 && Math.sign(cvdInst) !== Math.sign(cvdRetail)) {
    const sc = Math.sign(cvdInst) * (55 + 30 * Math.min(Math.abs(cvdInst) / 300000, 1));
    add("cvd_div", "Fluxo", "Divergência CVD (institucional × varejo)", 0.06, sc, cvdInst > 0 ? "institucional COMPRA e varejo vende — acumulação (tell de alta)" : "institucional VENDE e varejo compra — distribuição (tell de baixa)"); // 50% direção-1h, mas 75%/2.17R nos trades reais (n4) → segue no placar, peso menor
  }
  const llq = N(der.liq_long_usd) ?? 0, lshq = N(der.liq_short_usd) ?? 0;
  // PISO DE POEIRA (caso BNB 06/jul: "$0.0M liquidado" votava -68 e travava a confluência):
  // abaixo de $250k no total, liquidação é ruído — score 0 (segue logado pro aprendizado).
  if (llq + lshq > 0) {
    const liqTot = llq + lshq;
    const liqScore = liqTot >= 250000 ? ((lshq - llq) / liqTot) * 85 : 0;
    add("liqs", "Fluxo", "Liquidações", 0.06, liqScore, `${llq > lshq ? `longs liquidados $${(llq / 1e6).toFixed(1)}M — venda forçada` : `shorts liquidados $${(lshq / 1e6).toFixed(1)}M — compra forçada`}${liqTot < 250000 ? " (poeira <$250k — sem voto)" : ""}`);
  }
  const pw = N(g.put_wall), cw = N(g.call_wall);
  if (pw != null && cw != null && cw > pw && spot > 0) { const posPct = (spot - pw) / (cw - pw); add("gamma", "Opções", "Posição vs Put/Call Wall", 0.02, (0.5 - posPct) * 120, `${Math.round(posPct * 100)}% entre Put $${Math.round(pw / 1000)}k e Call $${Math.round(cw / 1000)}k`); } // INVERTIDO na régua forte (32% concordou × 56% discordou, n19+32) → fora do placar, só medido
  const gex = N(g.net_gex_spot);
  if (gex != null && mom !== 0) { const amp = (g.regime === "negative" || gex < 0) ? Math.sign(mom) : -Math.sign(mom); add("gflow", "Opções", "Fluxo de gamma (HIRO)", 0.05, amp * Math.min(Math.abs(gex) / 30e6, 1) * 55, `${g.regime === "negative" || gex < 0 ? "γ negativo amplifica" : "γ positivo amortece"} · GEX ${(gex / 1e6).toFixed(1)}M · ${amp >= 0 ? "a favor da alta" : "a favor da baixa"}`); }
  // (Prêmio Coinbase e Fluxo de ETF — institucional macro — REMOVIDOS do robô: não decidem trade de 15m.)

  // ── REGIME DE GAMMA (chave de modo): positivo = dealers amortecem (pinning/reversão) → estrutura
  //    falha mais e rompimento vira fade; negativo = amplifica (tendência) → solta o trend. ──
  const gexAll = N(g.net_gex_spot);
  const gammaPos = g.regime === "positive" || (gexAll != null && gexAll > 0);
  const gammaNeg = g.regime === "negative" || (gexAll != null && gexAll < 0);

  void der;

  // ════════ DECISÃO POR TIMEFRAME (voto 2-de-3) ════════
  // Cada TF tem um PLACAR próprio = estrutura daquele TF + a janela de pressão do book que
  // casa com o horizonte dele (15m↔30m, 30m↔12h, 1H↔48h). O fluxo "agora" (CVD, gamma, ETF,
  // paredes, absorção…) NÃO é por-TF → vira CONFIRMAÇÃO compartilhada (não dispara, mas veta).
  const winTilt = (label: string) => { const r = pressWin.find((x) => x.label === label); if (!r) return 0; const s = Number(r.bid) + Number(r.ask); return s > 0 ? (Number(r.bid) - Number(r.ask)) / s : 0; };
  const tfWindow: Record<string, string> = { "15m": "30m", "30m": "12h", "1H": "48h", "4H": "48h", "1D": "48h" };
  const perTf = tfReads.map((t) => {
    const pressure = Math.round(winTilt(tfWindow[t.tf] ?? "12h") * 100); // -100..100
    // BALANÇA SMC × FLUXO: dono definiu 65% Smart Money / 35% pressão do book (o fluxo mais forte).
    // Neutro = 0.65 (o número). Gamma positivo (pinning) → estrutura falha mais (fakeout): cai p/ 0.55
    // (book pinga mais, mas SMC ainda maioria — seguro p/ BTC). Gamma negativo (tendência) → 0.72.
    // Auto-ponderação (se ligada) empurra ±0.12 conforme a estrutura acerta mais/menos NAQUELA moeda.
    const structWBase = gammaPos ? 0.55 : gammaNeg ? 0.72 : 0.65;
    const structW = Math.max(0.40, Math.min(0.80, structWBase + tune.structWAdj));
    const composite = Math.round(clamp(structW * t.bias + (1 - structW) * pressure));
    return { tf: t.tf, bias: composite, structure: Math.round(t.bias), pressure, swing: t.smc?.swingBias ?? null };
  });

  // FLUXO LIMPO: só os sinais que o aprendizado validou (book 56%/54%, liqs 53%, gflow 51%,
  // cvd_div 67%/+0.85R na régua forte). Absorção/paredes/pressão/CVD-agregado saíram (47-50%);
  // Put/Call Wall ('gamma') REMOVIDO 06/jul — INVERTIDO na régua forte (trades reais).
  const flowKeys = new Set(["book_inst", "book_retail", "cvd_div", "liqs", "gflow"]);
  let fn = 0, fd = 0;
  for (const x of sig) if (flowKeys.has(x.key) && toggles[x.key] !== false) { fn += x.score * x.weight; fd += x.weight; }
  const flowTilt = fd ? Math.round(clamp(fn / fd)) : 0;

  // ── PLACAR DE CONFLUÊNCIA (motor v17): 4 grupos votam na direção; a MAIORIA decide no handler.
  //    Voto por grupo = média ponderada dos sinais LIGADOS dele; |score| ≥ 10 vira voto (senão 0). ──
  const groupDefs: { key: string; label: string; keys: string[] }[] = [
    { key: "estrutura", label: "Estrutura (SMC 15m)", keys: ["tf_15m"] },
    { key: "fluxo", label: "Fluxo", keys: [...flowKeys] },
    { key: "tecnico", label: "Técnico (EMA20×50 + VWAP + ADX)", keys: ["ema2050", "vwap", "adx"] },
    { key: "sentimento", label: "Sentimento (F&G + L/S)", keys: ["feargreed", "ls_ratio"] },
  ];
  const confluence = groupDefs.map((g) => {
    let n = 0, d = 0;
    for (const x of sig) if (g.keys.includes(x.key) && toggles[x.key] !== false) { n += x.score * x.weight; d += x.weight; }
    const score = d ? Math.round(clamp(n / d)) : 0;
    return { key: g.key, label: g.label, score, vote: (score >= 10 ? 1 : score <= -10 ? -1 : 0) as 1 | 0 | -1 };
  });

  const bias = perTf.length ? Math.round(perTf.reduce((s, t) => s + t.bias, 0) / perTf.length) : 0;
  return { bias, signals: sig, absScore: Math.round(absScore), perTf, flowTilt, gammaPos, gammaNeg, confluence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = async (level: string, message: string, detail: Record<string, unknown> = {}) => { try { await admin.from("bot_logs").insert({ level, message, detail }); } catch (_e) { /* */ } };

  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;

  let authorized = false, forced = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && secrets["newsletter_cron_key"] && cronKey === secrets["newsletter_cron_key"]) authorized = true;
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const u = userData?.user;
    if (u) { const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle(); if (prof?.role === "admin") { authorized = true; forced = true; } }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return json(500, { error: "sem config" });
  if (!cfg.enabled && !forced) return json(200, { skipped: "robo desligado" });

  // Auto-ponderação por moeda (OFF por padrão): lê os hit-rates que o robô aprendeu por ativo.
  const autoWeightOn = !!cfg.auto_weight;
  const { data: learnRow } = await admin.from("bot_learning").select("data").eq("id", 1).maybeSingle();
  const learnByAsset: Record<string, { perSignal?: { key: string; label?: string; hitRate: number; n: number }[] }> = ((learnRow?.data as any)?.byAsset) ?? {};

  const venue = String(cfg.venue ?? "binance");
  const bnbCreds: BnbCreds = { key: secrets.binance_test_key ?? "", secret: secrets.binance_test_secret ?? "" };
  if (!bnbCreds.key || !bnbCreds.secret) { await log("error", "Sem chaves da Binance testnet."); return json(400, { error: "sem credenciais binance" }); }

  try {
    // ════════ MULTI-MOEDA: no binance opera as 4 majors (dados completos). OKX legado = 1 ativo. ════════
    const ASSETS = venue === "binance" ? ["BTC", "ETH", "SOL", "BNB"] : [String(cfg.base_ccy)];
    const instOf = (asset: string) => venue === "binance" ? `${asset}${cfg.quote_ccy ?? "USDT"}` : String(cfg.inst_id);
    // Estado por-ativo em bot_positions (isolado); leitura espelhada em bot_config só p/ BTC (painel legado).
    const loadPos = async (asset: string) => {
      const { data } = await admin.from("bot_positions").select("position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, stopped_at, target_px, used_zones").eq("asset", asset).maybeSingle();
      return { position: (data?.position === "long" ? "long" : data?.position === "short" ? "short" : "flat") as "long" | "short" | "flat", pos_base_sz: Number(data?.pos_base_sz ?? 0), entry_px: data?.entry_px != null ? Number(data.entry_px) : null, adds: Number(data?.adds ?? 0), stop_px: data?.stop_px != null ? Number(data.stop_px) : null, ctrend: !!data?.ctrend, peak_px: data?.peak_px != null ? Number(data.peak_px) : null, stopped_at: (data?.stopped_at as string | null) ?? null, target_px: data?.target_px != null ? Number(data.target_px) : null, used_zones: (data?.used_zones as unknown[] | null) ?? [] };
    };
    const savePos = async (asset: string, instId: string, position: string, pos_base_sz: number, entry_px: number | null, adds = 0, stop_px: number | null = null, ctrend = false, peak_px: number | null = null) => {
      await admin.from("bot_positions").upsert({ asset, inst_id: instId, position, pos_base_sz, entry_px, adds, stop_px, ctrend, peak_px, updated_at: new Date().toISOString() }, { onConflict: "asset" });
    };
    const saveReading = async (asset: string, patch: Record<string, unknown>) => {
      await admin.from("bot_positions").upsert({ asset, ...patch }, { onConflict: "asset" });
      if (asset === "BTC") await admin.from("bot_config").update(patch).eq("id", 1);
    };

    // ── BLINDAGEM DE RISCO: sizing por RISCO (% do patrimônio) + teto de alavancagem + circuit breakers. ──
    let equity = 0;
    try { const a = await bnb("GET", "/fapi/v2/account", {}, bnbCreds, true); equity = Number((a.body as { totalWalletBalance?: string })?.totalWalletBalance) || 0; } catch { /* usa fallback abaixo */ }
    if (!(equity > 0)) equity = Math.max(1, Number(cfg.order_quote_sz ?? 10) * Number(cfg.leverage ?? 5)); // fallback conservador
    const riskPct = Math.max(0.05, Number(cfg.risk_pct ?? 1));         // % do patrimônio arriscado por trade
    const maxLev = Math.max(1, Number(cfg.leverage ?? 5));            // alavancagem = TETO (não mais tamanho fixo)
    const maxPositions = Math.max(1, Number(cfg.max_positions ?? 4));
    const cooldownMs = Math.max(0, Number(cfg.cooldown_min ?? 15)) * 60000;
    // PnL realizado de hoje (UTC) → circuit breaker de perda diária.
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayCloses } = await admin.from("bot_orders").select("pnl").eq("source", "auto").eq("action", "close").gte("created_at", dayStart.toISOString());
    const dailyPnl = (todayCloses ?? []).reduce((s: number, o: { pnl: number | null }) => s + (Number(o.pnl) || 0), 0);
    const dayBlocked = dailyPnl <= -(equity * Number(cfg.daily_loss_pct ?? 5) / 100);
    // Posições abertas agora (limite de simultâneas) — mutável ao longo do loop (só entradas NOVAS contam).
    const { data: openRows } = await admin.from("bot_positions").select("asset").neq("position", "flat");
    let openCount = (openRows ?? []).length;

    const processAsset = async (asset: string, instId: string) => {
      const base = asset;
      const [{ data: snaps }, { data: imbRows }, { data: wallRows }, { data: pressRows }] = await Promise.all([
        admin.from("market_snapshot").select("payload, ts").eq("asset", base).order("ts", { ascending: false }).limit(6),
        admin.from("orderbook_imbalance").select("exchange, bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(30),
        admin.from("orderbook_walls").select("side, price, notional_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(80),
        admin.rpc("get_book_pressure_windows", { p_asset: base }),
      ]);
      const snap = (snaps ?? [])[0];
      if (!snap?.payload) { return { asset, skipped: "sem dados de mercado" }; }
      // CVD separado: VAREJO (Binance+OKX) × INSTITUCIONAL (Coinbase) — p/ medir a divergência (mão forte).
      let cvdRetail: number | null = null, cvdInst: number | null = null;
      for (const s of (snaps ?? [])) {
        const pr = (s.payload as any)?.price ?? {};
        for (const ex of ["binance", "okx"]) { const v = N(pr?.[ex]?.cvd); if (v != null) cvdRetail = (cvdRetail ?? 0) + v; }
        const vc = N(pr?.coinbase?.cvd); if (vc != null) cvdInst = (cvdInst ?? 0) + vc;
      }

      // Preço + velas por TF (Binance futures testnet), normalizados p/ [time,o,h,l,c].
      const tkb = await bnb("GET", "/fapi/v1/ticker/price", { symbol: instId }, bnbCreds, false);
      const lastPx = Number(tkb.body?.price) || Number((snap.payload as any)?.gamma?.spot_price) || 0;
      const sets = await Promise.all(TFS.map((tf) => bnb("GET", "/fapi/v1/klines", { symbol: instId, interval: BNB_INTERVAL[tf] ?? "1h", limit: 300 }, bnbCreds, false)));
      const candleRows: string[][][] = sets.map((s) => ((s.body as any[]) ?? []).map((r) => [String(r[0]), String(r[1]), String(r[2]), String(r[3]), String(r[4]), String(r[5] ?? "0"), String(r[7] ?? "0"), String(r[10] ?? "0")])); // [ts,o,h,l,c,vol,quoteVol,takerBuyQuote]
      // Estrutura por TF: cada timeframe lê a sua + momentum dele.
      const tfReads: TfRead[] = TFS.map((tf, i) => {
        const cs: Candle[] = (candleRows[i] ?? []).map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] || 0, delta: 2 * (Number(r[7]) || 0) - (Number(r[6]) || 0) })); // delta = taker buy − taker sell (USD) da vela
        const smc = cs.length >= 30 ? computeSmc(cs, SWING) : null;
        const cl = cs.map((c) => c.close);
        const mom = cl.length >= 4 ? (cl[cl.length - 1] - cl[cl.length - 4]) / cl[cl.length - 4] : 0;
        return { tf, smc, mom, bias: structuralBias(smc, mom), candles: cs };
      });
      const primary = tfReads[0];

      const walls = (wallRows ?? []).filter((w) => w.ts === (wallRows ?? [])[0]?.ts);
      const tune = buildTune(learnByAsset[asset]?.perSignal ?? null, autoWeightOn);
      const signalToggles = (cfg.signal_toggles ?? {}) as Record<string, boolean>;
      const { signals, flowTilt, gammaPos, gammaNeg, confluence } = computeReading(tfReads, snap.payload, imbRows ?? [], walls, lastPx, cvdRetail, cvdInst, (pressRows as { label: string; bid: number; ask: number }[]) ?? [], tune, signalToggles);

      // ── SMC PRICE-ACTION 15m: a decisão vem da ESTRUTURA (não de voto/regime multi-TF). ──
      const smcBias = Math.round(tfReads[0]?.bias ?? 0);   // viés estrutural do 15m (só p/ exibir/medir)
      const conviction = Math.min(100, Math.abs(smcBias));

      const isSwapOkx = String(instId).toUpperCase().endsWith("-SWAP");
      const fut = venue === "binance" || isSwapOkx; // opera short?
      const st = await loadPos(asset);
      let pos: "long" | "short" | "flat" = st.position;

      // ── CONFIG POR MOEDA (cfg.asset_overrides, sql/103): definida AQUI no topo p/ valer em todo
      //    o processamento (trailing, gates, sizing). Cada moeda é única — mesmo motor, dose própria. ──
      const ov = (((cfg.asset_overrides ?? {}) as Record<string, Record<string, unknown>>)[asset]) ?? {};
      const riskMult = Math.min(1, Math.max(0.1, Number(ov.risk_mult ?? 1)));

      // Volatilidade + estrutura do ativo (TF primário) — base dos STOPS ADAPTATIVOS POR ATR.
      // O ATR mede o "ruído típico" da moeda naquele TF → o stop escala com a volatilidade dela
      // (1% do BTC ≠ 1% de um alt). swingLo/Hi = último pivô de estrutura, p/ o piso de estrutura.
      // PISO DO TRAILING por moeda (ov.trail_floor): "structure" (default) = swing grande (~5h,
      // largo — preserva runner; certo p/ ETH/SOL); "internal" = swing INTERNO (~1h) — o stop
      // acompanha a estrutura recente. Matriz 03/jul: internal REPROVADO global (ETH 1,39→0,97),
      // APROVADO só no BNB (0,97→1,15 e 0,73→1,06 nas 2 janelas).
      const atrPx = primary?.smc?.atr && primary.smc.atr > 0 ? primary.smc.atr : lastPx * 0.01;
      const floorInternal = String(ov.trail_floor ?? "structure") === "internal";
      const rawLo = floorInternal ? primary?.smc?.internalLowLevel : primary?.smc?.swingLowLevel;
      const rawHi = floorInternal ? primary?.smc?.internalHighLevel : primary?.smc?.swingHighLevel;
      const swingLo = rawLo != null && Number.isFinite(rawLo) ? rawLo : null;
      const swingHi = rawHi != null && Number.isFinite(rawHi) ? rawHi : null;

      // ── TRAILING STOP por ATR (Chandelier) + PISO DE ESTRUTURA (por ciclo). A distância é
      //    k × ATR do ativo (não % fixo) → a trilha respira na volatilidade de CADA moeda. O stop
      //    sobe com o pico (long)/desce (short) e NUNCA afrouxa (ratchet). Piso de estrutura: nunca
      //    fica mais JUSTO que logo além do último swing (protege do ruído em baixa vol). Arma quando
      //    a trilha alcança o breakeven (lucro ≥ k×ATR). DESLIGADO por padrão. ──
      if (cfg.enabled && venue === "binance" && fut && pos !== "flat" && st.entry_px && lastPx > 0) {
        const prevPeak = st.peak_px != null ? st.peak_px : st.entry_px;
        const peak = pos === "long" ? Math.max(prevPeak, lastPx) : Math.min(prevPeak, lastPx);
        let newStop = st.stop_px;
        const kTrail = Number(cfg.trail_atr_mult ?? 3);
        if (cfg.trail_on && kTrail > 0 && atrPx > 0) {
          const dist = kTrail * atrPx;
          const buf = 0.25 * atrPx; // respiro além do swing, proporcional à volatilidade
          const armed = pos === "long" ? peak - st.entry_px >= dist : st.entry_px - peak >= dist;
          if (armed) {
            let trailStop = pos === "long" ? peak - dist : peak + dist;
            // Piso de estrutura: só LEVE FROUXO — nunca deixa o stop mais justo que além do swing.
            if (pos === "long") {
              if (swingLo != null && swingLo < peak) trailStop = Math.min(trailStop, swingLo - buf);
              // Trava de breakeven: com lucro consolidado (≥1×ATR), o piso de estrutura NÃO pode deixar o
              // stop abaixo da entrada — protege o winner de virar perda nos runners rápidos (sem swing novo).
              if (peak - st.entry_px >= atrPx) trailStop = Math.max(trailStop, st.entry_px);
              newStop = st.stop_px == null ? trailStop : Math.max(st.stop_px, trailStop); // ratchet: só sobe
            } else {
              if (swingHi != null && swingHi > peak) trailStop = Math.max(trailStop, swingHi + buf);
              if (st.entry_px - peak >= atrPx) trailStop = Math.min(trailStop, st.entry_px);
              newStop = st.stop_px == null ? trailStop : Math.min(st.stop_px, trailStop); // ratchet: só desce
            }
          }
        }
        if (peak !== prevPeak || newStop !== st.stop_px) {
          await savePos(asset, instId, pos, st.pos_base_sz, st.entry_px, st.adds, newStop, st.ctrend, peak);
          if (newStop !== st.stop_px) await log("info", `[${asset}] trailing ATR: stop → ${newStop?.toFixed(2)} (pico ${peak.toFixed(2)} · ${kTrail}×ATR ${atrPx.toFixed(2)}).`, {});
          st.stop_px = newStop; st.peak_px = peak;
        }
      }

      // ── RE-ARMA ALVO AUSENTE: posição aberta sem take-profit (aberta na janela "sem alvo" de
      //    03/jul, ou plano sem R:R na entrada) ganha alvo na PRÓXIMA LIQUIDEZ da direção do lucro
      //    — mesma regra da entrada. Sem isso, o runner depende só do trailing (caso BNB 03/jul). ──
      if (cfg.enabled && venue === "binance" && fut && pos !== "flat" && st.target_px == null && cfg.target_on !== false && primary?.smc) {
        const liq = primary.smc.liquidity;
        const tgt = pos === "long"
          ? liq.filter((l) => l.side === "buy" && l.price > lastPx).sort((a, b) => a.price - b.price)[0]?.price ?? null
          : liq.filter((l) => l.side === "sell" && l.price < lastPx).sort((a, b) => b.price - a.price)[0]?.price ?? null;
        if (tgt != null) {
          await admin.from("bot_positions").update({ target_px: tgt }).eq("asset", asset);
          st.target_px = tgt;
          await log("info", `[${asset}] alvo re-armado na próxima liquidez ${tgt.toFixed(2)} (posição estava sem take-profit).`, {});
        }
      }

      // ── STOP DE RISCO (checado a cada ciclo): se a posição furou o stop_px, fecha a mercado e sai. ──
      const fillPxOf = async (orderId: string | number) => {
        const tr = await bnb("GET", "/fapi/v1/userTrades", { symbol: instId, orderId, limit: 20 }, bnbCreds, true);
        const arr = Array.isArray(tr.body) ? tr.body : []; let q = 0, qv = 0;
        for (const t of arr) { const p = Number(t.price), tq = Number(t.qty); if (p > 0 && tq > 0) { q += tq; qv += p * tq; } }
        return q > 0 ? qv / q : null;
      };
      if (cfg.enabled && venue === "binance" && fut && pos !== "flat" && st.stop_px && lastPx > 0) {
        let hitTarget = st.target_px != null && st.target_px > 0 && (pos === "long" ? lastPx >= st.target_px : lastPx <= st.target_px);
        // ── TP PARCIAL (cfg.tp_partial): no alvo, embolsa METADE e o resto corre no trailing com
        //    stop travado ≥ breakeven; alvo some (parcial 1×). Meia posição abaixo de minQty/
        //    minNotional → cai no fechamento CHEIO normal (não deixa resto inexecutável). ──
        if (hitTarget && cfg.tp_partial && st.entry_px) {
          const infoP = await bnb("GET", "/fapi/v1/exchangeInfo", {}, bnbCreds, false);
          const symP = (((infoP.body?.symbols as any[]) ?? []).find((s) => s.symbol === instId) ?? {});
          const lotP = (((symP.filters as any[]) ?? []).find((f) => f.filterType === "LOT_SIZE")) ?? {};
          const notPf = (((symP.filters as any[]) ?? []).find((f) => f.filterType === "MIN_NOTIONAL")) ?? {};
          const stepP = Number(lotP.stepSize) || 0.001, minQtyP = Number(lotP.minQty) || 0.001, minNotP = Number(notPf.notional) || 100;
          const decP = String(stepP).includes(".") ? String(stepP).replace(/0+$/, "").split(".")[1].length : 0;
          const halfQty = Math.floor((st.pos_base_sz / 2) / stepP) * stepP;
          if (halfQty >= minQtyP && halfQty * lastPx >= minNotP && st.pos_base_sz - halfQty >= minQtyP) {
            const closeSide = pos === "long" ? "SELL" : "BUY";
            const qtyStr = halfQty.toFixed(decP);
            const rr = await bnbOrder({ symbol: instId, side: closeSide, type: "MARKET", quantity: qtyStr, reduceOnly: true, newOrderRespType: "RESULT" }, bnbCreds);
            const okk = !!rr.body?.orderId && !rr.body?.code;
            if (okk) {
              const exitPx = (Number(rr.body?.avgPrice) || (rr.body?.orderId ? await fillPxOf(rr.body.orderId) : null)) ?? lastPx;
              const pnl = (exitPx - st.entry_px) * halfQty * (pos === "long" ? 1 : -1);
              const rest = Number((st.pos_base_sz - halfQty).toFixed(decP));
              const beStop = pos === "long" ? Math.max(st.stop_px, st.entry_px) : Math.min(st.stop_px, st.entry_px);
              await savePos(asset, instId, pos, rest, st.entry_px, st.adds, beStop, st.ctrend, st.peak_px);
              await admin.from("bot_positions").update({ target_px: null }).eq("asset", asset);
              await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: exitPx, fill_sz: Number(rr.body?.executedQty) || null, ok: true, result: rr.body, pnl, note: `[${asset}] 🎯 ALVO PARCIAL (50%) @ ${st.target_px} · resto ${rest} corre no trailing (stop ≥ breakeven ${beStop.toFixed(2)}) · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` });
              await log("trade", `[${asset}] 🎯 ALVO PARCIAL: embolsou metade (${qtyStr}) @ ${exitPx} · resto ${rest} segue no trailing com stop ${beStop.toFixed(2)} (≥ breakeven) · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}.`, {});
              st.pos_base_sz = rest; st.stop_px = beStop; st.target_px = null;
              hitTarget = false; // resto sem alvo — o ciclo segue normal (trailing gere a metade restante)
            }
          }
        }
        const breached = hitTarget || (pos === "long" ? lastPx <= st.stop_px : lastPx >= st.stop_px);
        if (breached) {
          const closeSide = pos === "long" ? "SELL" : "BUY";
          // Arredonda a quantidade ao stepSize do símbolo (evita -1111 "precision over maximum").
          const infoS = await bnb("GET", "/fapi/v1/exchangeInfo", {}, bnbCreds, false);
          const lotS = ((((((infoS.body?.symbols as any[]) ?? []).find((s) => s.symbol === instId) ?? {}).filters as any[]) ?? []).find((f) => f.filterType === "LOT_SIZE")) ?? {};
          const stepS = Number(lotS.stepSize) || 0.001;
          const decS = String(stepS).includes(".") ? String(stepS).replace(/0+$/, "").split(".")[1].length : 0;
          const stopQty = (Math.floor(st.pos_base_sz / stepS) * stepS).toFixed(decS);
          const rr = await bnbOrder({ symbol: instId, side: closeSide, type: "MARKET", quantity: stopQty, reduceOnly: true, newOrderRespType: "RESULT" }, bnbCreds);
          const okk = !!rr.body?.orderId && !rr.body?.code;
          const exitPx = (Number(rr.body?.avgPrice) || (okk && rr.body?.orderId ? await fillPxOf(rr.body.orderId) : null)) ?? lastPx;
          const pnl = st.entry_px ? (exitPx - st.entry_px) * Number(stopQty) * (pos === "long" ? 1 : -1) : null;
          // Trailing travou lucro? (stop já está do lado do lucro em relação à entrada)
          const trailed = !!(st.entry_px && st.stop_px && (pos === "long" ? st.stop_px >= st.entry_px : st.stop_px <= st.entry_px));
          const stopLbl = hitTarget ? "🎯 ALVO (liquidez) — take-profit " : trailed ? "🛑 STOP MÓVEL (lucro travado)" : "🛑 STOP ";
          await savePos(asset, instId, "flat", 0, null);
          if (!hitTarget) await admin.from("bot_positions").update({ stopped_at: new Date().toISOString() }).eq("asset", asset); // cooldown só pós-stop (não no take-profit)
          openCount = Math.max(0, openCount - 1);
          await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: stopQty, avg_px: exitPx, fill_sz: Number(rr.body?.executedQty) || null, ok: okk, result: rr.body, pnl, note: `[${asset}] ${stopLbl}@ ${st.stop_px}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
          await log("trade", `[${asset}] ${stopLbl}acionado @ ${lastPx} (nível ${st.stop_px})${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}.`, {});
          return { asset, decision: "flat", stopped: true, pnl };
        }
      }

      // ── DECISÃO SMC PRICE-ACTION (15m): a ESTRUTURA decide entrada, stop e alvo. ──
      const imbalanceOn = cfg.imbalance_on !== false;
      const imbMinPct = Number(cfg.imbalance_min_pct ?? 0);
      const c15 = candleRows[0] ?? [];
      const lastT = c15.length ? Math.floor(Number(c15[c15.length - 1][0]) / 1000) : Math.floor(Date.now() / 1000);
      // PLAYBOOK 06/jul (defaults novos; reverter = update em bot_config, sem deploy):
      // imbalance como o módulo Smart Money (retest da zona), a favor da estrutura, e o setup
      // do print (reteste de OB/FVG pós-BOS/CHoCH) com prioridade.
      const imbRetest = String(cfg.imb_mode ?? "retest") === "retest";
      const imbAlign = cfg.imb_align !== false;
      const structFirst = String(cfg.setup_priority ?? "structure") === "structure";
      const dirMode = String(cfg.dir_mode ?? "majority");
      const zoneDiscipline = cfg.zone_discipline !== false;
      const plan: SmcPlan = primary?.smc
        ? smcDecision(primary.smc, lastPx, lastT, { imbalanceOn, imbMinPct, stopAtrMult: Number(cfg.stop_atr_mult ?? 3), fut, maxZoneAtr: Number(cfg.max_zone_atr ?? 0), oppZoneAtr: Number(cfg.opp_zone_atr ?? 0), imbRetest, imbAlign, structFirst, dirMode, zoneDiscipline })
        : { want: null, setup: "", stop: null, target: null, note: "sem SMC" };
      let want: "long" | "short" | null = plan.want;
      let gate = plan.note;
      // ── 1 TIRO POR ZONA (zone_once): zona que já deu entrada não re-entra (stop nela = invalidada).
      const zoneOnce = cfg.zone_once !== false;
      const usedZones: string[] = Array.isArray(st.used_zones) ? (st.used_zones as unknown[]).map(String) : [];
      if (want && zoneOnce && plan.zoneKey && usedZones.includes(plan.zoneKey)) {
        gate = "zona já usada (1 tiro por zona) — segura o setup";
        want = null;
      }
      // ── CONFIRMAÇÃO DE DELTA (cfg.delta_confirm, sql/112 — ideia do dono 06/jul; fase K:
      //    melhorou as 4 moedas, agregado +39,9→+56,1R, R médio 2×): a vela ATUAL precisa ter
      //    volume COMPRADOR (long) / VENDEDOR (short) — o "combustível" da formação do candle. ──
      const deltaConfirm = cfg.delta_confirm !== false;
      const lastDelta = primary?.candles?.length ? (primary.candles[primary.candles.length - 1].delta ?? 0) : 0;
      if (want && deltaConfirm && ((want === "long" && lastDelta <= 0) || (want === "short" && lastDelta >= 0))) {
        gate = `delta da vela contra ($${(lastDelta / 1e6).toFixed(2)}M) — aguarda volume ${want === "long" ? "comprador" : "vendedor"}`;
        want = null;
      }
      // ── FILTRO SQUEEZE MOMENTUM — LazyBear (cfg.sq_filter, sql/114; fase P: melhorou as 4,
      //    agregado +59,9→+67,8R recorde): momentum (linreg do desvio, 20 velas 15m) FORTE
      //    contra a direção (≥0,5 ATR) segura a entrada — não se compra contra mola armada. ──
      const sqFilter = cfg.sq_filter !== false;
      if (want && sqFilter && primary?.candles && primary.candles.length >= 21) {
        const n = 20;
        const win = primary.candles.slice(-n);
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
        const mom = ym + (den ? num / den : 0) * (n - 1 - xm);
        if (atrPx > 0 && Math.abs(mom) >= 0.5 * atrPx && ((want === "long" && mom < 0) || (want === "short" && mom > 0))) {
          gate = `squeeze momentum ${mom < 0 ? "vendedor" : "comprador"} forte contra (${(mom / atrPx).toFixed(2)} ATR) — segura`;
          want = null;
        }
      }
      // ── BÚSSOLA HTF (cfg.htf_gate, sql/106, default 4H): a entrada precisa alinhar com a
      //    estrutura do TF maior (top-down do dono). Neutra também segura (sem contexto = fora).
      //    Fase F: maioria + bússola 4H = única variante acima do baseline, com metade do drawdown. ──
      const htfGate = String(cfg.htf_gate ?? "4H");
      if (want && htfGate !== "off" && BNB_INTERVAL[htfGate]) {
        const hk = await bnb("GET", "/fapi/v1/klines", { symbol: instId, interval: BNB_INTERVAL[htfGate], limit: 300 }, bnbCreds, false);
        const hcs: Candle[] = ((hk.body as any[]) ?? []).map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5] || 0 }));
        const hsmc = hcs.length >= 30 ? computeSmc(hcs, SWING) : null;
        const hb = hsmc?.swingBias ?? hsmc?.internalBias ?? null;
        if (hb !== (want === "long" ? "bullish" : "bearish")) {
          gate = `bússola ${htfGate} ${hb === "bullish" ? "de ALTA" : hb === "bearish" ? "de BAIXA" : "neutra"} contra o setup ${plan.setup} — segura`;
          want = null;
        }
      }
      // ── GATE DE CONFLUÊNCIA (motor v17, pedido do dono): os 4 grupos (Estrutura/Fluxo/Técnico/
      //    Sentimento) votam na direção do setup; só executa com MAIORIA (cfg.conf_min, default
      //    3-de-4) e sem empate contra. Vale p/ TODA entrada, IMBALANCE INCLUÍDO (era o passe
      //    livre que fazia vender SOL contra estrutura+VWAP+EMAs+fluxo). Substitui o veto de
      //    fluxo (flow_veto) e o filtro técnico (ta_gate) antigos — agora fluxo e técnico VOTAM.
      //    Setup segurado fica no gate/log → o aprendizado mede o que teria acontecido (shadow).
      // ── GATE DE SESSÃO (sql/102): horas UTC em que o robô NÃO abre posição nova nem piramida
      //    (saídas stop/alvo/trailing seguem normais). Estudo 03/jul: 9-12h e 18-24h UTC negativos
      //    em 7-8 de 8 janelas; bloquear = 1ª variante a melhorar o agregado nas 2 janelas.
      //    Por-moeda: ov.block_hours sobrepõe o global (ETH/SOL ficam livres — o gate os taxava). ──
      const bhSrc = Array.isArray(ov.block_hours) ? ov.block_hours : cfg.block_hours;
      const blockHours: number[] = Array.isArray(bhSrc) ? (bhSrc as unknown[]).map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) : [];
      const hourNow = new Date().getUTCHours();
      if (want && blockHours.includes(hourNow)) {
        gate = `sessão bloqueada (${hourNow}h UTC — janela historicamente negativa) — segura o setup`;
        want = null;
      }
      // CONF_SCOPE (sql/107 + evoluções 06/jul):
      //   'smc_flow_ta' (default, pedido do dono à noite) = MAIORIA POSITIVA de 3 grupos —
      //     Estrutura · Fluxo/pressão · Técnico (EMA+VWAP+ADX) — 2 de 3 a favor e sem empate contra;
      //   'smc_flow' = Estrutura vota na direção E Fluxo não-contra (Sentimento/Técnico = estudo);
      //   'all' = regra v17 (maioria conf_min dos 4 grupos, Sentimento incluído).
      const confScope = String(cfg.conf_scope ?? "smc_flow_ta");
      const scopeKeys = confScope === "smc_flow" ? ["estrutura", "fluxo"] : confScope === "smc_flow_ta" ? ["estrutura", "fluxo", "tecnico"] : null;
      const confGroups = scopeKeys ? confluence.filter((g) => scopeKeys.includes(g.key)) : confluence;
      const confMin = confScope === "smc_flow_ta" ? 2 : Math.min(confGroups.length, Math.max(1, Number(ov.conf_min ?? cfg.conf_min ?? 3)));
      let confVotes: { for: number; against: number } | null = null;
      if (want) {
        const dir = want === "long" ? 1 : -1;
        const votesFor = confGroups.filter((g) => g.vote === dir).length;
        const votesAgainst = confGroups.filter((g) => g.vote === -dir).length;
        confVotes = { for: votesFor, against: votesAgainst };
        if (confScope === "smc_flow") {
          const estr = confGroups.find((g) => g.key === "estrutura");
          const flx = confGroups.find((g) => g.key === "fluxo");
          if ((estr?.vote ?? 0) !== dir) { gate = `estrutura não confirma a direção do setup (voto ${estr?.score ?? 0}) — segura`; want = null; }
          else if ((flx?.vote ?? 0) === -dir) { gate = `pressão/fluxo CONTRA o setup (${flx?.score ?? 0}) — segura`; want = null; }
        } else if (votesFor < confMin || votesAgainst >= votesFor) {
          const contra = confGroups.filter((g) => g.vote === -dir).map((g) => g.label).join(", ");
          gate = `confluência ${votesFor}/${confGroups.length} a favor (precisa ${confMin}${votesAgainst ? `; contra: ${contra}` : ""}) — segura o setup`;
          want = null;
        }
      }
      // REVERSÃO COM CUIDADO (rev_mode; backtest: virar a mão a cada sinal contrário era o maior
      // ralo — ~50% das saídas). 'off' = posição só sai por stop/alvo/trailing; 'imbalance' = só
      // FVG fresco contra reverte; 'any' = comportamento antigo.
      if (pos !== "flat" && want && want !== pos) {
        const revMode = String(cfg.rev_mode ?? "off");
        const revOk = revMode === "any" || (revMode === "imbalance" && !!plan.setup && plan.setup.startsWith("imbalance"));
        if (!revOk) { gate = `reversão bloqueada (${revMode}) — sai só por stop/alvo/trailing`; want = null; }
      }
      const bias = smcBias;
      const regime: "up" | "down" | "range" = smcBias >= 18 ? "up" : smcBias <= -18 ? "down" : "range";
      const isCounter = false;   // 15m puro: sem TF maior → sem contra-tendência
      const protExit = false;

      let target: "long" | "short" | "flat" = want ?? pos;
      if (!fut && pos === "long" && want === "short") target = "flat";
      // Relação REAL da entrada com o regime (corrige o rótulo antigo, que dizia "a favor da
      // tendência (up)" até em short contra alta — poluía log e avaliação).
      const trendRel = regime === "range" ? "em range" : (target === "long") === (regime === "up") ? `a favor da tendência (${regime})` : `CONTRA a tendência (${regime})`;

      // PIRÂMIDE: a favor, no lucro (a virada de estrutura/CHoCH contra vira reversão via `want` oposto).
      const pyramidMax = Number(cfg.pyramid_max ?? 2);
      const inProfit = pos !== "flat" && st.entry_px != null && lastPx > 0 ? (pos === "long" ? lastPx > st.entry_px : lastPx < st.entry_px) : false;
      const pyramidAdd = !!cfg.pyramid && fut && want != null && want === pos && !st.ctrend && inProfit && st.adds < pyramidMax;

      const decision = !cfg.enabled ? "preview" : pyramidAdd ? "add" : target === pos ? "hold" : target;
      const zone = primary?.smc ? (primary.smc.price < primary.smc.equilibrium.bottom ? "discount" : primary.smc.price > primary.smc.equilibrium.top ? "premium" : "equilíbrio") : null;
      const structure = { smcBias, setup: plan.setup || null, planStop: plan.stop, planTarget: plan.target, flowBias: flowTilt, gammaRegime: gammaPos ? "positive" : gammaNeg ? "negative" : "neutral", zone, autoWeight: autoWeightOn ? { on: true, structWAdj: Math.round(tune.structWAdj * 100) / 100, top: tune.applied.slice(0, 6) } : { on: false } };
      const reading = { asset, bias, conviction, signals, spot: lastPx, mom: primary?.mom ?? 0, flowTilt, setup: plan.setup || null, planStop: plan.stop, planTarget: plan.target, structure, confluence, confMin, confVotes, overrides: Object.keys(ov).length ? ov : null, want: target, position: pos, adds: st.adds, leverage: Number(cfg.leverage), futures: fut, venue, gate: gate || null, ts: new Date().toISOString() };
      await saveReading(asset, { last_bias: bias, last_conviction: conviction, last_decision: decision, last_reading: reading, last_run: new Date().toISOString() });

      const top = signals.slice().sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3).map((s) => `${s.label} ${s.score >= 0 ? "+" : ""}${s.score}`).join(", ");
      const cons = `SMC ${smcBias >= 0 ? "+" : ""}${smcBias}${plan.setup ? ` · ${plan.setup}` : ""} · fluxo ${flowTilt >= 0 ? "+" : ""}${flowTilt}`;
      const lbl = (d: string) => d === "long" ? "LONG" : d === "short" ? "SHORT" : "fora";

      // Preview (desligado), ou alvo == posição SEM pirâmide → não opera.
      if (!cfg.enabled || (target === pos && !pyramidAdd)) {
        const head = !cfg.enabled
          ? `[${asset}] Preview: viés ${bias >= 0 ? "+" : ""}${bias} (${cons}) → ${target === pos ? "manteria " + lbl(pos) : "abriria " + lbl(target)}${gate ? ` [${gate}]` : ""}`
          : `[${asset}] Leitura: viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%, ${cons}) → mantém ${lbl(pos)}${gate ? ` [segurou: ${gate}]` : ""}`;
        await log("info", `${head}. ${top}`, reading);
        return { asset, decision: !cfg.enabled ? "preview" : "hold", bias, conviction };
      }

      // ════════ EXECUÇÃO — BINANCE FUTURES TESTNET (long/short, tamanho em USDT) ════════
      if (venue === "binance") {
        const info = await bnb("GET", "/fapi/v1/exchangeInfo", {}, bnbCreds, false);
        const symInfo = ((info.body?.symbols as any[]) ?? []).find((s) => s.symbol === instId) ?? {};
        const lot = ((symInfo.filters as any[]) ?? []).find((f) => f.filterType === "LOT_SIZE") ?? {};
        const notf = ((symInfo.filters as any[]) ?? []).find((f) => f.filterType === "MIN_NOTIONAL") ?? {};
        const stepSz = Number(lot.stepSize) || 0.001, minQty = Number(lot.minQty) || 0.001, minNot = Number(notf.notional) || 100;
        const ss = String(stepSz); const qDec = ss.includes(".") ? ss.replace(/0+$/, "").split(".")[1].length : 0;
        const roundStep = (q: number) => Math.floor(q / stepSz) * stepSz;
        const place = async (side: "BUY" | "SELL", qty: string, reduceOnly: boolean) => {
          const params: Record<string, string | number | boolean> = { symbol: instId, side, type: "MARKET", quantity: qty, newOrderRespType: "RESULT" };
          if (reduceOnly) params.reduceOnly = true;
          const r = await bnbOrder(params, bnbCreds);
          const okk = !!r.body?.orderId && r.body?.status !== "REJECTED" && !r.body?.code;
          let ap = Number(r.body?.avgPrice) || null;
          const fz = Number(r.body?.executedQty) || null;
          // Binance demo costuma devolver avgPrice=0 no RESULT → busca o preço real dos fills.
          if (okk && (!ap || ap === 0) && r.body?.orderId) {
            const tr = await bnb("GET", "/fapi/v1/userTrades", { symbol: instId, orderId: r.body.orderId, limit: 20 }, bnbCreds, true);
            const arr = Array.isArray(tr.body) ? tr.body : [];
            let q = 0, qv = 0;
            for (const t of arr) { const p = Number(t.price), tq = Number(t.qty); if (p > 0 && tq > 0) { q += tq; qv += p * tq; } }
            if (q > 0) ap = qv / q;
          }
          return { r: r.body, okk, ap, fz, sMsg: r.body?.msg ?? null };
        };
        let pnl: number | null = null;

        // ── PIRÂMIDE: adiciona à posição existente (mesma direção), SEM fechar. Preço médio ponderado. ──
        if (pyramidAdd) {
          await bnb("POST", "/fapi/v1/leverage", { symbol: instId, leverage: Math.round(maxLev) }, bnbCreds, true);
          // Pirâmide arrisca METADE do risco base; respeita o teto de alavancagem no nocional TOTAL.
          const addStopDist0 = (cfg.stop_atr_on && atrPx > 0 ? Number(cfg.stop_atr_mult ?? 4) * atrPx : lastPx * Number(cfg.stop_pct ?? 1.5) / 100) || (lastPx * 0.01);
          let qty = roundStep((equity * (riskPct / 100) * riskMult * 0.5) / addStopDist0);
          const roomNot = equity * maxLev / maxPositions - st.pos_base_sz * lastPx; // espaço no slot da posição (teto ÷ maxPositions)
          if (qty * lastPx > roomNot) qty = roundStep(Math.max(0, roomNot) / lastPx);
          if (qty < minQty || qty * lastPx < minNot) { await log("info", `[${asset}] pirâmide sem margem no teto de alavancagem — mantém posição.`, reading); return { asset, decision: "hold", bias, conviction }; }
          const qtyStr = qty.toFixed(qDec);
          const addSide = pos === "long" ? "BUY" : "SELL";
          const res = await place(addSide, qtyStr, false);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "add", inst_id: instId, side: addSide.toLowerCase(), ord_type: "market", sz: qtyStr, ok: false, result: res.r, note: `[${asset}] falha ao adicionar (pirâmide)` }); await log("error", `[${asset}] Falha ao adicionar ${lbl(pos)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg }; }
          const filled = res.fz ?? Number(qtyStr); const addPx = res.ap ?? lastPx;
          const newSz = st.pos_base_sz + filled;
          const newEntry = st.entry_px != null && st.pos_base_sz > 0 ? (st.entry_px * st.pos_base_sz + addPx * filled) / newSz : addPx;
          const nAdds = st.adds + 1;
          const addStopDist = cfg.stop_atr_on && atrPx > 0 ? Number(cfg.stop_atr_mult ?? 4) * atrPx : newEntry * Number(cfg.stop_pct ?? 1.5) / 100;
          const addStop = pos === "long" ? newEntry - addStopDist : newEntry + addStopDist; // trava o stop no novo médio (ATR ou %)
          const addPeak = pos === "long" ? Math.max(st.peak_px ?? newEntry, lastPx) : Math.min(st.peak_px ?? newEntry, lastPx); // preserva o pico do trailing na pirâmide
          await savePos(asset, instId, pos, Number(newSz.toFixed(qDec)), newEntry, nAdds, addStop, false, addPeak); // guarda o tamanho limpo (sem ruído de float)
          await admin.from("bot_orders").insert({ source: "auto", action: "add", inst_id: instId, side: addSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: addPx, fill_sz: res.fz, ok: true, result: res.r, note: `[${asset}] pirâmide ${nAdds}/${pyramidMax} em ${lbl(pos)} · médio @ ${newEntry.toFixed(2)} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
          await log("trade", `[${asset}] PIRÂMIDE ${nAdds}/${pyramidMax}: +${qtyStr} ${asset} em ${lbl(pos)}${addPx ? ` @ ${addPx}` : ""} · novo médio ${newEntry.toFixed(2)} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons}). ${top}`, { ...reading, status: res.r?.status });
          return { asset, decision: "add", ok: true, bias, conviction, avgPx: addPx, adds: nAdds };
        }

        // 1) Fecha posição atual (se houver). Arredonda ao stepSize (evita -1111 no total da pirâmide).
        if (pos !== "flat") {
          const closeSide = pos === "long" ? "SELL" : "BUY";
          const closeQty = roundStep(st.pos_base_sz).toFixed(qDec);
          const res = await place(closeSide, closeQty, true);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: closeQty, ok: false, result: res.r, note: `[${asset}] falha ao fechar` }); await log("error", `[${asset}] Falha ao fechar ${lbl(pos)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg }; }
          const exitPx = res.ap ?? lastPx;
          if (st.entry_px) pnl = (exitPx - st.entry_px) * Number(closeQty) * (pos === "long" ? 1 : -1);
          await savePos(asset, instId, "flat", 0, null);
          await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: closeQty, avg_px: res.ap ?? exitPx, fill_sz: res.fz, ok: true, result: res.r, pnl, note: `[${asset}] fechou ${lbl(pos)}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
          pos = "flat";
          openCount = Math.max(0, openCount - 1);
        }
        // 2) Abre o alvo (se não for ficar fora). Sizing por RISCO; contra-tendência arrisca metade.
        if (target !== "flat") {
          const wasFlat = st.position === "flat"; // posição NOVA (não é flip) → passa pelos circuit breakers
          if (wasFlat) {
            if (dayBlocked) { await log("info", `[${asset}] 🛑 circuit breaker: perda diária no limite (${dailyPnl.toFixed(2)} ${cfg.quote_ccy}) — sem novas entradas hoje.`, reading); return { asset, decision: "flat", skipped: "perda diária" }; }
            if (openCount >= maxPositions) { await log("info", `[${asset}] limite de ${maxPositions} posições simultâneas — não abre nova (${openCount} abertas).`, reading); return { asset, decision: "flat", skipped: "máx. posições" }; }
            if (st.stopped_at && (Date.now() - new Date(st.stopped_at).getTime()) < cooldownMs) { await log("info", `[${asset}] cooldown pós-stop ativo — aguarda antes de reabrir.`, reading); return { asset, decision: "flat", skipped: "cooldown" }; }
          }
          await bnb("POST", "/fapi/v1/leverage", { symbol: instId, leverage: Math.round(maxLev) }, bnbCreds, true);
          // STOP ESTRUTURAL (SMC price action): distância até a invalidação real (abaixo do OB / mínima
          // varrida no long; espelho no short). Fallback = ATR se o plano não trouxe stop. Base do sizing.
          const szMult = 1;
          const kStopFb = Number(cfg.stop_atr_mult ?? 3);
          const riskDist = (plan.stop != null ? Math.abs(lastPx - plan.stop) : kStopFb * atrPx) || (lastPx * 0.01);
          // SIZING POR RISCO: qty = risco($) ÷ distância-até-o-stop → cada trade arrisca riskPct% do patrimônio.
          // A alavancagem é só TETO: nunca deixa o nocional passar de equity × maxLev (não liquida antes do stop).
          const riskDollars = equity * (riskPct / 100) * szMult * riskMult; // riskMult = dose por moeda (BNB ½ até decisão de pausa)
          let qty = roundStep(riskDollars / riskDist);
          const capNotional = equity * maxLev / maxPositions; // aloca a margem entre até maxPositions posições (evita 1 comer tudo)
          if (qty * lastPx > capNotional) qty = roundStep(capNotional / lastPx);
          if (qty < minQty) qty = minQty;
          if (qty * lastPx < minNot) qty = roundStep(minNot / lastPx) + stepSz;
          const qtyStr = qty.toFixed(qDec);
          const openSide = target === "long" ? "BUY" : "SELL";
          const res = await place(openSide, qtyStr, false);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: instId, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, ok: false, result: res.r, note: `[${asset}] falha ao abrir` }); await log("error", `[${asset}] Falha ao abrir ${lbl(target)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg, pnl }; }
          const filled = res.fz ?? Number(qtyStr); const entryPx = res.ap ?? lastPx; const realNot = filled * entryPx;
          // STOP = nível estrutural do plano (senão entry ∓ riskDist). ALVO = próxima liquidez (take-profit),
          // OPCIONAL (cfg.target_on): desligado, a posição corre só com stop + trailing até sair/stopar (dono 03/jul).
          const stopPx = plan.stop != null ? plan.stop : (target === "long" ? entryPx - riskDist : entryPx + riskDist);
          const targetPx = cfg.target_on !== false ? plan.target : null;
          const usedLev = equity > 0 ? realNot / equity : 0;
          const stopBasis = plan.stop != null ? "estrutural" : `${kStopFb.toFixed(1)}×ATR`;
          await savePos(asset, instId, target, Number(filled.toFixed(qDec)), entryPx, 0, stopPx, isCounter, entryPx); // pico inicia na entrada (trailing parte daqui)
          await admin.from("bot_positions").update({ stopped_at: null, target_px: targetPx }).eq("asset", asset); // abriu → zera cooldown; grava alvo estrutural
          // Marca a zona de origem como usada (zone_once) — cap de 20 zonas por ativo.
          if (plan.zoneKey && target === plan.want) await admin.from("bot_positions").update({ used_zones: [...usedZones.filter((z) => z !== plan.zoneKey), plan.zoneKey].slice(-20) }).eq("asset", asset);
          openCount++;
          await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: instId, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: entryPx, fill_sz: res.fz, ok: true, result: res.r, note: `[${asset}] abriu ${lbl(target)} ${trendRel} ~$${realNot.toFixed(0)} (${usedLev.toFixed(1)}x · risco ${(riskPct * szMult).toFixed(2)}%) · stop ${stopPx.toFixed(2)} (${stopBasis})${targetPx != null ? ` · alvo ${targetPx.toFixed(2)}` : ""} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
          await log("trade", `[${asset}] ${target === "long" ? "LONG (compra)" : "SHORT (venda)"} ${trendRel} · ${qtyStr} ${asset} ~$${realNot.toFixed(0)} (${usedLev.toFixed(1)}x)${entryPx ? ` @ ${entryPx}` : ""} · stop @ ${stopPx.toFixed(2)}${targetPx != null ? ` · alvo ${targetPx.toFixed(2)}` : ""} · risco ${(equity * riskPct / 100 * szMult).toFixed(2)} ${cfg.quote_ccy} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · fechou anterior PnL ${pnl.toFixed(2)}` : ""}. ${top}`, { ...reading, status: res.r?.status });
          return { asset, decision: target, ok: true, bias, conviction, avgPx: entryPx, notional: realNot, pnl, counter: isCounter, stopPx };
        }
        await log("trade", `[${asset}] ${protExit ? "🛡️ SAÍDA DE PROTEÇÃO · " : ""}Saiu pra FORA · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${gate && protExit ? ` [${gate}]` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, reading);
        return { asset, decision: "flat", ok: true, bias, conviction, pnl, protExit };
      }

      return { asset, skipped: "venue não suportado (só binance)" };
    };

    // Roda cada moeda de forma independente; uma falha não derruba as outras.
    const results: unknown[] = [];
    for (const asset of ASSETS) {
      try { results.push(await processAsset(asset, instOf(asset))); }
      catch (e) { await log("error", `[${asset}] erro no processamento.`, { error: e instanceof Error ? e.message : String(e) }); results.push({ asset, error: e instanceof Error ? e.message : String(e) }); }
    }
    return json(200, { results });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
