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
): MarketRead {
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
