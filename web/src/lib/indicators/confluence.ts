// Motor de confluência — "Leitura do Mercado" (Expert).
// Cruza TA (das velas) com microestrutura (fluxo, posição, opções, liquidez do
// snapshot) e devolve UMA leitura sintetizada: viés + convicção + caráter +
// regime nomeado + divergências + alvos de liquidez. Determinístico e auditável:
// cada eixo expõe sua direção, força e o porquê. NÃO é previsão — é leitura do agora.
// Bilíngue (PT/EN) via getLocale() — o IndicatorsTab inclui o idioma nas deps do
// useMemo, então a leitura recomputa ao trocar de idioma.

import { getLocale } from "../../hooks/useLocale";
import { buildLiquidationGrid, liquidationMagnets } from "../liquidationModel";
import type { Candle } from "../marketData";
import { computeVolumeProfile } from "../marketData";
import { computeSmc } from "../smc";
import type { SnapshotPayload } from "../types";
import { adx, atr, ema, last, macd, percentileRank, rsi } from "./ta";

export type Dir = -1 | 0 | 1;

/** Seletor curto PT/EN (idioma escolhido no render). */
const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

const fmtUsd0 = (n: number) => {
  const en = getLocale() === "en";
  const cur = en ? "$" : "US$ ";
  const loc = en ? "en-US" : "pt-BR";
  return cur + (n >= 1000 ? Math.round(n).toLocaleString(loc) : n.toLocaleString(loc, { maximumFractionDigits: 2 }));
};

export interface AxisSignal {
  key: string;
  label: string;
  group: string; // grupo traduzido p/ exibição
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
  return { tf, dir, label: dir > 0 ? tl("alta", "up") : dir < 0 ? tl("baixa", "down") : tl("lateral", "sideways") };
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
  character: string; // rótulo traduzido (tendência/range/comprimido/—)
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
    return tl(
      "Divergência de baixa: preço fez topo mais alto, mas o RSI não acompanhou.",
      "Bearish divergence: price made a higher high, but RSI didn't follow.",
    );
  const pL1 = minIdx(px, 0, half);
  const pL2 = minIdx(px, half, look);
  if (px[pL2] < px[pL1] && Number.isFinite(rs[pL1]) && Number.isFinite(rs[pL2]) && rs[pL2] > rs[pL1])
    return tl(
      "Divergência de alta: preço fez fundo mais baixo, mas o RSI segurou.",
      "Bullish divergence: price made a lower low, but RSI held.",
    );
  return null;
}

