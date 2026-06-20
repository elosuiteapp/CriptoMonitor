// Edge Function: market-read (Leitura do Mercado no servidor — Fase 2)
// Roda o NÚCLEO do motor de confluência (viés/convicção/regime) para BTC/ETH/SOL a
// cada ~30 min (cron), grava em `market_read` e dispara alerta (notifications) quando
// o VIÉS VIRA (tone muda). O front continua calculando a leitura COMPLETA (alvos,
// multi-timeframe, falsificador) ao vivo — aqui é só o que precisa de memória/alerta.
//
// MANTER EM SINCRONIA com web/src/lib/indicators/confluence.ts (pesos e regras do viés).
// Auth: header x-dispatch-secret == DISPATCH_SECRET. Deploy: --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";

const ASSETS = ["BTC", "ETH", "SOL"];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
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
  const adxv = adx(candles, 14);
  const atrPct = atrPercentile(candles, 14, 90);
  let charState = "—";
  if (Number.isFinite(adxv)) charState = adxv >= 25 ? "tendência" : Number.isFinite(atrPct) && atrPct < 30 ? "comprimido" : "range";

  const dirs = [
    { d: trendDir, s: trendStr, w: 0.28, a: haveTrend },
    { d: momDir, s: momStr, w: 0.2, a: haveMom },
    { d: flowDir, s: flowStr, w: 0.27, a: haveFlow },
    { d: posDir, s: posStr, w: 0.15, a: havePos },
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

Deno.serve(async (req) => {
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (secret && req.headers.get("x-dispatch-secret") !== secret) return new Response("forbidden", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let experts: string[] | null = null;
  const getExperts = async (): Promise<string[]> => {
    if (experts) return experts;
    const { data } = await admin.from("subscriptions").select("user_id, plan:plans(slug)").eq("status", "active");
    experts = ((data ?? []) as Array<{ user_id: string; plan?: { slug?: string } }>).filter((s) => s.plan?.slug === "expert").map((s) => s.user_id);
    return experts;
  };

  const results: unknown[] = [];
  let alerted = 0;
  for (const asset of ASSETS) {
    try {
      const kr = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${asset}USDT&interval=1d&limit=250`);
      const raw = (await kr.json()) as unknown[][];
      const candles = raw.map((k) => ({ high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) }));
      const { data: snap } = await admin.from("market_snapshot").select("payload").eq("asset", asset).order("ts", { ascending: false }).limit(1).maybeSingle();
      const read = computeRead(candles, snap?.payload ?? null);
      if (read.regime_key === "sem_dados") {
        results.push({ asset, skipped: true });
        continue;
      }
      const { data: prev } = await admin.from("market_read").select("tone").eq("asset", asset).order("ts", { ascending: false }).limit(1).maybeSingle();
      await admin.from("market_read").insert({
        asset,
        bias: read.bias,
        conviction: read.conviction,
        regime_key: read.regime_key,
        regime_label: read.regime_label,
        tone: read.tone,
        char_state: read.char_state,
      });
      const changed = prev != null && prev.tone !== read.tone;
      if (changed) {
        for (const uid of await getExperts()) {
          await admin.from("notifications").insert({
            user_id: uid,
            title: `${asset} · mudança de leitura`,
            body: `O viés do ${asset} virou: ${read.regime_label}`,
            asset,
            metric: "regime",
            value: read.regime_key,
          });
          alerted++;
        }
      }
      results.push({ asset, bias: read.bias, regime: read.regime_key, tone: read.tone, changed });
    } catch (e) {
      results.push({ asset, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ results, alerted }), { status: 200, headers: { "Content-Type": "application/json" } });
});
