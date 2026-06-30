// Edge Function: bot-run (v6) — robô OKX demo: SMART MONEY (estrutura) + FLUXO, INTRADAY.
// Análise multi-timeframe (15m primário + 30m/1H top-down) com o motor SMC nas velas OKX +
// confluência de fluxo (book, paredes/ímã, ABSORÇÃO de parede, CVD-tendência, gamma, ETF,
// prêmio Coinbase). Só opera quando estrutura/topo-down concordam OU há parede grande
// defendendo (bounce) — e nunca compra no premium nem na faca caindo. Demo sempre.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OKX_BASE = "https://www.okx.com";
const SWING = 20;
const TFS = ["15m", "30m", "1H"]; // 15m primário + top-down

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

// ════════ Motor Smart Money (SMC) — portado de web/src/lib/smc.ts (price action puro) ════════
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

// ════════ Confluência: SMC (estrutura, 15m + top-down) + fluxo ════════
interface Signal { key: string; group: string; label: string; score: number; weight: number; note: string }
function computeReading(smc: SmcResult | null, topDown: { tf: string; bias: Bias | null }[], p: any, imb: any[], walls: any[], spot: number, closes: number[], cvdSum: number | null) {
  const sig: Signal[] = [];
  const add = (key: string, group: string, label: string, weight: number, score: number, note: string) => sig.push({ key, group, label, weight, score: Math.round(clamp(score)), note });
  const der = p?.derivatives ?? {}, g = p?.gamma ?? {}, etf = p?.etf_flows ?? {};
  let absScore = 0;

  // ── ESTRUTURA (Smart Money) — espinha dorsal ──
  if (smc) {
    const sb = smc.swingBias === "bullish" ? 1 : smc.swingBias === "bearish" ? -1 : 0;
    if (sb !== 0) add("smc_trend", "Estrutura (SMC)", "Tendência de estrutura (15m)", 0.16, sb * 78, `swing ${smc.swingBias === "bullish" ? "de alta" : "de baixa"}${smc.internalBias ? ` · interna ${smc.internalBias === "bullish" ? "alta" : "baixa"}` : ""}`);
    if (smc.lastSwing) { const dir = smc.lastSwing.bias === "bullish" ? 1 : -1, ch = smc.lastSwing.type === "CHoCH"; add("smc_event", "Estrutura (SMC)", `Último evento (${smc.lastSwing.type})`, 0.10, dir * (ch ? 80 : 55), `${ch ? "mudança de caráter" : "rompimento"} ${dir > 0 ? "de alta" : "de baixa"}`); }
    let zs = 0, zl = "equilíbrio (meio do range)";
    if (smc.price <= smc.discount.top) { zs = 72; zl = "discount (barato) — zona de compra"; }
    else if (smc.price >= smc.premium.bottom) { zs = -72; zl = "premium (caro) — zona de venda"; }
    add("smc_zone", "Estrutura (SMC)", "Zona premium/discount", 0.12, zs, zl);
    const atr = smc.atr || spot * 0.01;
    const demand = smc.orderBlocks.filter((o) => o.bias === "bullish" && o.mid < smc.price).sort((a, b) => b.mid - a.mid)[0];
    const supply = smc.orderBlocks.filter((o) => o.bias === "bearish" && o.mid > smc.price).sort((a, b) => a.mid - b.mid)[0];
    const dDist = demand ? (smc.price - demand.mid) / atr : 99, sDist = supply ? (supply.mid - smc.price) / atr : 99;
    let obScore = 0, obNote = "sem order block relevante perto";
    if (dDist < 1.5 && dDist <= sDist) { obScore = 60; obNote = `em zona de demanda (OB) ~$${Math.round(demand!.mid / 1000)}k`; }
    else if (sDist < 1.5 && sDist < dDist) { obScore = -60; obNote = `sob oferta (OB) ~$${Math.round(supply!.mid / 1000)}k`; }
    else if (demand && dDist < sDist) { obScore = 22; obNote = `demanda abaixo ~$${Math.round(demand.mid / 1000)}k`; }
    else if (supply) { obScore = -22; obNote = `oferta acima ~$${Math.round(supply.mid / 1000)}k`; }
    add("smc_ob", "Estrutura (SMC)", "Order block (demanda × oferta)", 0.09, obScore, obNote);
    let liqScore = 0, liqNote = "sem varredura recente";
    const swBelow = smc.liquidity.find((l) => l.side === "sell" && l.sweptRecently), swAbove = smc.liquidity.find((l) => l.side === "buy" && l.sweptRecently);
    if (swBelow && smc.price > swBelow.price) { liqScore = 55; liqNote = "varreu liquidez abaixo (stop hunt) e recuperou — alta"; }
    else if (swAbove && smc.price < swAbove.price) { liqScore = -55; liqNote = "varreu liquidez acima e rejeitou — baixa"; }
    else { const pool = smc.liquidity.filter((l) => !l.swept).sort((a, b) => Math.abs(a.price - smc.price) - Math.abs(b.price - smc.price))[0]; if (pool) { liqScore = pool.price > smc.price ? 18 : -18; liqNote = `liquidez não varrida ${pool.price > smc.price ? "acima" : "abaixo"} ~$${Math.round(pool.price / 1000)}k (ímã)`; } }
    add("smc_liq", "Estrutura (SMC)", "Liquidez (varredura/ímã)", 0.07, liqScore, liqNote);
  }
  // Top-down: alinhamento 15m/30m/1H.
  if (topDown.length) {
    const net = topDown.reduce((s, t) => s + (t.bias === "bullish" ? 1 : t.bias === "bearish" ? -1 : 0), 0);
    add("top_down", "Estrutura (SMC)", "Top-down (15m/30m/1H)", 0.14, net * 30, topDown.map((t) => `${t.tf} ${t.bias === "bullish" ? "alta" : t.bias === "bearish" ? "baixa" : "—"}`).join(" · "));
  }

  // ── DIREÇÃO real do preço (momentum 15m) ──
  let mom = 0;
  if (closes.length >= 6) {
    const last = closes[closes.length - 1];
    const r6 = (last - closes[closes.length - 6]) / closes[closes.length - 6];
    mom = (last - closes[closes.length - 2]) / closes[closes.length - 2];
    add("dir", "Direção", "Direção do preço (real, 15m)", 0.12, (r6 / 0.02) * 70 + (mom / 0.008) * 45, `${r6 >= 0 ? "+" : ""}${(r6 * 100).toFixed(2)}% recente · ${mom >= 0 ? "subindo" : "caindo"} agora`);
  }

  // ── MICROESTRUTURA: book + paredes/ímã + ABSORÇÃO ──
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
    // Teste de parede (absorção): preço encostando numa parede GRANDE que defende → reação.
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

  // ── FLUXO / OPÇÕES / INSTITUCIONAL ──
  if (cvdSum != null) add("cvd", "Fluxo", "CVD agregado (~30 min)", 0.09, (cvdSum / 2500000) * 70, `${cvdSum >= 0 ? "compra" : "venda"} líquida $${Math.abs(cvdSum / 1e6).toFixed(1)}M em ~30 min`);
  const ll = N(der.liq_long_usd) ?? 0, lsh = N(der.liq_short_usd) ?? 0;
  if (ll + lsh > 0) add("liqs", "Fluxo", "Liquidações", 0.06, ((lsh - ll) / (ll + lsh)) * 85, ll > lsh ? `longs liquidados $${(ll / 1e6).toFixed(1)}M — venda forçada` : `shorts liquidados $${(lsh / 1e6).toFixed(1)}M — compra forçada`);
  const pw = N(g.put_wall), cw = N(g.call_wall);
  if (pw != null && cw != null && cw > pw && spot > 0) { const posPct = (spot - pw) / (cw - pw); add("gamma", "Opções", "Posição vs Put/Call Wall", 0.05, (0.5 - posPct) * 120, `${Math.round(posPct * 100)}% entre Put $${Math.round(pw / 1000)}k e Call $${Math.round(cw / 1000)}k`); }
  // Fluxo de gamma (proxy HIRO): em γ negativo os dealers amplificam a direção (vendem na queda).
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
  return { bias, conviction, signals: sig, mom, absScore: Math.round(absScore) };
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

  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };
  if (!creds.key || !creds.secret || !creds.passphrase) { await log("error", "Sem credenciais da OKX demo."); return json(400, { error: "sem credenciais" }); }

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

    const tk = await okx("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(cfg.inst_id)}`, null, creds);
    const lastPx = Number((tk.data as { last?: string }[])?.[0]?.last) || Number((snap.payload as any)?.gamma?.spot_price) || 0;

    // Multi-timeframe (15m primário + 30m/1H top-down).
    const candleSets = await Promise.all(TFS.map((tf) => okx("GET", `/api/v5/market/candles?instId=${encodeURIComponent(cfg.inst_id)}&bar=${tf}&limit=300`, null, creds)));
    const byTf = TFS.map((tf, i) => { const cs: Candle[] = ((candleSets[i].data as string[][]) ?? []).slice().reverse().map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4] })); return { tf, candles: cs, smc: cs.length >= 30 ? computeSmc(cs, SWING) : null }; });
    const smc = byTf[0].smc;
    const closes = byTf[0].candles.map((c) => c.close);
    const topDown = byTf.map((x) => ({ tf: x.tf, bias: x.smc?.swingBias ?? null }));
    const topDownNet = topDown.reduce((s, t) => s + (t.bias === "bullish" ? 1 : t.bias === "bearish" ? -1 : 0), 0);

    const walls = (wallRows ?? []).filter((w) => w.ts === (wallRows ?? [])[0]?.ts);
    const { bias, conviction, signals, mom, absScore } = computeReading(smc, topDown, snap.payload, imbRows ?? [], walls, lastPx, closes, cvdSum);

    const pos: "long" | "flat" = cfg.position === "long" ? "long" : "flat";
    const desired: "long" | "flat" | "neutral" = bias >= cfg.buy_threshold ? "long" : bias <= -cfg.sell_threshold ? "flat" : "neutral";

    let act: { side: "buy" | "sell"; sz: string } | null = null;
    if (desired === "long" && pos === "flat") act = { side: "buy", sz: String(cfg.order_quote_sz) };
    else if (desired === "flat" && pos === "long" && Number(cfg.pos_base_sz) > 0) act = { side: "sell", sz: String(cfg.pos_base_sz) };

    // GATE: nunca compra caindo nem no premium. Em estrutura de baixa, só compra se houver
    // PAREDE GRANDE defendendo (bounce confirmado) — senão segura.
    const structureDown = smc?.swingBias === "bearish" || topDownNet <= -2;
    let gate = "";
    if (act?.side === "buy") {
      if (mom < -0.003) { gate = ` (segurou: preço caindo ${(mom * 100).toFixed(2)}% agora)`; act = null; }
      else if (smc && smc.price >= smc.premium.bottom) { gate = " (segurou: preço no premium/caro)"; act = null; }
      else if (structureDown && absScore < 55) { gate = " (segurou: estrutura de baixa sem parede defendendo)"; act = null; }
    }

    const decision = !cfg.enabled ? "preview" : act ? act.side : "hold";
    const structure = smc ? { swingBias: smc.swingBias, internalBias: smc.internalBias, lastEvent: smc.lastSwing ? `${smc.lastSwing.type} ${smc.lastSwing.bias}` : null, zone: smc.price <= smc.discount.top ? "discount" : smc.price >= smc.premium.bottom ? "premium" : "equilíbrio", topDown } : null;
    const reading = { bias, conviction, signals, spot: lastPx, mom, absScore, structure, desired, position: pos, gate: gate || null, ts: new Date().toISOString() };
    await admin.from("bot_config").update({ last_bias: bias, last_conviction: conviction, last_decision: decision, last_reading: reading, last_run: new Date().toISOString() }).eq("id", 1);

    const top = signals.slice().sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3).map((s) => `${s.label} ${s.score >= 0 ? "+" : ""}${s.score}`).join(", ");
    if (!act) { await log("info", `Leitura: viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%) → ${pos === "long" ? "segura comprado" : "fora"}${gate}. ${top}`, reading); return json(200, { decision: "hold", bias, conviction, signals, structure }); }
    if (!cfg.enabled) { await log("info", `Preview: viés ${bias >= 0 ? "+" : ""}${bias} → ${act.side === "buy" ? "compraria" : "venderia"}. ${top}`, reading); return json(200, { decision: "preview", action: act, bias, conviction, signals, structure }); }

    const ordRes = await okx("POST", "/api/v5/trade/order", { instId: cfg.inst_id, tdMode: "cash", side: act.side, ordType: "market", sz: act.sz }, creds);
    const ok = String(ordRes.code ?? "") === "0";
    const ordId = (ordRes.data as { ordId?: string }[])?.[0]?.ordId;
    let avgPx: number | null = null, fillSz: number | null = null;
    if (ok && ordId) { const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(cfg.inst_id)}&ordId=${ordId}`, null, creds); const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0]; avgPx = d?.avgPx ? Number(d.avgPx) : null; fillSz = d?.accFillSz ? Number(d.accFillSz) : null; }
    let pnl: number | null = null;
    if (ok && act.side === "buy") { const baseSz = fillSz ?? Number(cfg.order_quote_sz) / lastPx; await admin.from("bot_config").update({ position: "long", pos_base_sz: baseSz, entry_px: avgPx ?? lastPx }).eq("id", 1); }
    else if (ok && act.side === "sell") { if (cfg.entry_px) pnl = ((avgPx ?? lastPx) - Number(cfg.entry_px)) * Number(cfg.pos_base_sz); await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1); }

    await admin.from("bot_orders").insert({ source: "auto", action: "order", inst_id: cfg.inst_id, side: act.side, ord_type: "market", sz: act.sz, avg_px: avgPx, fill_sz: fillSz, ok, result: ordRes, note: `viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%)${act.side === "sell" && pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
    await log(ok ? "trade" : "error", `${act.side === "buy" ? "COMPRA" : "VENDA"} ${ok ? "executada" : "falhou"} · viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%)${avgPx ? ` @ ${avgPx}` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, { ...reading, ordId, code: ordRes.code, msg: ordRes.msg });
    return json(200, { decision: act.side, ok, bias, conviction, avgPx, pnl, signals, structure });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