export function computeMarketRead(
  candles: Candle[],
  payload: SnapshotPayload | null,
  intra?: Candle[],
  oiDeltaPct?: number | null,
  bookImbalance?: number | null,
  macro?: { vixChg: number; dxyChg: number; us10yChg: number; nlChg?: number | null; nfci?: number | null } | null,
  btcChg7d?: number | null, // variação 7d do BTC (fração) — p/ rotação de liderança (alts)
): MarketRead {
  const closes = candles.map((c) => c.close);
  const price =
    closes[closes.length - 1] ?? payload?.gamma?.spot_price ?? payload?.price?.binance?.price ?? null;
  const axes: AxisSignal[] = [];
  const divergences: string[] = [];

  // Estrutura de mercado (SMC) reaproveitada da aba Smart Money — price action das
  // velas diárias (swing/interno + BOS/CHoCH + zonas de liquidez + premium/discount).
  const smc = closes.length >= 60 ? computeSmc(candles) : null;
  // Capturados nos eixos de contexto, lidos depois nas divergências (pós-viés).
  let liqTilt: number | null = null;
  let fng: number | null = null;
  let zoneKey: "premium" | "discount" | "equilibrium" | null = null;

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
      label: tl("Tendência", "Trend"),
      group: tl("tendência", "trend"),
      dir: trendDir,
      strength: trendStr,
      available: true,
      detail: `${tl("Preço", "Price")} ${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}% vs EMA200 · EMA50 ${golden ? ">" : "<"} EMA200 (${golden ? "golden" : "death"} cross)`,
    });
  } else {
    axes.push({ key: "trend", label: tl("Tendência", "Trend"), group: tl("tendência", "trend"), dir: 0, strength: 0, available: false, detail: tl("Histórico insuficiente", "Not enough history") });
  }

  // ── Eixo ESTRUTURA (SMC: swing + BOS/CHoCH) — price action, VOTA ────────
  // Complementar à Tendência (EMA): a estrutura vira na MUDANÇA DE CARÁTER (CHoCH),
  // captando reversão antes do cruzamento de médias. Peso médio (reponderado abaixo).
  let structDir: Dir = 0;
  let structStr = 0;
  const haveStruct = !!(smc && smc.swingBias);
  if (smc && smc.swingBias) {
    structDir = smc.swingBias === "bullish" ? 1 : -1;
    const internalAgrees = smc.internalBias != null && smc.internalBias === smc.swingBias;
    structStr = clamp01(internalAgrees ? 0.85 : 0.55);
    const dw = (b: "bullish" | "bearish") => (b === "bullish" ? tl("alta", "up") : tl("baixa", "down"));
    axes.push({
      key: "structure",
      label: tl("Estrutura (price action)", "Structure (price action)"),
      group: tl("tendência", "trend"),
      dir: structDir,
      strength: structStr,
      available: true,
      detail:
        `${tl("Swing", "Swing")} ${dw(smc.swingBias)}` +
        (smc.lastSwing ? ` · ${smc.lastSwing.type} ${dw(smc.lastSwing.bias)}` : "") +
        (smc.internalBias ? ` · ${tl("interno", "internal")} ${dw(smc.internalBias)}` : ""),
    });
  } else {
    axes.push({ key: "structure", label: tl("Estrutura (price action)", "Structure (price action)"), group: tl("tendência", "trend"), dir: 0, strength: 0, available: false, detail: tl("Histórico insuficiente", "Not enough history") });
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
      label: tl("Momento", "Momentum"),
      group: tl("momento", "momentum"),
      dir: momDir,
      strength: momStr,
      available: true,
      detail: `MACD ${histLast >= 0 ? tl("positivo", "positive") : tl("negativo", "negative")} · RSI ${rLast.toFixed(0)}${rLast > 70 ? tl(" (sobrecomprado)", " (overbought)") : rLast < 30 ? tl(" (sobrevendido)", " (oversold)") : ""}`,
    });
    const div = rsiDivergence(closes, rsiArr);
    if (div) divergences.push(div);
  } else {
    axes.push({ key: "momentum", label: tl("Momento", "Momentum"), group: tl("momento", "momentum"), dir: 0, strength: 0, available: false, detail: tl("Histórico insuficiente", "Not enough history") });
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
    flowParts.push(`${tl("prêmio Coinbase", "Coinbase premium")} ${premium >= 0 ? "+" : ""}${(premium * 100).toFixed(2)}%`);
  }
  if (cbCvd != null) {
    instAcc += sign(cbCvd);
    instN++;
    flowParts.push(`${tl("CVD institucional", "Institutional CVD")} ${cbCvd >= 0 ? tl("comprador", "buying") : tl("vendedor", "selling")}`);
  }
  if (etf7 != null) {
    instAcc += sign(etf7);
    instN++;
    flowParts.push(`ETF 7d ${etf7 >= 0 ? tl("entrando", "inflow") : tl("saindo", "outflow")}`);
  }
  const haveFlow = instN > 0;
  const flowDir: Dir = haveFlow ? sign(instAcc) : 0;
  const flowStr = haveFlow ? clamp01(Math.abs(instAcc) / instN) : 0;
  axes.push({
    key: "flow",
    label: tl("Fluxo institucional", "Institutional flow"),
    group: tl("fluxo", "flow"),
    dir: flowDir,
    strength: flowStr,
    available: haveFlow,
    detail: haveFlow ? flowParts.join(" · ") : tl("Indisponível neste ativo", "Not available for this asset"),
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
      label: tl("Posição alavancada", "Leveraged positioning"),
      group: tl("posição", "position"),
      dir: posDir,
      strength: posStr,
      available: true,
      detail: `Funding ${funding >= 0 ? "+" : ""}${funding.toFixed(4)}% (${funding >= 0 ? tl("longs pagam", "longs pay") : tl("shorts pagam", "shorts pay")})${ls != null ? ` · L/S ${ls.toFixed(2)}` : ""}`,
    });
    if (Math.abs(funding) > 0.03)
      divergences.push(
        funding > 0
          ? tl(
              "Funding alto positivo — longs lotados, risco de long squeeze (reversão para baixo).",
              "High positive funding — longs crowded, long-squeeze risk (reversal down).",
            )
          : tl(
              "Funding negativo — shorts lotados, combustível para short squeeze (reversão para cima).",
              "Negative funding — shorts crowded, fuel for a short squeeze (reversal up).",
            ),
      );
  } else {
    axes.push({ key: "position", label: tl("Posição alavancada", "Leveraged positioning"), group: tl("posição", "position"), dir: 0, strength: 0, available: false, detail: tl("Indisponível", "Not available") });
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
      label: tl("Opções (put/call + skew)", "Options (put/call + skew)"),
      group: tl("opções", "options"),
      dir: optDir,
      strength: optStr,
      available: true,
      detail: `Put/Call ${pcr.toFixed(2)}${skew != null ? ` · skew ${skew >= 0 ? "+" : ""}${skew.toFixed(1)}%` : ""}${iv != null ? ` · IV ${iv.toFixed(0)}%` : ""}`,
    });
  } else {
    axes.push({ key: "options", label: tl("Opções (put/call + skew)", "Options (put/call + skew)"), group: tl("opções", "options"), dir: 0, strength: 0, available: false, detail: tl("Indisponível neste ativo", "Not available for this asset") });
  }

  // ── CARÁTER (ADX + ATR percentil + regime de gamma) ─────────────────────
  const adxv = adx(candles, 14);
  const atrArr = atr(candles, 14);
  const atrLast = last(atrArr);
  const atrPct = percentileRank(atrArr.slice(-90), atrLast);
  let charKey: "trend" | "range" | "comprimido" | "none" = "none";
  if (Number.isFinite(adxv)) {
    if (adxv >= 25) charKey = "trend";
    else if (Number.isFinite(atrPct) && atrPct < 30) charKey = "comprimido";
    else charKey = "range";
  }
  const character =
    charKey === "trend" ? tl("tendência", "trending") : charKey === "comprimido" ? tl("comprimido", "compressed") : charKey === "range" ? tl("range", "range") : "—";
  const gammaRegime = payload?.gamma?.regime ?? null;
  const gammaNote =
    gammaRegime === "negative"
      ? tl(
          "Gamma negativo — dealers amplificam o movimento (tende a esticar tendência/volatilidade).",
          "Negative gamma — dealers amplify the move (tends to stretch trend/volatility).",
        )
      : gammaRegime === "positive"
        ? tl(
            "Gamma positivo — dealers amortecem (tende a voltar à média / range).",
            "Positive gamma — dealers dampen (tends to mean-revert / range).",
          )
        : null;
  axes.push({
    key: "character",
    label: tl("Caráter (ADX + gamma)", "Character (ADX + gamma)"),
    group: tl("caráter", "character"),
    dir: 0,
    strength: Number.isFinite(adxv) ? clamp01(adxv / 50) : 0,
    available: Number.isFinite(adxv),
    detail: Number.isFinite(adxv)
      ? `ADX ${adxv.toFixed(0)} (${character})${Number.isFinite(atrPct) ? `${tl(" · volatilidade no percentil ", " · volatility at percentile ")}${atrPct.toFixed(0)}` : ""}${gammaRegime ? ` · gamma ${gammaRegime === "positive" ? tl("positivo", "positive") : tl("negativo", "negative")}` : ""}`
      : tl("Histórico insuficiente", "Not enough history"),
  });

  // ── Contexto: OPEN INTEREST 24h (convicção do movimento; não vota no viés) ──
  if (oiDeltaPct != null && Number.isFinite(oiDeltaPct)) {
    const up = oiDeltaPct > 0;
    axes.push({
      key: "oi",
      label: "Open Interest (24h)",
      group: tl("posição", "position"),
      dir: 0,
      strength: clamp01(Math.abs(oiDeltaPct) / 10),
      available: true,
      detail: `OI ${up ? "+" : ""}${oiDeltaPct.toFixed(1)}% ${tl("em 24h", "in 24h")} — ${up ? tl("posições novas entrando", "new positions opening") : tl("posições saindo (desalavancagem)", "positions closing (deleveraging)")}`,
    });
  }

  // ── Contexto: PRESSÃO DO BOOK (liquidez passiva ±2%; não vota no viés) ──────
  if (bookImbalance != null && Number.isFinite(bookImbalance)) {
    const buy = bookImbalance > 0;
    axes.push({
      key: "book",
      label: tl("Pressão do book", "Book pressure"),
      group: tl("fluxo", "flow"),
      dir: 0,
      strength: clamp01(Math.abs(bookImbalance) / 0.4),
      available: true,
      detail: `Book ${Math.abs(bookImbalance) < 0.05 ? tl("equilibrado", "balanced") : buy ? tl("comprador", "buy-side") : tl("vendedor", "sell-side")} (${bookImbalance >= 0 ? "+" : ""}${(bookImbalance * 100).toFixed(0)}% ±2%) — ${tl("liquidez parada", "resting liquidity")}`,
    });
  }

  // ── Contexto: LIQUIDAÇÕES RECENTES (fluxo forçado long×short; não vota) ──
  const liqL = payload?.derivatives?.liq_long_usd ?? null;
  const liqS = payload?.derivatives?.liq_short_usd ?? null;
  if ((liqL != null && liqL > 0) || (liqS != null && liqS > 0)) {
    const l = liqL ?? 0;
    const s = liqS ?? 0;
    const tot = l + s;
    // tilt > 0 = mais shorts liquidados (compra forçada / squeeze de baixa);
    // tilt < 0 = mais longs liquidados (venda forçada / capitulação alavancada).
    liqTilt = tot > 0 ? (s - l) / tot : 0;
    axes.push({
      key: "liquidations",
      label: tl("Liquidações recentes", "Recent liquidations"),
      group: tl("posição", "position"),
      dir: 0,
      strength: clamp01(Math.abs(liqTilt)),
      available: true,
      detail:
        `${tl("Longs", "Longs")} ${fmtUsd0(l)} · ${tl("Shorts", "Shorts")} ${fmtUsd0(s)} — ` +
        (Math.abs(liqTilt) < 0.2
          ? tl("equilibrado", "balanced")
          : liqTilt > 0
            ? tl("cascata de shorts (forçando compra)", "short cascade (forced buying)")
            : tl("cascata de longs (forçando venda)", "long cascade (forced selling)")),
    });
  }

  // ── Contexto: MARÉ MACRO (risk-on/off via VIX/DXY/juros; não vota no viés) ──
  let macroGate: number | null = null;
  if (macro) {
    let votes = (macro.vixChg < 0 ? 1 : -1) + (macro.dxyChg < 0 ? 1 : -1) + (macro.us10yChg < 0 ? 1 : -1);
    let n = 3;
    if (macro.nlChg != null) {
      votes += macro.nlChg >= 0 ? 1 : -1; // maré de liquidez do Fed (FRED)
      n += 1;
    }
    if (macro.nfci != null) {
      votes += macro.nfci < 0 ? 1 : -1; // condições financeiras (NFCI)
      n += 1;
    }
    macroGate = votes / n;
    const tide = macro.nlChg != null ? ` · ${tl("liquidez Fed", "Fed liquidity")} ${macro.nlChg >= 0 ? "↑" : "↓"}` : "";
    axes.push({
      key: "macro",
      label: tl("Maré macro (liquidez/VIX/juros)", "Macro tide (liquidity/VIX/rates)"),
      group: tl("caráter", "character"),
      dir: 0,
      strength: clamp01(Math.abs(macroGate)),
      available: true,
      detail: `${macroGate > 0.2 ? tl("Risk-on — vento a favor de risco", "Risk-on — tailwind for risk") : macroGate < -0.2 ? tl("Risk-off — vento contra", "Risk-off — headwind") : tl("Neutro", "Neutral")} · VIX ${macro.vixChg >= 0 ? "↑" : "↓"} · DXY ${macro.dxyChg >= 0 ? "↑" : "↓"} · ${tl("juros", "rates")} ${macro.us10yChg >= 0 ? "↑" : "↓"}${tide}`,
    });
  }

  // ── Contexto: DIREÇÃO DO CAPITAL (market-wide: dry powder + uso real + ETF) ──
  // Não vota no viés (é pano de fundo), mas vira divergência quando contraria o movimento.
  let capitalGate: number | null = null;
  const liq = payload?.liquidity;
  if (liq || payload?.etf_flows) {
    let cs = 0;
    let cn = 0;
    if (liq?.stablecoin_chg_7d_pct != null) { cs += liq.stablecoin_chg_7d_pct >= 0.3 ? 1 : liq.stablecoin_chg_7d_pct <= -0.5 ? -1 : 0; cn++; }
    if (liq?.fees_change_7d != null) { cs += liq.fees_change_7d >= 5 ? 1 : liq.fees_change_7d <= -5 ? -1 : 0; cn++; }
    if (liq?.dex_change_7d != null) { cs += liq.dex_change_7d >= 10 ? 1 : liq.dex_change_7d <= -10 ? -1 : 0; cn++; }
    const etf7c = payload?.etf_flows?.flow_7d_usd;
    if (etf7c != null) { cs += etf7c > 0 ? 1 : etf7c < 0 ? -1 : 0; cn++; }
    if (cn) {
      capitalGate = cs / cn;
      axes.push({
        key: "capital",
        label: tl("Direção do capital (market-wide)", "Capital direction (market-wide)"),
        group: tl("fluxo", "flow"),
        dir: 0,
        strength: clamp01(Math.abs(capitalGate)),
        available: true,
        detail:
          capitalGate > 0.2
            ? tl("Capital entrando — vento a favor (dry powder / uso real / ETF)", "Capital flowing in — tailwind (dry powder / real usage / ETF)")
            : capitalGate < -0.2
              ? tl("Capital saindo — vento contra", "Capital flowing out — headwind")
              : tl("Capital de lado", "Capital sideways"),
      });
    }
  }

  // ── Contexto: SENTIMENTO (Fear & Greed; contrarian, não vota) ──────────────
  const fngRaw = payload?.sentiment?.fng_value ?? null;
  if (fngRaw != null && Number.isFinite(fngRaw)) {
    fng = fngRaw;
    const cls =
      fng <= 25 ? tl("medo extremo", "extreme fear") : fng < 45 ? tl("medo", "fear") : fng <= 55 ? tl("neutro", "neutral") : fng < 75 ? tl("ganância", "greed") : tl("ganância extrema", "extreme greed");
    const contr = fng <= 25 ? tl(" · contrarian de alta", " · contrarian bullish") : fng >= 75 ? tl(" · contrarian de baixa", " · contrarian bearish") : "";
    axes.push({
      key: "sentiment",
      label: tl("Sentimento (Fear & Greed)", "Sentiment (Fear & Greed)"),
      group: tl("caráter", "character"),
      dir: 0,
      strength: clamp01(Math.abs(fng - 50) / 50),
      available: true,
      detail: `F&G ${fng.toFixed(0)} — ${cls}${contr}`,
    });
  }

  // ── Contexto: LOCALIZAÇÃO premium/discount (SMC; não vota) ─────────────────
  // Onde o preço está no range (caro × barato) — ortogonal à direção: diz se o
  // movimento entra em zona de realização (premium) ou de reação (discount).
  if (smc && price != null) {
    const range = smc.trailingTop - smc.trailingBottom;
    const posPct = range > 0 ? clamp01((price - smc.trailingBottom) / range) : 0.5;
    zoneKey = price >= smc.premium.bottom ? "premium" : price <= smc.discount.top ? "discount" : "equilibrium";
    const zlabel =
      zoneKey === "premium"
        ? tl("zona premium (caro) — favorece venda/realização", "premium zone (expensive) — favors selling/profit-taking")
        : zoneKey === "discount"
          ? tl("zona discount (barato) — favorece compra", "discount zone (cheap) — favors buying")
          : tl("equilíbrio (meio do range)", "equilibrium (mid-range)");
    axes.push({
      key: "location",
      label: tl("Localização (premium/discount)", "Location (premium/discount)"),
      group: tl("posição", "position"),
      dir: 0,
      strength: clamp01(Math.abs(posPct - 0.5) * 2),
      available: true,
      detail: `${tl("Preço a", "Price at")} ${(posPct * 100).toFixed(0)}% ${tl("do range", "of range")} — ${zlabel}`,
    });
  }

  // ── VIÉS agregado (média ponderada das forças direcionais disponíveis) ───
  // Pesos reponderados ao incluir a Estrutura (SMC). Tendência (EMA) e Estrutura
  // (price action) são da mesma família direcional → divididas (0,22 + 0,18) p/ não
  // dobrar a contagem; fluxo institucional segue alto (0,25). Normalizado por wsum.
  const directional = [
    { dir: trendDir, str: trendStr, w: 0.22, avail: haveTrend },
    { dir: structDir, str: structStr, w: 0.18, avail: haveStruct },
    { dir: momDir, str: momStr, w: 0.18, avail: haveMom },
    { dir: flowDir, str: flowStr, w: 0.25, avail: haveFlow },
    { dir: posDir, str: posStr, w: 0.12, avail: havePos },
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
        ? tl(
            "Preço em alta, mas o fluxo institucional não acompanha — rali pode ser de varejo/alavancagem.",
            "Price rising, but institutional flow isn't following — rally may be retail/leverage-driven.",
          )
        : tl(
            "Preço em baixa, mas o institucional não confirma a venda — possível absorção de fundo.",
            "Price falling, but institutions aren't confirming the selling — possible bottom absorption.",
          ),
    );

  // Divergência tendência × momento (ex.: baixa estrutural com repique de curto prazo).
  if (haveTrend && haveMom && trendDir !== 0 && momDir !== 0 && trendDir !== momDir)
    divergences.push(
      trendDir < 0
        ? tl(
            "Tendência de baixa, mas o momento de curto prazo virou pra cima — possível repique/contra-tendência.",
            "Downtrend, but short-term momentum turned up — possible bounce/counter-trend.",
          )
        : tl(
            "Tendência de alta, mas o momento de curto prazo enfraquece — atenção a uma correção.",
            "Uptrend, but short-term momentum is weakening — watch for a pullback.",
          ),
    );

  // Divergência preço × Open Interest (a "convicção do movimento").
  if (oiDeltaPct != null && Number.isFinite(oiDeltaPct) && Math.abs(oiDeltaPct) > 1.5 && wsum && bias !== 0) {
    if (bias > 0 && oiDeltaPct < 0)
      divergences.push(tl("Alta com OI caindo — short-covering, não demanda nova: o rali tende a perder força.", "Rally with OI falling — short-covering, not new demand: the rally tends to fade."));
    else if (bias < 0 && oiDeltaPct < 0)
      divergences.push(tl("Queda com OI caindo — desalavancagem/liquidação: a baixa pode estar se exaurindo.", "Drop with OI falling — deleveraging/liquidation: the decline may be exhausting."));
    else if (bias < 0 && oiDeltaPct > 0)
      divergences.push(tl("Queda com OI subindo — shorts novos entrando: pressão real, mas munição para um short squeeze.", "Drop with OI rising — new shorts opening: real pressure, but fuel for a short squeeze."));
  }

  // Divergência viés × pressão do book (liquidez passiva contra o movimento).
  if (bookImbalance != null && Number.isFinite(bookImbalance) && Math.abs(bookImbalance) > 0.2 && wsum && bias !== 0) {
    if (bias > 0 && bookImbalance < 0)
      divergences.push(tl("Alta com book vendedor — parede de liquidez à venda acima pode segurar o movimento.", "Rally with sell-side book — a sell wall above may cap the move."));
    else if (bias < 0 && bookImbalance > 0)
      divergences.push(tl("Queda com book comprador — liquidez de compra abaixo pode amortecer a queda.", "Drop with buy-side book — buy liquidity below may cushion the fall."));
  }

  // Divergência viés × maré macro (risk-on/off contra o movimento).
  if (macroGate != null && wsum && bias !== 0) {
    if (bias < 0 && macroGate > 0.3)
      divergences.push(tl("Viés de baixa, mas a maré macro é risk-on (VIX/juros caindo) — pode limitar a queda.", "Bearish bias, but the macro tide is risk-on (VIX/rates falling) — may limit the downside."));
    else if (bias > 0 && macroGate < -0.3)
      divergences.push(tl("Viés de alta contra maré macro risk-off (DXY/juros subindo) — vento contra.", "Bullish bias against a risk-off macro tide (DXY/rates rising) — headwind."));
  }

  // Divergência viés × direção do capital (pano de fundo market-wide contra o movimento).
  if (capitalGate != null && wsum && bias !== 0) {
    if (bias > 0 && capitalGate < -0.3)
      divergences.push(tl("Viés de alta, mas o capital market-wide está saindo (dry powder / uso real caindo) — base frágil.", "Bullish bias, but market-wide capital is leaving (dry powder / real usage falling) — fragile base."));
    else if (bias < 0 && capitalGate > 0.3)
      divergences.push(tl("Viés de baixa, mas o capital market-wide está entrando — pode segurar a queda.", "Bearish bias, but market-wide capital is flowing in — may cushion the downside."));
  }

  // Risco de GAMMA: o regime amplifica/amortece a leitura direcional (não muda o viés,
  // muda a forma como o movimento se comporta). Faz toda leitura ficar consciente de risco.
  if (gammaRegime && wsum && bias !== 0) {
    if (gammaRegime === "negative")
      divergences.push(
        bias > 0
          ? tl(
              "Leitura de alta em gamma negativo — dealers amplificam: maior risco de overshoot e stop-hunt nos dois sentidos.",
              "Bullish read in negative gamma — dealers amplify: higher overshoot and stop-hunt risk both ways.",
            )
          : tl(
              "Leitura de baixa em gamma negativo — quedas tendem a acelerar (dealers vendem fraqueza).",
              "Bearish read in negative gamma — drops tend to accelerate (dealers sell weakness).",
            ),
      );
    else if (gammaRegime === "positive" && Math.abs(bias) >= 25)
      divergences.push(
        tl(
          "Leitura direcional em gamma positivo — dealers amortecem: o movimento tende a perder força perto das paredes (volta à média).",
          "Directional read in positive gamma — dealers dampen: the move tends to stall near the walls (mean-reversion).",
        ),
      );
  }

  // Exaustão de alavancagem: funding esticado + OI caindo = posição se DESFAZENDO
  // (não nova demanda) — o movimento perde combustível, atenção a reversão.
  if (funding != null && oiDeltaPct != null && Number.isFinite(oiDeltaPct) && wsum && bias !== 0) {
    if (bias > 0 && funding > 0.03 && oiDeltaPct < 0)
      divergences.push(tl("Alta com funding esticado e OI caindo — perseguição alavancada se exaurindo (longs realizando, não nova demanda).", "Rally with stretched funding and OI falling — leveraged chase exhausting (longs taking profit, not new demand)."));
    else if (bias < 0 && funding < -0.03 && oiDeltaPct < 0)
      divergences.push(tl("Queda com funding muito negativo e OI caindo — shorts cobrindo posição esticada: a baixa pode estar sem combustível.", "Drop with very negative funding and OI falling — shorts covering a stretched position: the decline may be out of fuel."));
  }

  // Vazamento de posicionamento: maioria lotada de um lado, mas OI ainda SUBINDO =
  // novas posições entrando CONTRA a maioria (zona de batalha / combustível de squeeze).
  if (ls != null && oiDeltaPct != null && Number.isFinite(oiDeltaPct) && oiDeltaPct > 1.5) {
    if (ls >= 1.8)
      divergences.push(tl(`Longs lotados (L/S ${ls.toFixed(2)}), mas OI ainda subindo — novos shorts entrando contra a maioria: zona de batalha e munição para squeeze nos dois sentidos.`, `Longs crowded (L/S ${ls.toFixed(2)}), yet OI still rising — new shorts entering against the crowd: a battleground and fuel for a squeeze both ways.`));
    else if (ls <= 0.55)
      divergences.push(tl(`Shorts lotados (L/S ${ls.toFixed(2)}), mas OI ainda subindo — novos longs entrando contra a maioria: possível fundo em formação / zona de batalha.`, `Shorts crowded (L/S ${ls.toFixed(2)}), yet OI still rising — new longs entering against the crowd: possible bottoming / battleground.`));
  }

  // Rotação de liderança (alts): força/fraqueza relativa ao BTC em 7d. Alt descolando
  // do BTC = rotação de capital; ficando para trás = capital preferindo o BTC.
  if (btcChg7d != null && payload?.asset && payload.asset !== "BTC" && closes.length >= 8) {
    const a0 = closes[closes.length - 8];
    const assetChg7d = a0 ? (closes[closes.length - 1] - a0) / a0 : null;
    if (assetChg7d != null) {
      const rel = (assetChg7d - btcChg7d) * 100; // pontos percentuais vs BTC
      if (rel >= 8)
        divergences.push(tl(`${payload.asset} liderando — +${rel.toFixed(0)}pp vs BTC em 7d: força relativa (capital rotacionando para fora do BTC).`, `${payload.asset} leading — +${rel.toFixed(0)}pp vs BTC over 7d: relative strength (capital rotating out of BTC).`));
      else if (rel <= -8)
        divergences.push(tl(`${payload.asset} ficando para trás — ${rel.toFixed(0)}pp vs BTC em 7d: fraqueza relativa (capital preferindo o BTC).`, `${payload.asset} lagging — ${rel.toFixed(0)}pp vs BTC over 7d: relative weakness (capital favoring BTC).`));
    }
  }

  // Divergência de CVD institucional × varejo (QUEM está dirigindo o fluxo executado).
  // Coinbase = institucional, Binance = varejo. Sinais opostos = acumulação/distribuição.
  const instCvd = payload?.price?.coinbase?.cvd ?? null;
  const retailCvd = payload?.price?.binance?.cvd ?? null;
  if (instCvd != null && retailCvd != null && sign(instCvd) !== 0 && sign(retailCvd) !== 0 && sign(instCvd) !== sign(retailCvd))
    divergences.push(
      instCvd > 0
        ? tl("CVD institucional comprador enquanto o varejo vende — acumulação institucional (tell de alta).", "Institutional CVD buying while retail sells — institutional accumulation (bullish tell).")
        : tl("CVD institucional vendedor enquanto o varejo compra — distribuição para o varejo (tell de baixa).", "Institutional CVD selling while retail buys — distribution into retail (bearish tell)."),
    );

  // Divergência de fluxo PERP × SPOT: movimento alavancado que o spot não confirma.
  const perpCvd = payload?.derivatives?.cvd ?? null;
  const spotCvd = instCvd ?? retailCvd;
  if (perpCvd != null && spotCvd != null && sign(perpCvd) !== 0 && sign(spotCvd) !== 0 && sign(perpCvd) !== sign(spotCvd))
    divergences.push(
      perpCvd > 0
        ? tl("Fluxo de perp comprador, mas o spot vende — alta movida a alavancagem (frágil sem o spot confirmar).", "Perp flow buying but spot selling — leverage-driven rally (fragile without spot confirmation).")
        : tl("Fluxo de perp vendedor, mas o spot compra — pressão alavancada que o spot não confirma.", "Perp flow selling but spot buying — leveraged pressure the spot isn't confirming."),
    );

  // Divergência de FUNDING CEX × on-chain (Hyperliquid) — ONDE a alavancagem está
  // esticada. CEX (Coinalyze) vem em PERCENT; on-chain em fração → ×100 p/ comparar.
  const onchainFundingRaw = payload?.onchain_perps?.funding_rate ?? null;
  const onchainFundingPct = onchainFundingRaw != null ? onchainFundingRaw * 100 : null;
  if (funding != null && onchainFundingPct != null && Math.abs(funding) > 0.005 && Math.abs(onchainFundingPct) > 0.005 && sign(funding) !== sign(onchainFundingPct))
    divergences.push(
      tl(
        `Funding divergente — CEX ${funding >= 0 ? "+" : ""}${funding.toFixed(3)}% vs on-chain ${onchainFundingPct >= 0 ? "+" : ""}${onchainFundingPct.toFixed(3)}% (Hyperliquid): alavancagem oposta entre os ambientes, sem consenso.`,
        `Funding diverges — CEX ${funding >= 0 ? "+" : ""}${funding.toFixed(3)}% vs on-chain ${onchainFundingPct >= 0 ? "+" : ""}${onchainFundingPct.toFixed(3)}% (Hyperliquid): opposite leverage across venues, no consensus.`,
      ),
    );

  // Divergência ESTRUTURA (price action) × TENDÊNCIA (EMA): médias e estrutura
  // discordam = mercado em transição (a estrutura costuma virar primeiro).
  if (haveStruct && haveTrend && structDir !== 0 && trendDir !== 0 && structDir !== trendDir)
    divergences.push(
      tl(
        "Tendência (EMA) e estrutura (price action) divergem — mercado em transição; a estrutura costuma virar antes da média.",
        "Trend (EMA) and structure (price action) disagree — market in transition; structure usually turns before the average.",
      ),
    );

  // Mudança de caráter recente (CHoCH no último swing) — possível início de reversão.
  if (smc?.lastSwing && smc.lastSwing.type === "CHoCH" && candles.length >= 30 && (smc.lastSwing.time as number) >= (candles[candles.length - 30].time as number))
    divergences.push(
      smc.lastSwing.bias === "bullish"
        ? tl("Mudança de caráter (CHoCH) de alta no último swing — possível início de reversão para cima.", "Bullish change of character (CHoCH) on the last swing — possible upside reversal starting.")
        : tl("Mudança de caráter (CHoCH) de baixa no último swing — possível início de reversão para baixo.", "Bearish change of character (CHoCH) on the last swing — possible downside reversal starting."),
    );

  // Localização premium/discount contra o viés (entra em zona de exaustão/reação).
  if (zoneKey && wsum && bias !== 0) {
    if (bias > 0 && zoneKey === "premium")
      divergences.push(tl("Alta entrando em zona premium (cara) — risco de exaustão / realização de lucro.", "Rally pushing into the premium zone (expensive) — exhaustion / profit-taking risk."));
    else if (bias < 0 && zoneKey === "discount")
      divergences.push(tl("Baixa em zona discount (barata) — risco de reação compradora / repique.", "Decline in the discount zone (cheap) — risk of a buy-side reaction / bounce."));
  }

  // Liquidações forçadas confirmando exaustão do movimento (combustível acabando).
  if (liqTilt != null && wsum && bias !== 0) {
    if (bias < 0 && liqTilt < -0.3)
      divergences.push(tl("Queda com cascata de longs liquidados — capitulação alavancada; a baixa pode estar se exaurindo.", "Drop with a long-liquidation cascade — leveraged capitulation; the decline may be exhausting."));
    else if (bias > 0 && liqTilt > 0.3)
      divergences.push(tl("Alta com shorts sendo liquidados — short squeeze em curso: pode esticar, mas é movimento frágil.", "Rally with shorts being liquidated — short squeeze underway: it can stretch, but it's a fragile move."));
  }

  // Sentimento em extremo (sinal contrarian) — euforia/pânico viram zona de virada.
  if (fng != null) {
    if (fng <= 20) divergences.push(tl("Medo extremo no sentimento — zona histórica de exaustão de venda (sinal contrarian de alta).", "Extreme fear in sentiment — historically a sell-exhaustion zone (contrarian bullish)."));
    else if (fng >= 80) divergences.push(tl("Ganância extrema no sentimento — euforia, risco elevado de topo (contrarian de baixa).", "Extreme greed in sentiment — euphoria, elevated top risk (contrarian bearish)."));
  }

  // Varredura de liquidez recente (stop hunt) — precursor clássico de reversão.
  if (smc && smc.liquidity.length) {
    const sweepBuy = smc.liquidity.find((p) => p.sweptRecently && p.side === "buy"); // stops de vendidos acima
    const sweepSell = smc.liquidity.find((p) => p.sweptRecently && p.side === "sell"); // stops de comprados abaixo
    if (sweepBuy)
      divergences.push(tl("Varredura de liquidez recente ACIMA (stop hunt) — buscou stops de vendidos; atenção a reversão para baixo.", "Recent liquidity sweep ABOVE (stop hunt) — grabbed sellers' stops; watch for a reversal down."));
    else if (sweepSell)
      divergences.push(tl("Varredura de liquidez recente ABAIXO (stop hunt) — buscou stops de comprados; atenção a reversão para cima.", "Recent liquidity sweep BELOW (stop hunt) — grabbed buyers' stops; watch for a reversal up."));
  }

  // ── REGIME nomeado ──────────────────────────────────────────────────────
  let regime: MarketRead["regime"];
  if (!wsum) regime = { key: "sem_dados", label: tl("Sem dados suficientes para leitura.", "Not enough data for a read."), tone: "neutral" };
  else if (Math.abs(bias) < 12)
    regime = { key: "indeciso", label: tl("Indeciso — forças em conflito, mercado aguardando catalisador.", "Undecided — forces in conflict, market awaiting a catalyst."), tone: "neutral" };
  else if (charKey === "comprimido")
    regime = {
      key: "comprimido",
      label: tl(
        `Comprimido — volatilidade baixa; o rompimento define o lado (viés leve de ${bias > 0 ? "alta" : "baixa"}).`,
        `Compressed — low volatility; the breakout decides the side (slight ${bias > 0 ? "bullish" : "bearish"} bias).`,
      ),
      tone: bias > 0 ? "bull" : "bear",
    };
  else if (flowOpposesTrend)
    regime = {
      key: "fragil",
      label:
        bias > 0
          ? tl("Alta frágil — preço sobe, mas o fluxo institucional não acompanha.", "Fragile rally — price rises, but institutional flow isn't following.")
          : tl("Baixa frágil — preço cai, mas o institucional não confirma.", "Fragile decline — price falls, but institutions aren't confirming."),
      tone: bias > 0 ? "bull" : "bear",
    };
  else if (bias > 0 && funding != null && funding > 0.03 && (ls ?? 1) > 1.3)
    regime = { key: "squeeze", label: tl("Perseguição alavancada — longs lotados; alta real, mas com risco de squeeze.", "Leveraged chase — longs crowded; real upside, but squeeze risk."), tone: "bull" };
  else
    regime = {
      key: bias > 0 ? "trend_up" : "trend_down",
      label: tl(
        `Tendência de ${bias > 0 ? "alta" : "baixa"}${conviction >= 60 ? " com convicção" : ""} — ${agree} de ${voting} forças alinhadas.`,
        `${bias > 0 ? "Uptrend" : "Downtrend"}${conviction >= 60 ? " with conviction" : ""} — ${agree} of ${voting} forces aligned.`,
      ),
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
  pushT(vp?.vah, tl("VAH · topo do valor", "VAH · top of value"));
  pushT(vp?.val, tl("VAL · base do valor", "VAL · bottom of value"));
  // Ímãs de LIQUIDAÇÃO (reusa o modelo do heatmap): bolsão de shorts acima / longs
  // abaixo. Usa velas intraday (4H) quando disponíveis → zonas próximas e acionáveis.
  const liqGrid = buildLiquidationGrid((intra && intra.length >= 30 ? intra : candles).slice(-120));
  if (liqGrid && price != null) {
    for (const mg of liquidationMagnets(liqGrid, price, 1, 0.35))
      pushT(mg.price, mg.side === "short" ? tl("Liquidação de shorts ↑", "Short liquidations ↑") : tl("Liquidação de longs ↓", "Long liquidations ↓"));
  }
  // Níveis de PRICE ACTION (SMC) como ímãs: order block, FVG e topos/fundos iguais
  // (pools de liquidez). Só o mais próximo acima e abaixo de cada tipo p/ não inundar.
  if (smc && price != null) {
    const px = price;
    const nearAB = <T>(arr: T[], getP: (x: T) => number): T[] => {
      let above: T | null = null;
      let below: T | null = null;
      for (const x of arr) {
        const p = getP(x);
        if (!Number.isFinite(p)) continue;
        if (p >= px) {
          if (!above || p < getP(above)) above = x;
        } else if (!below || p > getP(below)) below = x;
      }
      return [above, below].filter((x): x is T => x !== null);
    };
    for (const ob of nearAB(smc.orderBlocks, (o) => o.mid))
      pushT(ob.mid, ob.bias === "bullish" ? tl("Order block (demanda)", "Order block (demand)") : tl("Order block (oferta)", "Order block (supply)"));
    for (const fv of nearAB(smc.fvgs, (f) => f.mid))
      pushT(fv.mid, fv.bias === "bullish" ? tl("FVG (alta)", "FVG (bullish)") : tl("FVG (baixa)", "FVG (bearish)"));
    for (const eq of nearAB(smc.equals, (e) => e.price))
      pushT(eq.price, eq.kind === "EQH" ? tl("Topos iguais (liquidez)", "Equal highs (liquidity)") : tl("Fundos iguais (liquidez)", "Equal lows (liquidity)"));
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
      falsifier = tl(
        `A leitura de baixa enfraquece se romper acima de ${above.name} (${fmtUsd0(above.p)} · +${(((above.p - price) / price) * 100).toFixed(1)}%).`,
        `The bearish read weakens if it breaks above ${above.name} (${fmtUsd0(above.p)} · +${(((above.p - price) / price) * 100).toFixed(1)}%).`,
      );
    else if (bias > 0 && below)
      falsifier = tl(
        `A leitura de alta enfraquece se perder ${below.name} (${fmtUsd0(below.p)} · ${(((below.p - price) / price) * 100).toFixed(1)}%).`,
        `The bullish read weakens if it loses ${below.name} (${fmtUsd0(below.p)} · ${(((below.p - price) / price) * 100).toFixed(1)}%).`,
      );
    else if (above && below)
      falsifier = tl(
        `Define o lado: alta acima de ${above.name} (${fmtUsd0(above.p)}), baixa abaixo de ${below.name} (${fmtUsd0(below.p)}).`,
        `Picks the side: up above ${above.name} (${fmtUsd0(above.p)}), down below ${below.name} (${fmtUsd0(below.p)}).`,
      );
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
