// Edge Function: bot-run (v9) — robô FUTUROS multi-corretora: estrutura POR TIMEFRAME + fluxo.
// venue='binance' → Binance USDⓈ-M Futures TESTNET (long+short, BTCUSDT); a OKX bloqueia
// derivativos p/ conta BR (geo), então o executor de futuros é a Binance testnet. venue='okx'
// = legado (spot/swap). Opera nos DOIS lados: LONG no viés de alta, SHORT no de baixa (long/
// short/flat, alavancagem, tamanho em USDT → quantidade). Cérebro (SMC por TF + fluxo) idêntico.
// Cada timeframe (15m/30m/1H) lê a PRÓPRIA estrutura (SMC: swing/BOS/CHoCH, OB, premium/
// discount + momentum daquele TF) e VOTA. O robô conta o consenso (quantos TFs de compra ×
// venda). O fluxo (book, paredes/ímã, absorção, CVD-tendência, liquidações, gamma/HIRO,
// ETF, prêmio Coinbase) é "agora" e CONFIRMA. Só entra com consenso de TF + fluxo a favor;
// nunca compra no premium nem na faca caindo (salvo parede grande defendendo). Demo sempre.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OKX_BASE = "https://www.okx.com";
const SWING = 20;
const TFS = ["15m", "30m", "1H"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function hmacSha256B64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
interface Creds { key: string; secret: string; passphrase: string }
async function okx(method: "GET" | "POST", path: string, bodyObj: Record<string, unknown> | null, c: Creds) {
  const ts = new Date().toISOString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const sign = await hmacSha256B64(c.secret, ts + method + path + body);
  const r = await fetch(OKX_BASE + path, {
    method,
    headers: { "OK-ACCESS-KEY": c.key, "OK-ACCESS-SIGN": sign, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": c.passphrase, "x-simulated-trading": "1", "Content-Type": "application/json" },
    body: body || undefined,
  });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ════════ Binance USDⓈ-M Futures TESTNET (long+short; OKX bloqueia derivativos p/ BR) ════════
const BNB_BASE = "https://testnet.binancefuture.com";
const BNB_INTERVAL: Record<string, string> = { "15m": "15m", "30m": "30m", "1H": "1h" };
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

// ════════ Motor Smart Money (SMC) — portado de web/src/lib/smc.ts ════════
type Bias = "bullish" | "bearish";
interface Candle { time: number; open: number; high: number; low: number; close: number }
interface StructureBreak { time: number; price: number; type: "BOS" | "CHoCH"; bias: Bias; internal: boolean }
interface OrderBlock { top: number; bottom: number; mid: number; time: number; bias: Bias; internal: boolean }
interface LiquidityPool { price: number; side: "buy" | "sell"; count: number; time: number; swept: boolean; sweptRecently: boolean }
interface Zone { top: number; bottom: number }
interface SmcResult { price: number; atr: number; swingBias: Bias | null; internalBias: Bias | null; lastSwing: StructureBreak | null; orderBlocks: OrderBlock[]; liquidity: LiquidityPool[]; trailingTop: number; trailingBottom: number; premium: Zone; equilibrium: Zone; discount: Zone }

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
    orderBlocks, liquidity, trailingTop, trailingBottom, premium, equilibrium, discount,
  };
}

// ════════ Bias estrutural de UM timeframe (estrutura + momentum daquele TF) ════════
function structuralBias(smc: SmcResult | null, momTf: number): number {
  if (!smc) return 0;
  let n = 0, d = 0; const add = (score: number, w: number) => { n += score * w; d += w; };
  add(smc.swingBias === "bullish" ? 78 : smc.swingBias === "bearish" ? -78 : 0, 0.40);
  if (smc.lastSwing) add((smc.lastSwing.bias === "bullish" ? 1 : -1) * (smc.lastSwing.type === "CHoCH" ? 80 : 55), 0.20);
  let z = 0; if (smc.price <= smc.discount.top) z = 72; else if (smc.price >= smc.premium.bottom) z = -72; add(z, 0.18);
  const atr = smc.atr || smc.price * 0.01;
  const dem = smc.orderBlocks.filter((o) => o.bias === "bullish" && o.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
  const sup = smc.orderBlocks.filter((o) => o.bias === "bearish" && o.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
  const dDist = dem ? (smc.price - dem.mid) / atr : 99, sDist = sup ? (sup.mid - smc.price) / atr : 99;
  add(dDist < 1.5 && dDist <= sDist ? 55 : sDist < 1.5 && sDist < dDist ? -55 : 0, 0.10);
  add(clamp((momTf / 0.006) * 60), 0.12);
  return d ? Math.round(clamp(n / d)) : 0;
}

// ════════ Confluência: estrutura POR TF (15m/30m/1H) + fluxo ════════
interface Signal { key: string; group: string; label: string; score: number; weight: number; note: string }
interface TfRead { tf: string; smc: SmcResult | null; mom: number; bias: number }
const TFW: Record<string, number> = { "15m": 0.18, "30m": 0.16, "1H": 0.15 };
function computeReading(tfReads: TfRead[], p: any, imb: any[], walls: any[], spot: number, cvdSum: number | null) {
  const sig: Signal[] = [];
  const add = (key: string, group: string, label: string, weight: number, score: number, note: string) => sig.push({ key, group, label, weight, score: Math.round(clamp(score)), note });
  const der = p?.derivatives ?? {}, g = p?.gamma ?? {}, etf = p?.etf_flows ?? {};
  const mom = tfReads[0]?.mom ?? 0;
  let absScore = 0;

  // ── ESTRUTURA POR TIMEFRAME — cada TF vota (compra/venda) ──
  for (const t of tfReads) {
    if (!t.smc) continue;
    add(`tf_${t.tf}`, "Estrutura por TF", `Estrutura ${t.tf}`, TFW[t.tf] ?? 0.15, t.bias, `${t.smc.swingBias === "bullish" ? "alta" : t.smc.swingBias === "bearish" ? "baixa" : "neutra"}${t.smc.lastSwing ? ` · ${t.smc.lastSwing.type}` : ""}${t.smc.price <= t.smc.discount.top ? " · discount" : t.smc.price >= t.smc.premium.bottom ? " · premium" : ""}`);
  }

  // ── MICROESTRUTURA: book + paredes/ímã + ABSORÇÃO (estado atual do mercado) ──
  const byEx: Record<string, any> = {};
  for (const r of imb) if (!byEx[r.exchange]) byEx[r.exchange] = r;
  const cb = byEx["coinbase"];
  if (cb) { const bid = Number(cb.bid_wide_usd || cb.bid_near_usd || 0), ask = Number(cb.ask_wide_usd || cb.ask_near_usd || 0); if (bid + ask > 0) { const r = (bid - ask) / (bid + ask); add("book_inst", "Microestrutura", "Book institucional (Coinbase)", 0.09, r * 150, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((bid / (bid + ask)) * 100)}% bid`); } }
  let rbid = 0, rask = 0;
  for (const ex of ["binance", "okx"]) { const r = byEx[ex]; if (r) { rbid += Number(r.bid_near_usd || 0); rask += Number(r.ask_near_usd || 0); } }
  if (rbid + rask > 0) { const r = (rbid - rask) / (rbid + rask); add("book_retail", "Microestrutura", "Book varejo (Binance+OKX)", 0.04, r * 140, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((rbid / (rbid + rask)) * 100)}% bid`); }
  if (spot > 0 && walls.length) {
    const agg: Record<string, number> = {};
    for (const w of walls) { const k = w.side + ":" + Math.round(Number(w.price)); agg[k] = (agg[k] || 0) + Number(w.notional_usd || 0); }
    let barSup = 0, barRes = 0, barSupPx = 0, barResPx = 0, farBelow = 0, farAbove = 0;
    let bestN = 0, bestSide = "", bestPx = 0, bestDist = 9;
    for (const k in agg) {
      const [side, pstr] = k.split(":"); const price = Number(pstr), nn = agg[k]; const distPct = Math.abs(price - spot) / spot * 100;
      if (distPct <= 0.7 && nn > bestN) { bestN = nn; bestSide = side; bestPx = price; bestDist = distPct; }
      if (distPct > 4) continue;
      if (distPct <= 1.0) { const pull = nn / Math.max(distPct, 0.1); if (side === "bid" && price < spot && pull > barSup) { barSup = pull; barSupPx = price; } if (side === "ask" && price > spot && pull > barRes) { barRes = pull; barResPx = price; } }
      else { if (side === "bid" && price < spot) farBelow += nn; if (side === "ask" && price > spot) farAbove += nn; }
    }
    let absNote = "sem parede grande sendo testada";
    if (bestN >= 4e6) {
      const prox = 1 - bestDist / 0.7, mag = Math.min(bestN / 15e6, 1);
      const strength = 40 + 60 * mag * prox;
      if (bestSide === "bid") { absScore = strength; absNote = `parede de COMPRA $${(bestN / 1e6).toFixed(1)}M defendendo ~$${Math.round(bestPx / 1000)}k → bounce provável`; }
      else { absScore = -strength; absNote = `parede de VENDA $${(bestN / 1e6).toFixed(1)}M barrando ~$${Math.round(bestPx / 1000)}k → rejeição provável`; }
    }
    add("absorb", "Microestrutura", "Teste de parede (absorção)", 0.13, absScore, absNote);
    if (barSup > 0 || barRes > 0) { const r = (barSup - barRes) / (barSup + barRes || 1); add("walls", "Microestrutura", "Paredes (barreira imediata)", 0.10, r * 110, `${barRes >= barSup ? "resistência" : "suporte"} domina perto${barResPx ? " · res $" + Math.round(barResPx / 1000) + "k" : ""}${barSupPx ? " · sup $" + Math.round(barSupPx / 1000) + "k" : ""}`); }
    if (farBelow > 0 || farAbove > 0) { const r = (farAbove - farBelow) / (farAbove + farBelow || 1); add("magnet", "Microestrutura", "Ímã de liquidez (book)", 0.08, r * 100, `maior liquidez ${farBelow > farAbove ? "ABAIXO" : "ACIMA"} ($${(Math.max(farBelow, farAbove) / 1e6).toFixed(1)}M) — preço tende a buscá-la`); }
  }

  // ── FLUXO / OPÇÕES / INSTITUCIONAL (estado atual) ──
  if (cvdSum != null) add("cvd", "Fluxo", "CVD agregado (~30 min)", 0.09, (cvdSum / 2500000) * 70, `${cvdSum >= 0 ? "compra" : "venda"} líquida $${Math.abs(cvdSum / 1e6).toFixed(1)}M em ~30 min`);
  const llq = N(der.liq_long_usd) ?? 0, lshq = N(der.liq_short_usd) ?? 0;
  if (llq + lshq > 0) add("liqs", "Fluxo", "Liquidações", 0.06, ((lshq - llq) / (llq + lshq)) * 85, llq > lshq ? `longs liquidados $${(llq / 1e6).toFixed(1)}M — venda forçada` : `shorts liquidados $${(lshq / 1e6).toFixed(1)}M — compra forçada`);
  const pw = N(g.put_wall), cw = N(g.call_wall);
  if (pw != null && cw != null && cw > pw && spot > 0) { const posPct = (spot - pw) / (cw - pw); add("gamma", "Opções", "Posição vs Put/Call Wall", 0.05, (0.5 - posPct) * 120, `${Math.round(posPct * 100)}% entre Put $${Math.round(pw / 1000)}k e Call $${Math.round(cw / 1000)}k`); }
  const gex = N(g.net_gex_spot);
  if (gex != null && mom !== 0) { const amp = (g.regime === "negative" || gex < 0) ? Math.sign(mom) : -Math.sign(mom); add("gflow", "Opções", "Fluxo de gamma (HIRO)", 0.07, amp * Math.min(Math.abs(gex) / 30e6, 1) * 55, `${g.regime === "negative" || gex < 0 ? "γ negativo amplifica" : "γ positivo amortece"} · GEX ${(gex / 1e6).toFixed(1)}M · ${amp >= 0 ? "a favor da alta" : "a favor da baixa"}`); }
  const cbp = N(p?.coinbase_premium);
  if (cbp != null) add("cb_prem", "Institucional", "Prêmio Coinbase", 0.05, cbp * 100 * 60, `${cbp >= 0 ? "+" : ""}${(cbp * 100).toFixed(3)}%`);
  const ef = N(etf.net_flow_usd), streak = N(etf.streak_days);
  if (ef != null) add("etf", "Institucional", "Fluxo de ETF", 0.07, (ef / 300e6) * 70, `${ef >= 0 ? "entrada" : "saída"} $${Math.abs(ef / 1e6).toFixed(0)}M${streak != null ? ` · ${streak}d` : ""}`);

  void der;
  let num = 0, den = 0;
  for (const x of sig) { num += x.score * x.weight; den += x.weight; }
  const bias = den ? Math.round(clamp(num / den)) : 0;
  const voting = sig.filter((x) => Math.abs(x.score) > 8);
  const agree = voting.filter((x) => Math.sign(x.score) === Math.sign(bias)).length;
  const conviction = voting.length ? Math.round((agree / voting.length) * 100) : 0;
  return { bias, conviction, signals: sig, absScore: Math.round(absScore) };
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

  const venue = String(cfg.venue ?? "okx");
  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };
  const bnbCreds: BnbCreds = { key: secrets.binance_test_key ?? "", secret: secrets.binance_test_secret ?? "" };
  if (venue === "binance") { if (!bnbCreds.key || !bnbCreds.secret) { await log("error", "Sem chaves da Binance testnet."); return json(400, { error: "sem credenciais binance" }); } }
  else if (!creds.key || !creds.secret || !creds.passphrase) { await log("error", "Sem credenciais da OKX demo."); return json(400, { error: "sem credenciais" }); }

  try {
    const base = cfg.base_ccy;
    const [{ data: snaps }, { data: imbRows }, { data: wallRows }] = await Promise.all([
      admin.from("market_snapshot").select("payload, ts").eq("asset", base).order("ts", { ascending: false }).limit(6),
      admin.from("orderbook_imbalance").select("exchange, bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(30),
      admin.from("orderbook_walls").select("side, price, notional_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(80),
    ]);
    const snap = (snaps ?? [])[0];
    if (!snap?.payload) { await log("warn", `Sem snapshot de ${base} — robô aguardando dados.`); return json(200, { skipped: "sem dados de mercado" }); }
    let cvdSum: number | null = null;
    for (const s of (snaps ?? [])) { const pr = (s.payload as any)?.price ?? {}; for (const ex of ["binance", "okx", "coinbase"]) { const v = N(pr?.[ex]?.cvd); if (v != null) cvdSum = (cvdSum ?? 0) + v; } }

    // Preço + velas por TF (Binance futures testnet ou OKX), normalizados p/ [time,o,h,l,c].
    let lastPx = 0;
    let candleRows: string[][][] = [];
    if (venue === "binance") {
      const tkb = await bnb("GET", "/fapi/v1/ticker/price", { symbol: cfg.inst_id }, bnbCreds, false);
      lastPx = Number(tkb.body?.price) || Number((snap.payload as any)?.gamma?.spot_price) || 0;
      const sets = await Promise.all(TFS.map((tf) => bnb("GET", "/fapi/v1/klines", { symbol: cfg.inst_id, interval: BNB_INTERVAL[tf] ?? "1h", limit: 300 }, bnbCreds, false)));
      candleRows = sets.map((s) => ((s.body as any[]) ?? []).map((r) => [String(r[0]), String(r[1]), String(r[2]), String(r[3]), String(r[4])]));
    } else {
      const tk = await okx("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(cfg.inst_id)}`, null, creds);
      lastPx = Number((tk.data as { last?: string }[])?.[0]?.last) || Number((snap.payload as any)?.gamma?.spot_price) || 0;
      const sets = await Promise.all(TFS.map((tf) => okx("GET", `/api/v5/market/candles?instId=${encodeURIComponent(cfg.inst_id)}&bar=${tf}&limit=300`, null, creds)));
      candleRows = sets.map((s) => ((s.data as string[][]) ?? []).slice().reverse().map((r) => [r[0], r[1], r[2], r[3], r[4]]));
    }
    // Estrutura por TF: cada timeframe lê a sua + momentum dele.
    const tfReads: TfRead[] = TFS.map((tf, i) => {
      const cs: Candle[] = (candleRows[i] ?? []).map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));
      const smc = cs.length >= 30 ? computeSmc(cs, SWING) : null;
      const cl = cs.map((c) => c.close);
      const mom = cl.length >= 4 ? (cl[cl.length - 1] - cl[cl.length - 4]) / cl[cl.length - 4] : 0;
      return { tf, smc, mom, bias: structuralBias(smc, mom) };
    });
    const primary = tfReads[0];
    const bull = tfReads.filter((t) => t.bias >= 12).length, bear = tfReads.filter((t) => t.bias <= -12).length;

    const walls = (wallRows ?? []).filter((w) => w.ts === (wallRows ?? [])[0]?.ts);
    const { bias, conviction, signals, absScore } = computeReading(tfReads, snap.payload, imbRows ?? [], walls, lastPx, cvdSum);

    // ── DIREÇÃO DESEJADA (futuros: long/short/flat; banda neutra mantém posição) ──
    const isSwapOkx = String(cfg.inst_id).toUpperCase().endsWith("-SWAP");
    const fut = venue === "binance" || isSwapOkx; // opera short?
    let pos: "long" | "short" | "flat" = cfg.position === "long" ? "long" : cfg.position === "short" ? "short" : "flat";
    const total = tfReads.length;
    let want: "long" | "short" | null = bias >= cfg.buy_threshold ? "long" : bias <= -cfg.sell_threshold ? "short" : null;
    let gate = "";
    if (want === "long") {
      if (primary.mom < -0.003) { gate = `caindo ${(primary.mom * 100).toFixed(2)}% agora`; want = null; }
      else if (primary.smc && primary.smc.price >= primary.smc.premium.bottom) { gate = "preço no premium (caro)"; want = null; }
      else if (bear > bull && absScore < 55) { gate = `${bear}/${total} TFs de baixa sem parede defendendo`; want = null; }
    } else if (want === "short") {
      if (!fut) { gate = "spot não faz short — use futuros"; want = null; }
      else if (primary.mom > 0.003) { gate = `subindo ${(primary.mom * 100).toFixed(2)}% agora`; want = null; }
      else if (primary.smc && primary.smc.price <= primary.smc.discount.top) { gate = "preço no discount (barato)"; want = null; }
      else if (bull > bear && absScore > -55) { gate = `${bull}/${total} TFs de alta sem parede barrando`; want = null; }
    }
    // Alvo: futuros mantém na zona neutra; spot precisa SAIR do long quando vira baixa (não shorta).
    let target: "long" | "short" | "flat" = want ?? pos;
    if (!fut) { if (target === "short") target = "flat"; if (pos === "long" && bias <= -cfg.sell_threshold) target = "flat"; }

    const decision = !cfg.enabled ? "preview" : target === pos ? "hold" : target;
    const structure = { consensus: { bull, bear, total }, perTf: tfReads.map((t) => ({ tf: t.tf, bias: t.bias, swing: t.smc?.swingBias ?? null })), zone: primary.smc ? (primary.smc.price <= primary.smc.discount.top ? "discount" : primary.smc.price >= primary.smc.premium.bottom ? "premium" : "equilíbrio") : null };
    const reading = { bias, conviction, signals, spot: lastPx, mom: primary.mom, absScore, structure, want: target, position: pos, leverage: Number(cfg.leverage), futures: fut, venue, gate: gate || null, ts: new Date().toISOString() };
    await admin.from("bot_config").update({ last_bias: bias, last_conviction: conviction, last_decision: decision, last_reading: reading, last_run: new Date().toISOString() }).eq("id", 1);

    const top = signals.slice().sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3).map((s) => `${s.label} ${s.score >= 0 ? "+" : ""}${s.score}`).join(", ");
    const cons = `consenso ${bull}↑/${bear}↓`;
    const lbl = (d: string) => d === "long" ? "LONG" : d === "short" ? "SHORT" : "fora";

    // Preview (desligado) ou alvo == posição atual → não opera.
    if (!cfg.enabled || target === pos) {
      const head = !cfg.enabled
        ? `Preview: viés ${bias >= 0 ? "+" : ""}${bias} (${cons}) → ${target === pos ? "manteria " + lbl(pos) : "abriria " + lbl(target)}${gate ? ` [${gate}]` : ""}`
        : `Leitura: viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%, ${cons}) → mantém ${lbl(pos)}${gate ? ` [segurou: ${gate}]` : ""}`;
      await log("info", `${head}. ${top}`, reading);
      return json(200, { decision: !cfg.enabled ? "preview" : "hold", bias, conviction, signals, structure });
    }

    // ════════ EXECUÇÃO — BINANCE FUTURES TESTNET (long/short, tamanho em USDT) ════════
    if (venue === "binance") {
      const info = await bnb("GET", "/fapi/v1/exchangeInfo", {}, bnbCreds, false);
      const symInfo = ((info.body?.symbols as any[]) ?? []).find((s) => s.symbol === cfg.inst_id) ?? {};
      const lot = ((symInfo.filters as any[]) ?? []).find((f) => f.filterType === "LOT_SIZE") ?? {};
      const notf = ((symInfo.filters as any[]) ?? []).find((f) => f.filterType === "MIN_NOTIONAL") ?? {};
      const stepSz = Number(lot.stepSize) || 0.001, minQty = Number(lot.minQty) || 0.001, minNot = Number(notf.notional) || 100;
      const ss = String(stepSz); const qDec = ss.includes(".") ? ss.replace(/0+$/, "").split(".")[1].length : 0;
      const roundStep = (q: number) => Math.floor(q / stepSz) * stepSz;
      const place = async (side: "BUY" | "SELL", qty: string, reduceOnly: boolean) => {
        const params: Record<string, string | number | boolean> = { symbol: cfg.inst_id, side, type: "MARKET", quantity: qty, newOrderRespType: "RESULT" };
        if (reduceOnly) params.reduceOnly = true;
        const r = await bnb("POST", "/fapi/v1/order", params, bnbCreds, true);
        const okk = !!r.body?.orderId && r.body?.status !== "REJECTED" && !r.body?.code;
        return { r: r.body, okk, ap: Number(r.body?.avgPrice) || null, fz: Number(r.body?.executedQty) || null, sMsg: r.body?.msg ?? null };
      };
      let pnl: number | null = null;
      // 1) Fecha posição atual (se houver).
      if (pos !== "flat") {
        const closeSide = pos === "long" ? "SELL" : "BUY";
        const res = await place(closeSide, String(cfg.pos_base_sz), true);
        if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: cfg.inst_id, side: closeSide.toLowerCase(), ord_type: "market", sz: String(cfg.pos_base_sz), ok: false, result: res.r, note: "falha ao fechar" }); await log("error", `Falha ao fechar ${lbl(pos)}: ${res.sMsg}`, reading); return json(200, { decision: "error", error: res.sMsg }); }
        const exitPx = res.ap ?? lastPx;
        if (cfg.entry_px) pnl = (exitPx - Number(cfg.entry_px)) * Number(cfg.pos_base_sz) * (pos === "long" ? 1 : -1);
        await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1);
        await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: cfg.inst_id, side: closeSide.toLowerCase(), ord_type: "market", sz: String(cfg.pos_base_sz), avg_px: res.ap, fill_sz: res.fz, ok: true, result: res.r, note: `fechou ${lbl(pos)}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
        pos = "flat";
      }
      // 2) Abre o alvo (se não for ficar fora).
      if (target !== "flat") {
        await bnb("POST", "/fapi/v1/leverage", { symbol: cfg.inst_id, leverage: Math.round(Number(cfg.leverage)) }, bnbCreds, true);
        const notionalWanted = Number(cfg.order_quote_sz) * Number(cfg.leverage);
        let qty = roundStep(notionalWanted / lastPx);
        if (qty < minQty) qty = minQty;
        if (qty * lastPx < minNot) qty = roundStep(minNot / lastPx) + stepSz;
        const qtyStr = qty.toFixed(qDec);
        const openSide = target === "long" ? "BUY" : "SELL";
        const res = await place(openSide, qtyStr, false);
        if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: cfg.inst_id, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, ok: false, result: res.r, note: "falha ao abrir" }); await log("error", `Falha ao abrir ${lbl(target)}: ${res.sMsg}`, reading); return json(200, { decision: "error", error: res.sMsg, pnl }); }
        const filled = res.fz ?? Number(qtyStr); const entryPx = res.ap ?? lastPx; const realNot = filled * entryPx;
        await admin.from("bot_config").update({ position: target, pos_base_sz: filled, entry_px: entryPx }).eq("id", 1);
        await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: cfg.inst_id, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: res.ap, fill_sz: res.fz, ok: true, result: res.r, note: `abriu ${lbl(target)} ~$${realNot.toFixed(0)} (${cfg.leverage}x) · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
        await log("trade", `${target === "long" ? "LONG (compra)" : "SHORT (venda)"} aberto · ${qtyStr} ${cfg.base_ccy} ~$${realNot.toFixed(0)}${entryPx ? ` @ ${entryPx}` : ""} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · fechou anterior PnL ${pnl.toFixed(2)}` : ""}. ${top}`, { ...reading, status: res.r?.status });
        return json(200, { decision: target, ok: true, bias, conviction, avgPx: entryPx, notional: realNot, pnl, signals, structure });
      }
      await log("trade", `Saiu pra FORA · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, reading);
      return json(200, { decision: "flat", ok: true, bias, conviction, pnl, signals, structure });
    }

    // ── EXECUÇÃO OKX (legado spot/swap) ──
    const isSwap = isSwapOkx;
    // Spec do contrato p/ converter USDT → nº de contratos.
    let ctVal = 1, lotSz = 0.000001, minSz = 0, szDec = 6;
    if (isSwap) {
      const inst = await okx("GET", `/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(cfg.inst_id)}`, null, creds);
      const spec = ((inst.data as Record<string, string>[]) ?? [])[0] ?? {};
      ctVal = Number(spec.ctVal) || 0.01; lotSz = Number(spec.lotSz) || 0.1; minSz = Number(spec.minSz) || lotSz;
      szDec = (String(lotSz).split(".")[1] || "").length;
    }
    const place = async (side: "buy" | "sell", sz: string, reduceOnly: boolean) => {
      const body: Record<string, unknown> = isSwap
        ? { instId: cfg.inst_id, tdMode: cfg.mgn_mode, side, ordType: "market", sz, ...(reduceOnly ? { reduceOnly: true } : {}) }
        : { instId: cfg.inst_id, tdMode: "cash", side, ordType: "market", sz };
      const r = await okx("POST", "/api/v5/trade/order", body, creds);
      const okk = String(r.code ?? "") === "0";
      const oid = (r.data as { ordId?: string }[])?.[0]?.ordId;
      let ap: number | null = null, fz: number | null = null;
      if (okk && oid) { const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(cfg.inst_id)}&ordId=${oid}`, null, creds); const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0]; ap = d?.avgPx ? Number(d.avgPx) : null; fz = d?.accFillSz ? Number(d.accFillSz) : null; }
      const sMsg = (r.data as { sMsg?: string }[])?.[0]?.sMsg ?? r.msg;
      return { r, okk, ap, fz, sMsg };
    };

    let pnl: number | null = null;
    // 1) Fecha posição atual (se houver).
    if (pos !== "flat") {
      const closeSide = pos === "long" ? "sell" : "buy";
      const res = await place(closeSide, String(cfg.pos_base_sz), true);
      if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: cfg.inst_id, side: closeSide, ord_type: "market", sz: String(cfg.pos_base_sz), ok: false, result: res.r, note: "falha ao fechar" }); await log("error", `Falha ao fechar ${lbl(pos)}: ${res.sMsg}`, reading); return json(200, { decision: "error", error: res.sMsg }); }
      const exitPx = res.ap ?? lastPx;
      if (cfg.entry_px) pnl = (exitPx - Number(cfg.entry_px)) * Number(cfg.pos_base_sz) * (isSwap ? ctVal : 1) * (pos === "long" ? 1 : -1);
      await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1);
      await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: cfg.inst_id, side: closeSide, ord_type: "market", sz: String(cfg.pos_base_sz), avg_px: res.ap, fill_sz: res.fz, ok: true, result: res.r, note: `fechou ${lbl(pos)}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
      pos = "flat";
    }
    // 2) Abre o alvo (se não for ficar fora).
    if (target !== "flat") {
      if (isSwap) await okx("POST", "/api/v5/account/set-leverage", { instId: cfg.inst_id, lever: String(cfg.leverage), mgnMode: cfg.mgn_mode }, creds);
      let sz: string, notional = Number(cfg.order_quote_sz);
      if (isSwap) {
        notional = Number(cfg.order_quote_sz) * Number(cfg.leverage);
        let contracts = Math.floor((notional / (lastPx * ctVal)) / lotSz) * lotSz;
        if (contracts < minSz) contracts = minSz;
        sz = contracts.toFixed(szDec); notional = contracts * lastPx * ctVal;
      } else { sz = String(cfg.order_quote_sz); }
      const openSide = target === "long" ? "buy" : "sell";
      const res = await place(openSide, sz, false);
      if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: cfg.inst_id, side: openSide, ord_type: "market", sz, ok: false, result: res.r, note: "falha ao abrir" }); await log("error", `Falha ao abrir ${lbl(target)}: ${res.sMsg}`, reading); return json(200, { decision: "error", error: res.sMsg, pnl }); }
      await admin.from("bot_config").update({ position: target, pos_base_sz: res.fz ?? Number(sz), entry_px: res.ap ?? lastPx }).eq("id", 1);
      await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: cfg.inst_id, side: openSide, ord_type: "market", sz, avg_px: res.ap, fill_sz: res.fz, ok: true, result: res.r, note: `abriu ${lbl(target)} ~$${notional.toFixed(0)}${isSwap ? ` (${cfg.leverage}x)` : ""} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
      await log("trade", `${target === "long" ? "LONG (compra)" : "SHORT (venda)"} aberto · ${sz}${isSwap ? ` ct ~$${notional.toFixed(0)}` : ` ${cfg.quote_ccy}`}${res.ap ? ` @ ${res.ap}` : ""} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · fechou anterior PnL ${pnl.toFixed(2)}` : ""}. ${top}`, { ...reading, code: res.r.code, msg: res.r.msg });
      return json(200, { decision: target, ok: true, bias, conviction, avgPx: res.ap, notional, pnl, signals, structure });
    }
    // target === flat: já fechou acima.
    await log("trade", `Saiu pra FORA · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, reading);
    return json(200, { decision: "flat", ok: true, bias, conviction, pnl, signals, structure });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
