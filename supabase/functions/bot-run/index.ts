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
const SWING = 20;
const TFS = ["15m", "30m", "1H"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// ════════ Binance USDⓈ-M Futures DEMO (long+short; OKX bloqueia derivativos p/ BR) ════════
// Demo Trading da Binance (demo.binance.com) — base de futuros = demo-fapi.binance.com.
// (Carteira de Futuros do demo é separada do Spot; abastecida via Reset na aba Futures.)
const BNB_BASE = "https://demo-fapi.binance.com";
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
function computeReading(tfReads: TfRead[], p: any, imb: any[], walls: any[], spot: number, cvdSum: number | null, pressWin: { label: string; bid: number; ask: number }[]) {
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
    add("absorb", "Microestrutura", "Teste de parede (absorção)", 0.13, absScore, absNote);
    const wTot = wSup + wRes;
    if (wTot > 0) { const r = (wSup - wRes) / wTot; add("walls", "Microestrutura", "Paredes de baleia (suporte × resistência)", 0.11, r * 120, `${r >= 0 ? "suporte" : "resistência"} ${Math.round((r >= 0 ? wSup : wRes) / wTot * 100)}% · $${(wSup / 1e6).toFixed(1)}M sup × $${(wRes / 1e6).toFixed(1)}M res`); }
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
    add("book_trend", "Microestrutura", "Pressão do book (tendência)", 0.05, clamp(accel * 600), `${accel >= 0 ? "compra" : "venda"} ganhando força · ${Math.round(recent * 100)}% bid agora vs ${Math.round(older * 100)}% antes`);
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

  // ════════ DECISÃO POR TIMEFRAME (voto 2-de-3) ════════
  // Cada TF tem um PLACAR próprio = estrutura daquele TF + a janela de pressão do book que
  // casa com o horizonte dele (15m↔30m, 30m↔12h, 1H↔48h). O fluxo "agora" (CVD, gamma, ETF,
  // paredes, absorção…) NÃO é por-TF → vira CONFIRMAÇÃO compartilhada (não dispara, mas veta).
  const winTilt = (label: string) => { const r = pressWin.find((x) => x.label === label); if (!r) return 0; const s = Number(r.bid) + Number(r.ask); return s > 0 ? (Number(r.bid) - Number(r.ask)) / s : 0; };
  const tfWindow: Record<string, string> = { "15m": "30m", "30m": "12h", "1H": "48h" };
  const perTf = tfReads.map((t) => {
    const pressure = Math.round(winTilt(tfWindow[t.tf] ?? "12h") * 100); // -100..100
    const composite = Math.round(clamp(0.6 * t.bias + 0.4 * pressure));
    return { tf: t.tf, bias: composite, structure: Math.round(t.bias), pressure, swing: t.smc?.swingBias ?? null };
  });

  // Fluxo compartilhado (tudo que é "agora", não por-TF) → confirmação/veto.
  const flowKeys = new Set(["book_inst", "book_retail", "absorb", "walls", "magnet", "book_trend", "cvd", "liqs", "gamma", "gflow", "cb_prem", "etf"]);
  let fn = 0, fd = 0;
  for (const x of sig) if (flowKeys.has(x.key)) { fn += x.score * x.weight; fd += x.weight; }
  const flowTilt = fd ? Math.round(clamp(fn / fd)) : 0;

  // Placar-resumo (média dos TFs) só p/ exibição; o VOTO 2-de-3 é decidido no handler
  // com os limiares configuráveis (buy_threshold/sell_threshold).
  const bias = perTf.length ? Math.round(perTf.reduce((s, t) => s + t.bias, 0) / perTf.length) : 0;
  return { bias, signals: sig, absScore: Math.round(absScore), perTf, flowTilt };
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

  const venue = String(cfg.venue ?? "binance");
  const bnbCreds: BnbCreds = { key: secrets.binance_test_key ?? "", secret: secrets.binance_test_secret ?? "" };
  if (!bnbCreds.key || !bnbCreds.secret) { await log("error", "Sem chaves da Binance testnet."); return json(400, { error: "sem credenciais binance" }); }

  try {
    // ════════ MULTI-MOEDA: no binance opera as 4 majors (dados completos). OKX legado = 1 ativo. ════════
    const ASSETS = venue === "binance" ? ["BTC", "ETH", "SOL", "BNB"] : [String(cfg.base_ccy)];
    const instOf = (asset: string) => venue === "binance" ? `${asset}${cfg.quote_ccy ?? "USDT"}` : String(cfg.inst_id);
    // Estado por-ativo em bot_positions (isolado); leitura espelhada em bot_config só p/ BTC (painel legado).
    const loadPos = async (asset: string) => {
      const { data } = await admin.from("bot_positions").select("position, pos_base_sz, entry_px, adds").eq("asset", asset).maybeSingle();
      return { position: (data?.position === "long" ? "long" : data?.position === "short" ? "short" : "flat") as "long" | "short" | "flat", pos_base_sz: Number(data?.pos_base_sz ?? 0), entry_px: data?.entry_px != null ? Number(data.entry_px) : null, adds: Number(data?.adds ?? 0) };
    };
    const savePos = async (asset: string, instId: string, position: string, pos_base_sz: number, entry_px: number | null, adds = 0) => {
      await admin.from("bot_positions").upsert({ asset, inst_id: instId, position, pos_base_sz, entry_px, adds, updated_at: new Date().toISOString() }, { onConflict: "asset" });
    };
    const saveReading = async (asset: string, patch: Record<string, unknown>) => {
      await admin.from("bot_positions").upsert({ asset, ...patch }, { onConflict: "asset" });
      if (asset === "BTC") await admin.from("bot_config").update(patch).eq("id", 1);
    };

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
      let cvdSum: number | null = null;
      for (const s of (snaps ?? [])) { const pr = (s.payload as any)?.price ?? {}; for (const ex of ["binance", "okx", "coinbase"]) { const v = N(pr?.[ex]?.cvd); if (v != null) cvdSum = (cvdSum ?? 0) + v; } }

      // Preço + velas por TF (Binance futures testnet), normalizados p/ [time,o,h,l,c].
      const tkb = await bnb("GET", "/fapi/v1/ticker/price", { symbol: instId }, bnbCreds, false);
      const lastPx = Number(tkb.body?.price) || Number((snap.payload as any)?.gamma?.spot_price) || 0;
      const sets = await Promise.all(TFS.map((tf) => bnb("GET", "/fapi/v1/klines", { symbol: instId, interval: BNB_INTERVAL[tf] ?? "1h", limit: 300 }, bnbCreds, false)));
      const candleRows: string[][][] = sets.map((s) => ((s.body as any[]) ?? []).map((r) => [String(r[0]), String(r[1]), String(r[2]), String(r[3]), String(r[4])]));
      // Estrutura por TF: cada timeframe lê a sua + momentum dele.
      const tfReads: TfRead[] = TFS.map((tf, i) => {
        const cs: Candle[] = (candleRows[i] ?? []).map((r) => ({ time: Math.floor(Number(r[0]) / 1000), open: +r[1], high: +r[2], low: +r[3], close: +r[4] }));
        const smc = cs.length >= 30 ? computeSmc(cs, SWING) : null;
        const cl = cs.map((c) => c.close);
        const mom = cl.length >= 4 ? (cl[cl.length - 1] - cl[cl.length - 4]) / cl[cl.length - 4] : 0;
        return { tf, smc, mom, bias: structuralBias(smc, mom) };
      });
      const primary = tfReads[0];

      const walls = (wallRows ?? []).filter((w) => w.ts === (wallRows ?? [])[0]?.ts);
      const { bias, signals, absScore, perTf, flowTilt } = computeReading(tfReads, snap.payload, imbRows ?? [], walls, lastPx, cvdSum, (pressRows as { label: string; bid: number; ask: number }[]) ?? []);

      // ── VOTO POR TIMEFRAME (2 de 3) + fluxo como confirmação ──
      const buyTh = Number(cfg.buy_threshold), sellTh = Number(cfg.sell_threshold);
      const longVotes = perTf.filter((t) => t.bias >= buyTh).length;
      const shortVotes = perTf.filter((t) => t.bias <= -sellTh).length;
      const bull = longVotes, bear = shortVotes, total = perTf.length;
      const conviction = total ? Math.round((Math.max(longVotes, shortVotes) / total) * 100) : 0;

      const isSwapOkx = String(instId).toUpperCase().endsWith("-SWAP");
      const fut = venue === "binance" || isSwapOkx; // opera short?
      const st = await loadPos(asset);
      let pos: "long" | "short" | "flat" = st.position;
      let want: "long" | "short" | null = (longVotes >= 2 && longVotes > shortVotes) ? "long" : (shortVotes >= 2 && shortVotes > longVotes) ? "short" : null;
      let gate = "";
      if (want === "long") {
        if (primary.mom < -0.003) { gate = `caindo ${(primary.mom * 100).toFixed(2)}% agora`; want = null; }
        else if (primary.smc && primary.smc.price >= primary.smc.premium.bottom) { gate = "preço no premium (caro)"; want = null; }
        else if (flowTilt < -35 && absScore < 55) { gate = `fluxo contra (${flowTilt}) sem parede defendendo`; want = null; }
      } else if (want === "short") {
        if (!fut) { gate = "spot não faz short — use futuros"; want = null; }
        else if (primary.mom > 0.003) { gate = `subindo ${(primary.mom * 100).toFixed(2)}% agora`; want = null; }
        else if (primary.smc && primary.smc.price <= primary.smc.discount.top) { gate = "preço no discount (barato)"; want = null; }
        else if (flowTilt > 35 && absScore > -55) { gate = `fluxo contra (+${flowTilt}) sem parede barrando`; want = null; }
      }
      let target: "long" | "short" | "flat" = want ?? pos;
      if (!fut) { if (target === "short") target = "flat"; if (pos === "long" && shortVotes >= 2) target = "flat"; }

      // PIRÂMIDE (opcional): novo sinal na MESMA direção da posição → adiciona (até pyramid_max).
      const pyramidMax = Number(cfg.pyramid_max ?? 2);
      const pyramidAdd = !!cfg.pyramid && fut && want != null && want === pos && st.adds < pyramidMax;

      const decision = !cfg.enabled ? "preview" : pyramidAdd ? "add" : target === pos ? "hold" : target;
      const structure = { consensus: { bull, bear, total }, perTf, flowTilt, zone: primary.smc ? (primary.smc.price <= primary.smc.discount.top ? "discount" : primary.smc.price >= primary.smc.premium.bottom ? "premium" : "equilíbrio") : null };
      const reading = { asset, bias, conviction, signals, spot: lastPx, mom: primary.mom, absScore, flowTilt, votes: { long: longVotes, short: shortVotes, total }, structure, want: target, position: pos, adds: st.adds, leverage: Number(cfg.leverage), futures: fut, venue, gate: gate || null, ts: new Date().toISOString() };
      await saveReading(asset, { last_bias: bias, last_conviction: conviction, last_decision: decision, last_reading: reading, last_run: new Date().toISOString() });

      const top = signals.slice().sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3).map((s) => `${s.label} ${s.score >= 0 ? "+" : ""}${s.score}`).join(", ");
      const cons = `consenso ${bull}↑/${bear}↓`;
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
          const r = await bnb("POST", "/fapi/v1/order", params, bnbCreds, true);
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
          await bnb("POST", "/fapi/v1/leverage", { symbol: instId, leverage: Math.round(Number(cfg.leverage)) }, bnbCreds, true);
          const notionalWanted = Number(cfg.order_quote_sz) * Number(cfg.leverage);
          let qty = roundStep(notionalWanted / lastPx);
          if (qty < minQty) qty = minQty;
          if (qty * lastPx < minNot) qty = roundStep(minNot / lastPx) + stepSz;
          const qtyStr = qty.toFixed(qDec);
          const addSide = pos === "long" ? "BUY" : "SELL";
          const res = await place(addSide, qtyStr, false);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "add", inst_id: instId, side: addSide.toLowerCase(), ord_type: "market", sz: qtyStr, ok: false, result: res.r, note: `[${asset}] falha ao adicionar (pirâmide)` }); await log("error", `[${asset}] Falha ao adicionar ${lbl(pos)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg }; }
          const filled = res.fz ?? Number(qtyStr); const addPx = res.ap ?? lastPx;
          const newSz = st.pos_base_sz + filled;
          const newEntry = st.entry_px != null && st.pos_base_sz > 0 ? (st.entry_px * st.pos_base_sz + addPx * filled) / newSz : addPx;
          const nAdds = st.adds + 1;
          await savePos(asset, instId, pos, newSz, newEntry, nAdds);
          await admin.from("bot_orders").insert({ source: "auto", action: "add", inst_id: instId, side: addSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: addPx, fill_sz: res.fz, ok: true, result: res.r, note: `[${asset}] pirâmide ${nAdds}/${pyramidMax} em ${lbl(pos)} · médio @ ${newEntry.toFixed(2)} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
          await log("trade", `[${asset}] PIRÂMIDE ${nAdds}/${pyramidMax}: +${qtyStr} ${asset} em ${lbl(pos)}${addPx ? ` @ ${addPx}` : ""} · novo médio ${newEntry.toFixed(2)} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons}). ${top}`, { ...reading, status: res.r?.status });
          return { asset, decision: "add", ok: true, bias, conviction, avgPx: addPx, adds: nAdds };
        }

        // 1) Fecha posição atual (se houver).
        if (pos !== "flat") {
          const closeSide = pos === "long" ? "SELL" : "BUY";
          const res = await place(closeSide, String(st.pos_base_sz), true);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: String(st.pos_base_sz), ok: false, result: res.r, note: `[${asset}] falha ao fechar` }); await log("error", `[${asset}] Falha ao fechar ${lbl(pos)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg }; }
          const exitPx = res.ap ?? lastPx;
          if (st.entry_px) pnl = (exitPx - st.entry_px) * st.pos_base_sz * (pos === "long" ? 1 : -1);
          await savePos(asset, instId, "flat", 0, null);
          await admin.from("bot_orders").insert({ source: "auto", action: "close", inst_id: instId, side: closeSide.toLowerCase(), ord_type: "market", sz: String(st.pos_base_sz), avg_px: res.ap ?? exitPx, fill_sz: res.fz, ok: true, result: res.r, pnl, note: `[${asset}] fechou ${lbl(pos)}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
          pos = "flat";
        }
        // 2) Abre o alvo (se não for ficar fora).
        if (target !== "flat") {
          await bnb("POST", "/fapi/v1/leverage", { symbol: instId, leverage: Math.round(Number(cfg.leverage)) }, bnbCreds, true);
          const notionalWanted = Number(cfg.order_quote_sz) * Number(cfg.leverage);
          let qty = roundStep(notionalWanted / lastPx);
          if (qty < minQty) qty = minQty;
          if (qty * lastPx < minNot) qty = roundStep(minNot / lastPx) + stepSz;
          const qtyStr = qty.toFixed(qDec);
          const openSide = target === "long" ? "BUY" : "SELL";
          const res = await place(openSide, qtyStr, false);
          if (!res.okk) { await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: instId, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, ok: false, result: res.r, note: `[${asset}] falha ao abrir` }); await log("error", `[${asset}] Falha ao abrir ${lbl(target)}: ${res.sMsg}`, reading); return { asset, decision: "error", error: res.sMsg, pnl }; }
          const filled = res.fz ?? Number(qtyStr); const entryPx = res.ap ?? lastPx; const realNot = filled * entryPx;
          await savePos(asset, instId, target, filled, entryPx);
          await admin.from("bot_orders").insert({ source: "auto", action: "open", inst_id: instId, side: openSide.toLowerCase(), ord_type: "market", sz: qtyStr, avg_px: entryPx, fill_sz: res.fz, ok: true, result: res.r, note: `[${asset}] abriu ${lbl(target)} ~$${realNot.toFixed(0)} (${cfg.leverage}x) · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})` });
          await log("trade", `[${asset}] ${target === "long" ? "LONG (compra)" : "SHORT (venda)"} aberto · ${qtyStr} ${asset} ~$${realNot.toFixed(0)}${entryPx ? ` @ ${entryPx}` : ""} · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · fechou anterior PnL ${pnl.toFixed(2)}` : ""}. ${top}`, { ...reading, status: res.r?.status });
          return { asset, decision: target, ok: true, bias, conviction, avgPx: entryPx, notional: realNot, pnl };
        }
        await log("trade", `[${asset}] Saiu pra FORA · viés ${bias >= 0 ? "+" : ""}${bias} (${cons})${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, reading);
        return { asset, decision: "flat", ok: true, bias, conviction, pnl };
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
