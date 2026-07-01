// Edge Function: market-read (Leitura do Mercado no servidor — Fase 2)
// Roda o NÚCLEO do motor de confluência (viés/convicção/regime) para TODAS as moedas
// (SMC_ASSETS) a cada ~30 min (cron), grava em `market_read` e dispara alerta
// (notifications) quando a moeda ENTRA num estado relevante ou VIRA de direção.
// Anti-spam em três camadas: (1) só notifica direção clara e com convicção; (2)
// barra MAIS ALTA para a cauda-longa (moedas só com price-action, sem snapshot);
// (3) cooldown por moeda (não re-alerta a mesma dentro da janela). Detecta a
// ENTRADA no estado relevante (não só a virada crua de tone) — pega também o
// movimento que rampa de fraco p/ forte sem trocar de tone. O front continua
// calculando a leitura COMPLETA (alvos, multi-timeframe, falsificador) ao vivo —
// aqui é só o que precisa de memória/alerta.
//
// MANTER EM SINCRONIA com web/src/lib/indicators/confluence.ts (pesos e regras do viés)
// e com web/src/lib/marketData.ts (lista SMC_ASSETS). Onda 1 sincronizada (29/jun):
// 6 forças que votam (Estrutura SMC enxuta inclusa); pesos trend .22/struct .18/
// mom .18/flow .25/pos .12/opt .10. Sentimento/liquidações/divergências são só do
// front (display) e NÃO entram no viés — por isso não estão aqui.
// Auth: header x-dispatch-secret == DISPATCH_SECRET. Deploy: --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";

// Universo completo (espelho de SMC_ASSETS). As 20 primeiras (CURATED) têm snapshot do
// coletor (leitura completa); as demais só price-action (velas) → tendência/momento.
const ASSETS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI",
  "TON", "POL", "DOT", "LTC", "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE",
  "TRX", "BCH", "NEAR", "APT", "ICP", "FIL", "ETC", "HBAR", "XLM", "IMX",
  "OP", "INJ", "VET", "GRT", "ALGO", "STX", "RENDER", "MKR", "SAND", "MANA",
  "AXS", "THETA", "XTZ", "EOS", "CHZ", "GALA", "CRV", "SNX", "COMP", "APE",
  "FLOW", "EGLD", "DYDX", "ENS", "SEI", "TIA", "WIF", "BONK", "JUP", "WLD",
  "ENA", "ORDI", "PENDLE", "FET", "RUNE", "KAVA", "ROSE", "ZEC", "DASH", "1INCH",
  "ZIL", "ENJ", "BAT", "QNT", "NEO", "IOTA", "KSM", "GMT", "JASMY", "MASK",
  "CFX", "AR", "ONDO", "TWT", "GMX", "SUSHI", "YFI", "ANKR", "CELO", "SKL",
  "LRC", "ONT", "RVN", "STORJ", "FLOKI", "PYTH", "JTO", "STRK", "BLUR", "W",
];

// Limiares de "movimentação interessante" por riqueza do dado:
//  • CURATED (snapshot completo: fluxo/opções/posição) → entra em |bias|>=25;
//  • cauda-longa (só price-action das velas) → barra MAIS ALTA (|bias|>=35), p/ não
//    notificar leitura fraca de moeda sem microestrutura.
// conviction>=50 em ambos; tom neutro nunca alerta. Ajustáveis por env.
const ENTER_CURATED = Number(Deno.env.get("MARKET_READ_ENTER_CURATED") ?? "25");
const ENTER_LONGTAIL = Number(Deno.env.get("MARKET_READ_ENTER_LONGTAIL") ?? "35");
const MIN_CONVICTION = Number(Deno.env.get("MARKET_READ_MIN_CONVICTION") ?? "50");
// Cooldown por moeda (horas) — anti-flapping em torno do limiar.
const COOLDOWN_H = Number(Deno.env.get("MARKET_READ_COOLDOWN_H") ?? "6");

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

