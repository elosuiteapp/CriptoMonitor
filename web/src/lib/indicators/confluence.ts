// Motor de confluência — "Leitura do Mercado" (Expert).
// Cruza TA (das velas) com microestrutura (fluxo, posição, opções, liquidez do
// snapshot) e devolve UMA leitura sintetizada: viés + convicção + caráter +
// regime nomeado + divergências + alvos de liquidez. Determinístico e auditável:
// cada eixo expõe sua direção, força e o porquê. NÃO é previsão — é leitura do agora.

import { buildLiquidationGrid, liquidationMagnets } from "../liquidationModel";
import type { Candle } from "../marketData";
import { computeVolumeProfile } from "../marketData";
import type { SnapshotPayload } from "../types";
import { adx, atr, ema, last, macd, percentileRank, rsi } from "./ta";

export type Dir = -1 | 0 | 1;

const fmtUsd0 = (n: number) =>
  "US$ " + (n >= 1000 ? Math.round(n).toLocaleString("pt-BR") : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export interface AxisSignal {
  key: string;
  label: string;
  group: "tendência" | "momento" | "fluxo" | "posição" | "opções" | "caráter";
  dir: Dir; // -1 baixa, 0 neutro, +1 alta
  strength: number; // 0..1
  detail: string;
  available: boolean;
}

export interface TfLean {
  tf: string;
  dir: Dir;
  label: string;
}

/** Viés estrutural rápido de um timeframe (EMA20/50 + MACD) — usado p/ a leitura
 *  multi-timeframe (alinhamento entre prazos = convicção; conflito = transição). */
export function timeframeLean(tf: string, candles: Candle[]): TfLean {
  const closes = candles.map((c) => c.close);
  if (closes.length < 55) return { tf, dir: 0, label: "—" };
  const e20 = last(ema(closes, 20));
  const e50 = last(ema(closes, 50));
  const price = closes[closes.length - 1];
  const hist = last(macd(closes).hist);
  let v = 0;
  v += price > e50 ? 1 : -1;
  v += e20 > e50 ? 1 : -1;
  v += hist > 0 ? 1 : -1;
  const dir: Dir = v >= 2 ? 1 : v <= -2 ? -1 : 0;
  return { tf, dir, label: dir > 0 ? "alta" : dir < 0 ? "baixa" : "lateral" };
}

export interface LiquidityTarget {
  price: number;
  label: string;
  dir: "up" | "down";
  distPct: number;
  strength: number; // 0..1 (proximidade × relevância)
}

export interface MarketRead {
  bias: number; // -100..+100
  conviction: number; // 0..100 (% das forças direcionais que concordam com o viés)
  agree: number;
  voting: number;
  character: "tendência" | "range" | "comprimido" | "—";
  gammaNote: string | null;
  regime: { key: string; label: string; tone: "bull" | "bear" | "neutral" };
  axes: AxisSignal[];
  divergences: string[];
  targets: LiquidityTarget[];
  falsifier: string | null;
  levels: { ema50: number | null; ema200: number | null };
  price: number | null;
  hasData: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const sign = (v: number): Dir => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Detecta divergência preço × RSI nos últimos `look` candles (topo/fundo simples). */
function rsiDivergence(closes: number[], rsiArr: number[], look = 20): string | null {
  const n = closes.length;
  if (n < look + 2) return null;
  const px = closes.slice(-look);
  const rs = rsiArr.slice(-look);
  const half = Math.floor(look / 2);
  const maxIdx = (a: number[], s: number, e: number) => {
    let m = s;
    for (let i = s + 1; i < e; i++) if (a[i] > a[m]) m = i;
    return m;
  };
  const minIdx = (a: number[], s: number, e: number) => {
    let m = s;
    for (let i = s + 1; i < e; i++) if (a[i] < a[m]) m = i;
    return m;
  };
  const pH1 = maxIdx(px, 0, half);
  const pH2 = maxIdx(px, half, look);
  if (px[pH2] > px[pH1] && Number.isFinite(rs[pH1]) && Number.isFinite(rs[pH2]) && rs[pH2] < rs[pH1])
    return "Divergência de baixa: preço fez topo mais alto, mas o RSI não acompanhou.";
  const pL1 = minIdx(px, 0, half);
  const pL2 = minIdx(px, half, look);
  if (px[pL2] < px[pL1] && Number.isFinite(rs[pL1]) && Number.isFinite(rs[pL2]) && rs[pL2] > rs[pL1])
    return "Divergência de alta: preço fez fundo mais baixo, mas o RSI segurou.";
  return null;
}

export function computeMarketRead(candles: Candle[], payload: SnapshotPayload | null, intra?: Candle[]): MarketRead {
  const closes = candles.map((c) => c.close);
  const price =
    closes[closes.length - 1] ?? payload?.gamma?.spot_price ?? payload?.price?.binance?.price ?? null;
  const axes: AxisSignal[] = [];
  const divergences: string[] = [];

  // ── Eixo TENDÊNCIA (EMA50/200) ──────────────────────────────────────────
  const e50 = last(ema(closes, 50));
  const e200 = last(ema(closes, 200));
  const haveTrend = closes.length >= 200 && Number.isFinite(e200) && price != null;
  let trendDir: Dir = 0;
  let trendStr = 0;
  if (haveTrend && price != null) {
    const above = price > e200;
    const golden = e50 > e200;
    trendDir = above && golden ? 1 : !above && !golden ? -1 : 0;
    const distPct = ((price - e200) / e200) * 100;
    trendStr = clamp01(Math.abs(distPct) / 15);
    axes.push({
      key: "trend",
      label: "Tendência",
      group: "tendência",
      dir: trendDir,
      strength: trendStr,
      available: true,
      detail: `Preço ${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}% vs EMA200 · EMA50 ${golden ? ">" : "<"} EMA200 (${golden ? "golden" : "death"} cross)`,
    });
  } else {
    axes.push({ key: "trend", label: "Tendência", group: "tendência", dir: 0, strength: 0, available: false, detail: "Histórico insuficiente" });
  }

  // ── Eixo MOMENTO (MACD + RSI) ───────────────────────────────────────────
  const m = macd(closes);
  const histLast = last(m.hist);
  const rsiArr = rsi(closes, 14);
  const rLast = last(rsiArr);
  const haveMom = Number.isFinite(histLast) && Number.isFinite(rLast);
  let momDir: Dir = 0;
  let momStr = 0;
  if (haveMom) {
    momDir = sign(histLast);
    momStr = clamp01(Math.abs(rLast - 50) / 30);
    axes.push({
      key: "momentum",
      label: "Momento",
      group: "momento",
      dir: momDir,
      strength: momStr,
      available: true,
      detail: `MACD ${histLast >= 0 ? "positivo" : "negativo"} · RSI ${rLast.toFixed(0)}${rLast > 70 ? " (sobrecomprado)" : rLast < 30 ? " (sobrevendido)" : ""}`,
    });
    const div = rsiDivergence(closes, rsiArr);
    if (div) divergences.push(div);
  } else {
    axes.push({ key: "momentum", label: "Momento", group: "momento", dir: 0, strength: 0, available: false, detail: "Histórico insuficiente" });
  }

  // ── Eixo FLUXO (institucional × varejo) ─────────────────────────────────
  const premium = payload?.coinbase_premium ?? null;
  const cbCvd = payload?.price?.coinbase?.cvd ?? null;
  const etf7 = payload?.etf_flows?.flow_7d_usd ?? null;
  let instAcc = 0;
  let instN = 0;
  const flowParts: string[] = [];
  if (premium != null) {
    instAcc += sign(premium);
    instN++;
    flowParts.push(`prêmio Coinbase ${premium >= 0 ? "+" : ""}${(premium * 100).toFixed(2)}%`);
  }
  if (cbCvd != null) {
    instAcc += sign(cbCvd);
    instN++;
    flowParts.push(`CVD institucional ${cbCvd >= 0 ? "comprador" : "vendedor"}`);
  }
  if (etf7 != null) {
    instAcc += sign(etf7);
    instN++;
    flowParts.push(`ETF 7d ${etf7 >= 0 ? "entrando" : "saindo"}`);
  }
  const haveFlow = instN > 0;
  const flowDir: Dir = haveFlow ? sign(instAcc) : 0;
  const flowStr = haveFlow ? clamp01(Math.abs(instAcc) / instN) : 0;
  axes.push({
    key: "flow",
    label: "Fluxo institucional",
    group: "fluxo",
    dir: flowDir,
    strength: flowStr,
    available: haveFlow,
    detail: haveFlow ? flowParts.join(" · ") : "Indisponível neste ativo",
  });

  // ── Eixo POSIÇÃO (funding + long/short) ─────────────────────────────────
  // funding em PERCENT (convenção Coinalyze). Longs pagando (>0) = pressão
  // compradora alavancada, mas em extremo vira risco de squeeze (vai p/ divergência).
  const funding = payload?.derivatives?.funding_rate ?? null;
  const ls = payload?.derivatives?.long_short_ratio ?? null;
  const havePos = funding != null;
  let posDir: Dir = 0;
  let posStr = 0;
  if (havePos && funding != null) {
    posDir = sign(funding);
    posStr = clamp01(Math.abs(funding) / 0.05);
    axes.push({
      key: "position",
      label: "Posição alavancada",
      group: "posição",
      dir: posDir,
      strength: posStr,
      available: true,
      detail: `Funding ${funding >= 0 ? "+" : ""}${funding.toFixed(4)}% (${funding >= 0 ? "longs pagam" : "shorts pagam"})${ls != null ? ` · L/S ${ls.toFixed(2)}` : ""}`,
    });
    if (Math.abs(funding) > 0.03)
      divergences.push(
        funding > 0
          ? "Funding alto positivo — longs lotados, risco de long squeeze (reversão para baixo)."
          : "Funding negativo — shorts lotados, combustível para short squeeze (reversão para cima).",
      );
  } else {
    axes.push({ key: "position", label: "Posição alavancada", group: "posição", dir: 0, strength: 0, available: false, detail: "Indisponível" });
  }

  // ── Eixo OPÇÕES (put/call + skew) — expectativa do desk de opções ───────
  const pcr = payload?.gamma?.put_call_ratio ?? null;
  const skew = payload?.gamma?.iv_skew ?? null;
  const iv = payload?.gamma?.avg_iv ?? null;
  const haveOpt = pcr != null;
  let optDir: Dir = 0;
  let optStr = 0;
  if (haveOpt && pcr != null) {
    // put/call > 1 = mais proteção (puts) → viés defensivo; < 1 = apetite por calls.
    optDir = pcr > 1.05 ? -1 : pcr < 0.95 ? 1 : 0;
    optStr = clamp01(Math.abs(pcr - 1) / 0.5);
    axes.push({
      key: "options",
      label: "Opções (put/call + skew)",
      group: "opções",
      dir: optDir,
      strength: optStr,
      available: true,
      detail: `Put/Call ${pcr.toFixed(2)}${skew != null ? ` · skew ${skew >= 0 ? "+" : ""}${skew.toFixed(1)}%` : ""}${iv != null ? ` · IV ${iv.toFixed(0)}%` : ""}`,
    });
  } else {
    axes.push({ key: "options", label: "Opções (put/call + skew)", group: "opções", dir: 0, strength: 0, available: false, detail: "Indisponível neste ativo" });
  }

  // ── CARÁTER (ADX + ATR percentil + regime de gamma) ─────────────────────
  const adxv = adx(candles, 14);
  const atrArr = atr(candles, 14);
  const atrLast = last(atrArr);
  const atrPct = percentileRank(atrArr.slice(-90), atrLast);
  let character: MarketRead["character"] = "—";
  if (Number.isFinite(adxv)) {
    if (adxv >= 25) character = "tendência";
    else if (Number.isFinite(atrPct) && atrPct < 30) character = "comprimido";
    else character = "range";
  }
  const gammaRegime = payload?.gamma?.regime ?? null;
  const gammaNote =
    gammaRegime === "negative"
      ? "Gamma negativo — dealers amplificam o movimento (tende a esticar tendência/volatilidade)."
      : gammaRegime === "positive"
        ? "Gamma positivo — dealers amortecem (tende a voltar à média / range)."
        : null;
  axes.push({
    key: "character",
    label: "Caráter (ADX + gamma)",
    group: "caráter",
    dir: 0,
    strength: Number.isFinite(adxv) ? clamp01(adxv / 50) : 0,
    available: Number.isFinite(adxv),
    detail: Number.isFinite(adxv)
      ? `ADX ${adxv.toFixed(0)} (${character})${Number.isFinite(atrPct) ? ` · volatilidade no percentil ${atrPct.toFixed(0)}` : ""}${gammaRegime ? ` · gamma ${gammaRegime === "positive" ? "positivo" : "negativo"}` : ""}`
      : "Histórico insuficiente",
  });

  // ── VIÉS agregado (média ponderada das forças direcionais disponíveis) ───
  const directional = [
    { dir: trendDir, str: trendStr, w: 0.28, avail: haveTrend },
    { dir: momDir, str: momStr, w: 0.2, avail: haveMom },
    { dir: flowDir, str: flowStr, w: 0.27, avail: haveFlow },
    { dir: posDir, str: posStr, w: 0.15, avail: havePos },
    { dir: optDir, str: optStr, w: 0.1, avail: haveOpt },
  ];
  let num = 0;
  let wsum = 0;
  for (const d of directional)
    if (d.avail) {
      num += d.dir * d.str * d.w;
      wsum += d.w;
    }
  const bias = wsum ? Math.round((num / wsum) * 100) : 0;
  const biasSign = sign(bias);
  const votingArr = directional.filter((d) => d.avail && d.dir !== 0);
  const agree = votingArr.filter((d) => d.dir === biasSign).length;
  const voting = votingArr.length;
  const conviction = voting ? Math.round((agree / voting) * 100) : 0;

  // Divergência fluxo × tendência (o "ouro": preço numa direção, smart money na outra)
  const flowOpposesTrend = haveTrend && haveFlow && trendDir !== 0 && flowDir !== 0 && trendDir !== flowDir;
  if (flowOpposesTrend)
    divergences.unshift(
      trendDir > 0
        ? "Preço em alta, mas o fluxo institucional não acompanha — rali pode ser de varejo/alavancagem."
        : "Preço em baixa, mas o institucional não confirma a venda — possível absorção de fundo.",
    );

  // Divergência tendência × momento (ex.: baixa estrutural com repique de curto prazo).
  if (haveTrend && haveMom && trendDir !== 0 && momDir !== 0 && trendDir !== momDir)
    divergences.push(
      trendDir < 0
        ? "Tendência de baixa, mas o momento de curto prazo virou pra cima — possível repique/contra-tendência."
        : "Tendência de alta, mas o momento de curto prazo enfraquece — atenção a uma correção.",
    );

  // ── REGIME nomeado ──────────────────────────────────────────────────────
  let regime: MarketRead["regime"];
  if (!wsum) regime = { key: "sem_dados", label: "Sem dados suficientes para leitura.", tone: "neutral" };
  else if (Math.abs(bias) < 12)
    regime = { key: "indeciso", label: "Indeciso — forças em conflito, mercado aguardando catalisador.", tone: "neutral" };
  else if (character === "comprimido")
    regime = {
      key: "comprimido",
      label: `Comprimido — volatilidade baixa; o rompimento define o lado (viés leve de ${bias > 0 ? "alta" : "baixa"}).`,
      tone: bias > 0 ? "bull" : "bear",
    };
  else if (flowOpposesTrend)
    regime = {
      key: "fragil",
      label: bias > 0 ? "Alta frágil — preço sobe, mas o fluxo institucional não acompanha." : "Baixa frágil — preço cai, mas o institucional não confirma.",
      tone: bias > 0 ? "bull" : "bear",
    };
  else if (bias > 0 && funding != null && funding > 0.03 && (ls ?? 1) > 1.3)
    regime = { key: "squeeze", label: "Perseguição alavancada — longs lotados; alta real, mas com risco de squeeze.", tone: "bull" };
  else
    regime = {
      key: bias > 0 ? "trend_up" : "trend_down",
      label: `Tendência de ${bias > 0 ? "alta" : "baixa"}${conviction >= 60 ? " com convicção" : ""} — ${agree} de ${voting} forças alinhadas.`,
      tone: bias > 0 ? "bull" : "bear",
    };

  // ── ALVOS DE LIQUIDEZ (ímãs: walls, max pain, zero gamma, POC) ──────────
  const targets: LiquidityTarget[] = [];
  const pushT = (p: number | null | undefined, label: string) => {
    if (p == null || !Number.isFinite(p) || price == null) return;
    const distPct = ((p - price) / price) * 100;
    targets.push({ price: p, label, dir: p >= price ? "up" : "down", distPct, strength: 0 });
  };
  const g = payload?.gamma;
  if (g?.profile_jsonb) {
    const entries = Object.entries(g.profile_jsonb)
      .map(([s, v]) => ({ strike: Number(s), gex: Number(v) }))
      .filter((e) => Number.isFinite(e.strike) && Number.isFinite(e.gex));
    if (entries.length) {
      pushT(entries.reduce((a, b) => (b.gex > a.gex ? b : a)).strike, "Call Wall");
      pushT(entries.reduce((a, b) => (b.gex < a.gex ? b : a)).strike, "Put Wall");
    }
  }
  pushT(g?.max_pain, "Max Pain");
  pushT(g?.zero_gamma_level, "Zero Gamma");
  const vp = computeVolumeProfile(candles.slice(-30));
  pushT(vp?.poc, "POC 30d");
  // Ímãs de LIQUIDAÇÃO (reusa o modelo do heatmap): bolsão de shorts acima / longs
  // abaixo. Usa velas intraday (4H) quando disponíveis → zonas próximas e acionáveis.
  const liqGrid = buildLiquidationGrid((intra && intra.length >= 30 ? intra : candles).slice(-120));
  if (liqGrid && price != null) {
    for (const mg of liquidationMagnets(liqGrid, price, 1, 0.35))
      pushT(mg.price, mg.side === "short" ? "Liquidação de shorts ↑" : "Liquidação de longs ↓");
  }
  for (const t of targets) t.strength = clamp01(1 - Math.abs(t.distPct) / 15);
  targets.sort((a, b) => b.strength - a.strength);

  // ── "O que muda a leitura" (falsificador): o nível-gatilho do lado oposto ──
  let falsifier: string | null = null;
  if (price != null && wsum) {
    const levelList: { p: number; name: string }[] = targets.map((t) => ({ p: t.price, name: t.label }));
    if (Number.isFinite(e50)) levelList.push({ p: e50, name: "EMA50" });
    if (Number.isFinite(e200)) levelList.push({ p: e200, name: "EMA200" });
    const above = levelList.filter((l) => l.p > price).sort((a, b) => a.p - b.p)[0];
    const below = levelList.filter((l) => l.p < price).sort((a, b) => b.p - a.p)[0];
    if (bias < 0 && above)
      falsifier = `A leitura de baixa enfraquece se romper acima de ${above.name} (${fmtUsd0(above.p)} · +${(((above.p - price) / price) * 100).toFixed(1)}%).`;
    else if (bias > 0 && below)
      falsifier = `A leitura de alta enfraquece se perder ${below.name} (${fmtUsd0(below.p)} · ${(((below.p - price) / price) * 100).toFixed(1)}%).`;
    else if (above && below)
      falsifier = `Define o lado: alta acima de ${above.name} (${fmtUsd0(above.p)}), baixa abaixo de ${below.name} (${fmtUsd0(below.p)}).`;
  }

  return {
    bias,
    conviction,
    agree,
    voting,
    character,
    gammaNote,
    regime,
    axes,
    divergences,
    targets: targets.slice(0, 6),
    falsifier,
    levels: { ema50: Number.isFinite(e50) ? e50 : null, ema200: Number.isFinite(e200) ? e200 : null },
    price,
    hasData: wsum > 0,
  };
}