// Direção do sinal "interessante" o bastante p/ alertar (-1/0/+1). 0 = sem
// movimento relevante (a leitura é gravada no histórico de qualquer forma).
const interestDir = (
  r: { tone: string; bias: number; conviction: number },
  curated: boolean,
): number => {
  if (r.tone === "neutral" || r.conviction < MIN_CONVICTION) return 0;
  const enter = curated ? ENTER_CURATED : ENTER_LONGTAIL;
  return Math.abs(r.bias) >= enter ? sign(r.bias) : 0;
};
const last = (a: number[]): number => {
  for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i];
  return NaN;
};
function ema(v: number[], p: number): number[] {
  if (!v.length) return [];
  const k = 2 / (p + 1);
  const o = [v[0]];
  for (let i = 1; i < v.length; i++) o.push(v[i] * k + o[i - 1] * (1 - k));
  return o;
}
function rsiLast(v: number[], p = 14): number {
  if (v.length <= p) return NaN;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= p; i++) {
    const c = v[i] - v[i - 1];
    if (c >= 0) g += c;
    else l -= c;
  }
  g /= p;
  l /= p;
  let r = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < v.length; i++) {
    const c = v[i] - v[i - 1];
    g = (g * (p - 1) + (c > 0 ? c : 0)) / p;
    l = (l * (p - 1) + (c < 0 ? -c : 0)) / p;
    r = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return r;
}
function macdHist(v: number[]): number {
  const ef = ema(v, 12);
  const es = ema(v, 26);
  const line = v.map((_, i) => ef[i] - es[i]);
  const sig = ema(line, 9);
  return line[line.length - 1] - sig[sig.length - 1];
}
interface C { high: number; low: number; close: number; }
function atrSeries(c: C[], p = 14): number[] {
  const out = new Array(c.length).fill(NaN);
  if (c.length <= p) return out;
  const tr: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const pc = c[i - 1].close;
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc)));
  }
  let prev = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p;
  out[p] = prev;
  for (let i = p + 1; i < c.length; i++) {
    prev = (prev * (p - 1) + tr[i]) / p;
    out[i] = prev;
  }
  return out;
}
function atrPercentile(c: C[], p = 14, win = 90): number {
  const arr = atrSeries(c, p);
  const a = last(arr);
  const valid = arr.slice(-win).filter((v) => Number.isFinite(v));
  if (!valid.length || !Number.isFinite(a)) return NaN;
  return (valid.filter((v) => v <= a).length / valid.length) * 100;
}
function adx(c: C[], period = 14): number {
  if (c.length < period * 2 + 1) return NaN;
  const pDM = [0];
  const mDM = [0];
  const tr = [0];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i - 1].high;
    const dn = c[i - 1].low - c[i].low;
    pDM.push(up > dn && up > 0 ? up : 0);
    mDM.push(dn > up && dn > 0 ? dn : 0);
    const pc = c[i - 1].close;
    tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - pc), Math.abs(c[i].low - pc)));
  }
  const sm = (arr: number[]) => {
    let s = arr.slice(1, period + 1).reduce((a, b) => a + b, 0);
    const res = [s];
    for (let i = period + 1; i < arr.length; i++) {
      s = s - s / period + arr[i];
      res.push(s);
    }
    return res;
  };
  const trS = sm(tr);
  const pS = sm(pDM);
  const mS = sm(mDM);
  const dx: number[] = [];
  for (let i = 0; i < trS.length; i++) {
    if (trS[i] === 0) {
      dx.push(0);
      continue;
    }
    const pdi = (100 * pS[i]) / trS[i];
    const mdi = (100 * mS[i]) / trS[i];
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
  }
  if (dx.length < period) return NaN;
  let a = dx.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < dx.length; i++) a = (a * (period - 1) + dx[i]) / period;
  return a;
}

// ── SMC enxuto (só o viés de ESTRUTURA: swing + interno via BOS/CHoCH) ────────
// Versão mínima de web/src/lib/smc.ts: detecta os pivôs de swing/interno e o trend
// estrutural por quebra de estrutura. NÃO computa OB/FVG/liquidez/zonas (o servidor
// só precisa da DIREÇÃO da estrutura p/ a força que vota). Espelha computeSmc().
interface SC { high: number; low: number; close: number; }
function makeLeg(candles: SC[], size: number) {
  let leg = 0;
  return (i: number): number => {
    if (i < size) return 0;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let k = i - size + 1; k <= i; k++) {
      if (candles[k].high > highest) highest = candles[k].high;
      if (candles[k].low < lowest) lowest = candles[k].low;
    }
    const prev = leg;
    if (candles[i - size].high > highest) leg = 0; // topo de swing → perna de baixa
    else if (candles[i - size].low < lowest) leg = 1; // fundo de swing → perna de alta
    if (leg === prev) return 0;
    return leg === 1 ? 1 : -1;
  };
}
function smcBias(candles: SC[], swingLen = 50, internalLen = 5): { swingBias: number; internalBias: number } {
  const n = candles.length;
  if (n < internalLen + 3) return { swingBias: 0, internalBias: 0 };
  let sHi = NaN;
  let sLo = NaN;
  let sHiX = false;
  let sLoX = false;
  let iHi = NaN;
  let iLo = NaN;
  let iHiX = false;
  let iLoX = false;
  let swingTrend = 0;
  let internalTrend = 0;
  const legS = makeLeg(candles, swingLen);
  const legI = makeLeg(candles, internalLen);
  for (let i = 0; i < n; i++) {
    const fs = legS(i);
    if (fs !== 0 && i - swingLen >= 0) {
      const pi = i - swingLen;
      if (fs === -1) (sHi = candles[pi].high), (sHiX = false);
      else (sLo = candles[pi].low), (sLoX = false);
    }
    const fi = legI(i);
    if (fi !== 0 && i - internalLen >= 0) {
      const pi = i - internalLen;
      if (fi === -1) (iHi = candles[pi].high), (iHiX = false);
      else (iLo = candles[pi].low), (iLoX = false);
    }
    if (i === 0) continue;
    const c = candles[i].close;
    const cp = candles[i - 1].close;
    if (!Number.isNaN(iHi) && c > iHi && cp <= iHi && !iHiX && iHi !== sHi) (iHiX = true), (internalTrend = 1);
    if (!Number.isNaN(iLo) && c < iLo && cp >= iLo && !iLoX && iLo !== sLo) (iLoX = true), (internalTrend = -1);
    if (!Number.isNaN(sHi) && c > sHi && cp <= sHi && !sHiX) (sHiX = true), (swingTrend = 1);
    if (!Number.isNaN(sLo) && c < sLo && cp >= sLo && !sLoX) (sLoX = true), (swingTrend = -1);
  }
  return { swingBias: swingTrend, internalBias: internalTrend };
}

// Núcleo do motor — espelha confluence.ts (viés/convicção/regime).
// deno-lint-ignore no-explicit-any
function computeRead(candles: any[], payload: any) {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? payload?.gamma?.spot_price ?? null;
  const e50 = last(ema(closes, 50));
  const e200 = last(ema(closes, 200));
  const haveTrend = closes.length >= 200 && Number.isFinite(e200) && price != null;
  let trendDir = 0;
  let trendStr = 0;
  if (haveTrend) {
    const above = price > e200;
    const golden = e50 > e200;
    trendDir = above && golden ? 1 : !above && !golden ? -1 : 0;
    trendStr = clamp01(Math.abs(((price - e200) / e200) * 100) / 15);
  }
  const hist = macdHist(closes);
  const r = rsiLast(closes, 14);
  const haveMom = Number.isFinite(hist) && Number.isFinite(r);
  const momDir = haveMom ? sign(hist) : 0;
  const momStr = haveMom ? clamp01(Math.abs(r - 50) / 30) : 0;
  const premium = payload?.coinbase_premium ?? null;
  const cb = payload?.price?.coinbase?.cvd ?? null;
  const etf = payload?.etf_flows?.flow_7d_usd ?? null;
  let acc = 0;
  let n = 0;
  if (premium != null) (acc += sign(premium)), n++;
  if (cb != null) (acc += sign(cb)), n++;
  if (etf != null) (acc += sign(etf)), n++;
  const haveFlow = n > 0;
  const flowDir = haveFlow ? sign(acc) : 0;
  const flowStr = haveFlow ? clamp01(Math.abs(acc) / n) : 0;
  const funding = payload?.derivatives?.funding_rate ?? null;
  const ls = payload?.derivatives?.long_short_ratio ?? null;
  const havePos = funding != null;
  const posDir = havePos ? sign(funding) : 0;
  const posStr = havePos ? clamp01(Math.abs(funding) / 0.05) : 0;
  const pcr = payload?.gamma?.put_call_ratio ?? null;
  const haveOpt = pcr != null;
  const optDir = haveOpt ? (pcr > 1.05 ? -1 : pcr < 0.95 ? 1 : 0) : 0;
  const optStr = haveOpt ? clamp01(Math.abs(pcr - 1) / 0.5) : 0;
  // ESTRUTURA (SMC) — força que VOTA (Onda 1): swing/interno por BOS/CHoCH.
  const smc = closes.length >= 60 ? smcBias(candles) : { swingBias: 0, internalBias: 0 };
  const haveStruct = smc.swingBias !== 0;
  const structDir = smc.swingBias;
  const internalAgrees = smc.internalBias !== 0 && smc.internalBias === smc.swingBias;
  const structStr = haveStruct ? clamp01(internalAgrees ? 0.85 : 0.55) : 0;

  const adxv = adx(candles, 14);
  const atrPct = atrPercentile(candles, 14, 90);
  let charState = "—";
  if (Number.isFinite(adxv)) charState = adxv >= 25 ? "tendência" : Number.isFinite(atrPct) && atrPct < 30 ? "comprimido" : "range";

  // Pesos reponderados (Onda 1): trend (EMA) + structure (price action) dividem a
  // família direcional (0,22 + 0,18); fluxo institucional alto (0,25). Normaliza por ws.
  const dirs = [
    { d: trendDir, s: trendStr, w: 0.22, a: haveTrend },
    { d: structDir, s: structStr, w: 0.18, a: haveStruct },
    { d: momDir, s: momStr, w: 0.18, a: haveMom },
    { d: flowDir, s: flowStr, w: 0.25, a: haveFlow },
    { d: posDir, s: posStr, w: 0.12, a: havePos },
    { d: optDir, s: optStr, w: 0.1, a: haveOpt },
  ];
  let num = 0;
  let ws = 0;
  for (const x of dirs) if (x.a) (num += x.d * x.s * x.w), (ws += x.w);
  const bias = ws ? Math.round((num / ws) * 100) : 0;
  const bs = sign(bias);
  const voting = dirs.filter((x) => x.a && x.d !== 0);
  const agree = voting.filter((x) => x.d === bs).length;
  const conviction = voting.length ? Math.round((agree / voting.length) * 100) : 0;
  const flowOpposesTrend = haveTrend && haveFlow && trendDir !== 0 && flowDir !== 0 && trendDir !== flowDir;

  let regime_key: string;
  let regime_label: string;
  let tone: string;
  if (!ws) (regime_key = "sem_dados"), (regime_label = "Sem dados suficientes."), (tone = "neutral");
  else if (Math.abs(bias) < 12) (regime_key = "indeciso"), (regime_label = "Indeciso — forças em conflito, aguardando catalisador."), (tone = "neutral");
  else if (charState === "comprimido")
    (regime_key = "comprimido"), (regime_label = `Comprimido — rompimento define o lado (viés leve de ${bias > 0 ? "alta" : "baixa"}).`), (tone = bias > 0 ? "bull" : "bear");
  else if (flowOpposesTrend)
    (regime_key = "fragil"),
      (regime_label = bias > 0 ? "Alta frágil — preço sobe, mas o institucional não acompanha." : "Baixa frágil — preço cai, mas o institucional não confirma."),
      (tone = bias > 0 ? "bull" : "bear");
  else if (bias > 0 && funding != null && funding > 0.03 && (ls ?? 1) > 1.3)
    (regime_key = "squeeze"), (regime_label = "Perseguição alavancada — longs lotados, risco de squeeze."), (tone = "bull");
  else
    (regime_key = bias > 0 ? "trend_up" : "trend_down"),
      (regime_label = `Tendência de ${bias > 0 ? "alta" : "baixa"}${conviction >= 60 ? " com convicção" : ""} — ${agree} de ${voting.length} forças alinhadas.`),
      (tone = bias > 0 ? "bull" : "bear");

  return { bias, conviction, regime_key, regime_label, tone, char_state: charState };
}

async function fetchCandles(asset: string): Promise<C[]> {
  const kr = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${asset}USDT&interval=1d&limit=365`);
  if (!kr.ok) throw new Error(`klines ${kr.status}`);
  const raw = (await kr.json()) as unknown[][];
  return raw.map((k) => ({ high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) }));
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (secret && req.headers.get("x-dispatch-secret") !== secret) return new Response("forbidden", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── Lotes (1 query cada, dedupe em memória) — evita 80×N round-trips ──────────
  // Snapshots recentes (últimos 60 min) por ativo: só as 20 CURATED têm; o resto
  // computa só a partir das velas.
  const { data: snapRows } = await admin
    .from("market_snapshot").select("asset, payload, ts")
    .gte("ts", new Date(Date.now() - 60 * 60000).toISOString()).order("ts", { ascending: false });
  const snapByAsset = new Map<string, unknown>();
  for (const r of (snapRows ?? []) as Array<{ asset: string; payload: unknown }>)
    if (!snapByAsset.has(r.asset)) snapByAsset.set(r.asset, r.payload);

  // Leitura anterior por ativo (últimas 3h) — p/ detectar entrada/virada de estado.
  const { data: prevRows } = await admin
    .from("market_read").select("asset, tone, bias, conviction, ts")
    .gte("ts", new Date(Date.now() - 3 * 3600 * 1000).toISOString()).order("ts", { ascending: false });
  const prevByAsset = new Map<string, { tone: string; bias: number; conviction: number }>();
  for (const r of (prevRows ?? []) as Array<{ asset: string; tone: string; bias: number; conviction: number }>)
    if (!prevByAsset.has(r.asset)) prevByAsset.set(r.asset, { tone: r.tone, bias: Number(r.bias), conviction: Number(r.conviction) });

  // Experts (destinatários do alerta) — 1 query.
  const { data: subs } = await admin.from("subscriptions").select("user_id, plan:plans(slug)").eq("status", "active");
  const experts = ((subs ?? []) as Array<{ user_id: string; plan?: { slug?: string } }>)
    .filter((s) => s.plan?.slug === "expert").map((s) => s.user_id);

  // Watchlist por usuário — personaliza o alerta: só notifica as moedas FAVORITAS de
  // cada Expert (antes era broadcast de ~100 moedas p/ todos). Quem não favoritou
  // nada cai no default (majors BTC/ETH/SOL), p/ não ficar sem nenhum alerta.
  const { data: wlRows } = await admin.from("watchlist").select("user_id, asset");
  const favByUser = new Map<string, Set<string>>();
  for (const r of (wlRows ?? []) as Array<{ user_id: string; asset: string }>) {
    let s = favByUser.get(r.user_id);
    if (!s) { s = new Set<string>(); favByUser.set(r.user_id, s); }
    s.add(r.asset);
  }
  const DEFAULT_FAVS = new Set(["BTC", "ETH", "SOL"]);
  const wantsAsset = (uid: string, a: string): boolean => {
    const favs = favByUser.get(uid);
    return favs && favs.size > 0 ? favs.has(a) : DEFAULT_FAVS.has(a);
  };

  // Cooldown por moeda: as que já receberam alerta de "mudança de leitura" dentro da
  // janela ficam de fora (reusa as notificações já gravadas — sem schema novo).
  const { data: recentNotifs } = await admin
    .from("notifications").select("asset")
    .eq("metric", "regime")
    .gte("created_at", new Date(Date.now() - COOLDOWN_H * 3600 * 1000).toISOString());
  const onCooldown = new Set<string>();
  for (const r of (recentNotifs ?? []) as Array<{ asset: string | null }>) if (r.asset) onCooldown.add(r.asset);

  // ── Computa a leitura de cada ativo, em lotes paralelos (klines da Binance) ───
  const reads: Array<{ asset: string; read: ReturnType<typeof computeRead> }> = [];
  const BATCH = 12;
  for (let i = 0; i < ASSETS.length; i += BATCH) {
    const out = await Promise.all(
      ASSETS.slice(i, i + BATCH).map(async (asset) => {
        try {
          const read = computeRead(await fetchCandles(asset), snapByAsset.get(asset) ?? null);
          return read.regime_key === "sem_dados" ? null : { asset, read };
        } catch {
          return null;
        }
      }),
    );
    for (const x of out) if (x) reads.push(x);
  }
  if (!reads.length) return new Response(JSON.stringify({ ok: true, assets: 0 }), { status: 200, headers: { "Content-Type": "application/json" } });

  // Grava o histórico de todas as leituras (1 insert).
  await admin.from("market_read").insert(
    reads.map(({ asset, read }) => ({
      asset, bias: read.bias, conviction: read.conviction, regime_key: read.regime_key,
      regime_label: read.regime_label, tone: read.tone, char_state: read.char_state,
    })),
  );

  // Alerta os Experts quando a moeda ENTRA num estado relevante ou VIRA de direção
  // (não só na virada crua de tone) — com tier por riqueza de dado e cooldown (1 insert).
  const notifs: Array<Record<string, unknown>> = [];
  let changed = 0;
  for (const { asset, read } of reads) {
    const prev = prevByAsset.get(asset);
    if (!prev) continue; // sem leitura anterior observável → não alerta (evita rajada)
    const curated = snapByAsset.has(asset); // tem snapshot = leitura rica
    const curDir = interestDir(read, curated);
    const prevDir = interestDir(prev, curated);
    // Entrou no estado relevante (prevDir 0 → ±1) ou virou de lado (+1 ↔ −1).
    if (curDir !== 0 && curDir !== prevDir && !onCooldown.has(asset)) {
      changed++;
      onCooldown.add(asset); // trava p/ o resto deste ciclo também
      for (const uid of experts) {
        if (!wantsAsset(uid, asset)) continue; // só as favoritas do usuário
        notifs.push({ user_id: uid, title: `${asset} · mudança de leitura`, body: `O viés do ${asset} virou: ${read.regime_label}`, asset, metric: "regime", value: read.regime_key });
      }
    }
  }
  if (notifs.length) await admin.from("notifications").insert(notifs);

  return new Response(JSON.stringify({ ok: true, assets: reads.length, changed, alerted: notifs.length }), { status: 200, headers: { "Content-Type": "application/json" } });
});
