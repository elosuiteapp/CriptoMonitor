// Tradução "número cru → leitura" + semáforo (PRD §8.2 e §8.3), bilíngue (PT/EN).
// Regra central: nenhum número cru sem tradução. As funções read* são puras e
// escolhem o idioma via getLocale() (o componente que renderiza já reage à troca).

import { getLocale } from "../hooks/useLocale";
import type { Level } from "./types";

export interface Reading {
  label: string; // leitura no idioma atual (o que aparece no card)
  detail: string; // número bruto (estado expandido)
  level: Level; // cor do semáforo
}

/** Seletor curto PT/EN para os helpers puros deste módulo. */
const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

// Sufixos de magnitude por idioma (tri/bi/mi/mil × T/B/M/K).
const SUF = () => (getLocale() === "en" ? { t: "T", b: "B", m: "M", k: "K", cur: "$" } : { t: " tri", b: " bi", m: " mi", k: " mil", cur: "US$ " });

// ─── Formatadores numéricos ──────────────────────────────────────────────────
export function fmtUsd(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const s = SUF();
  if (abs >= 1e12) return `${sign}${s.cur}${(abs / 1e12).toFixed(digits)}${s.t}`;
  if (abs >= 1e9) return `${sign}${s.cur}${(abs / 1e9).toFixed(digits)}${s.b}`;
  if (abs >= 1e6) return `${sign}${s.cur}${(abs / 1e6).toFixed(digits)}${s.m}`;
  if (abs >= 1e3) return `${sign}${s.cur}${(abs / 1e3).toFixed(digits)}${s.k}`;
  return `${sign}${s.cur}${abs.toFixed(digits)}`;
}

/** Número compacto sem moeda (ex.: 786360 → "786 mil" / "786K"). */
export function fmtCompact(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const s = SUF();
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}${s.b}`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}${s.m}`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)}${s.k}`;
  return `${Math.round(value)}`;
}

/** Nº de casas decimais por magnitude — moedas sub-centavo (ex.: PEPE ~US$0,000003)
 *  precisam de mais casas; usado no preço e na escala dos gráficos. */
export function priceDecimals(value: number | null | undefined): number {
  const a = Math.abs(value ?? 0);
  if (a >= 10) return 2;
  if (a >= 1) return 4;
  if (a >= 0.01) return 4;
  if (a >= 0.0001) return 6;
  return 8;
}

export function fmtPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: priceDecimals(value),
  });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

// ─── Leituras com semáforo ───────────────────────────────────────────────────

/** Funding rate (fração, ex: 0.000125 = +0,0125%). */
export function readFunding(rate: number | null | undefined): Reading {
  if (rate == null) return { label: tl("Funding indisponível", "Funding unavailable"), detail: "—", level: "neutral" };
  const pct = rate * 100;
  const detail = fmtPct(pct, 4);
  if (rate > 0.0005)
    return { label: tl("Comprados pagando caro — risco de squeeze de altas", "Longs paying up — long-squeeze risk"), detail, level: "red" };
  if (rate > 0)
    return { label: tl("Alavancados pagando para ficar comprados — viés otimista", "Leverage paying to stay long — bullish bias"), detail, level: "yellow" };
  if (rate < -0.0005)
    return { label: tl("Vendidos pagando caro — risco de squeeze de baixas", "Shorts paying up — short-squeeze risk"), detail, level: "red" };
  if (rate < 0)
    return { label: tl("Alavancados pagando para ficar vendidos — viés pessimista", "Leverage paying to stay short — bearish bias"), detail, level: "yellow" };
  return { label: tl("Funding neutro — sem pressão alavancada", "Neutral funding — no leverage pressure"), detail, level: "green" };
}

/** CVD (delta de volume agressor, em USD). */
export function readCvd(cvd: number | null | undefined): Reading {
  if (cvd == null) return { label: tl("CVD indisponível", "CVD unavailable"), detail: "—", level: "neutral" };
  const detail = fmtUsd(cvd);
  if (cvd < 0) return { label: tl("Varejo vendendo de forma agressiva", "Retail aggressively selling"), detail, level: "red" };
  if (cvd > 0) return { label: tl("Varejo comprando de forma agressiva", "Retail aggressively buying"), detail, level: "green" };
  return { label: tl("Fluxo de varejo equilibrado", "Balanced retail flow"), detail, level: "yellow" };
}

/** Fear & Greed Index (0–100). */
export function readFng(value: number | null | undefined): Reading {
  if (value == null) return { label: tl("Sentimento indisponível", "Sentiment unavailable"), detail: "—", level: "neutral" };
  const detail = `${value}/100`;
  if (value >= 75) return { label: tl("Ganância extrema — região historicamente de cautela", "Extreme greed — historically a caution zone"), detail, level: "red" };
  if (value >= 55) return { label: tl("Ganância — otimismo predominante", "Greed — optimism prevailing"), detail, level: "yellow" };
  if (value >= 45) return { label: tl("Mercado neutro", "Neutral market"), detail, level: "yellow" };
  if (value >= 25) return { label: tl("Medo — cautela predominante", "Fear — caution prevailing"), detail, level: "yellow" };
  return { label: tl("Medo extremo — região historicamente de oportunidade", "Extreme fear — historically an opportunity zone"), detail, level: "green" };
}

/** Long/short ratio. */
export function readLongShort(ratio: number | null | undefined): Reading {
  if (ratio == null) return { label: tl("Long/short indisponível", "Long/short unavailable"), detail: "—", level: "neutral" };
  const detail = ratio.toFixed(2);
  if (ratio >= 2) return { label: tl("Maioria comprada — atenção a squeeze de baixas", "Mostly long — watch for a long squeeze"), detail, level: "red" };
  if (ratio >= 1.2) return { label: tl("Mais comprados que vendidos", "More longs than shorts"), detail, level: "yellow" };
  if (ratio <= 0.5) return { label: tl("Maioria vendida — atenção a squeeze de altas", "Mostly short — watch for a short squeeze"), detail, level: "red" };
  if (ratio <= 0.8) return { label: tl("Mais vendidos que comprados", "More shorts than longs"), detail, level: "yellow" };
  return { label: tl("Posicionamento equilibrado", "Balanced positioning"), detail, level: "green" };
}

/** Liquidações (notional long vs short em USD). */
export function readLiquidations(
  longUsd: number | null | undefined,
  shortUsd: number | null | undefined,
): Reading {
  if (longUsd == null && shortUsd == null)
    return { label: tl("Liquidações indisponíveis", "Liquidations unavailable"), detail: "—", level: "neutral" };
  const l = longUsd ?? 0;
  const s = shortUsd ?? 0;
  const detail = `Long ${fmtUsd(l)} · Short ${fmtUsd(s)}`;
  if (l > s * 1.5) return { label: tl("Cascata de liquidações compradas — pressão vendedora", "Long-liquidation cascade — selling pressure"), detail, level: "red" };
  if (s > l * 1.5) return { label: tl("Cascata de liquidações vendidas — pressão compradora", "Short-liquidation cascade — buying pressure"), detail, level: "green" };
  return { label: tl("Liquidações equilibradas nos dois lados", "Liquidations balanced on both sides"), detail, level: "yellow" };
}

/** Risco de squeeze: cruza funding (FRAÇÃO), long/short e liquidações para apontar
 *  qual lado alavancado está vulnerável a ser liquidado à força (a "armadilha"). */
export function readSqueezeRisk(
  funding: number | null | undefined, // fração (ex.: 0.0003 = +0,03%)
  longShort: number | null | undefined,
  liqLong: number | null | undefined,
  liqShort: number | null | undefined,
): Reading {
  if (funding == null && longShort == null)
    return { label: tl("Risco de squeeze indisponível", "Squeeze risk unavailable"), detail: "—", level: "neutral" };
  const fr = funding ?? 0;
  const r = longShort ?? 1;
  const l = liqLong ?? 0;
  const s = liqShort ?? 0;
  const flushLong = l > s * 1.5; // longs já sendo liquidados
  const flushShort = s > l * 1.5; // shorts já sendo liquidados
  const detail = `funding ${fmtPct(fr * 100, 4)} · L/S ${r.toFixed(2)}`;

  // Comprados lotados pagando funding caro → vulneráveis a squeeze de BAIXA.
  if (fr > 0.0003 && r >= 1.5)
    return {
      label: flushLong
        ? tl("Squeeze de BAIXA em curso — comprados lotados sendo liquidados", "DOWNSIDE squeeze underway — crowded longs being liquidated")
        : tl("Squeeze de BAIXA armando — comprados lotados pagando funding caro", "DOWNSIDE squeeze building — crowded longs paying high funding"),
      detail,
      level: flushLong ? "red" : "yellow",
    };
  // Vendidos lotados pagando funding caro → vulneráveis a squeeze de ALTA.
  if (fr < -0.0003 && r <= 0.67)
    return {
      label: flushShort
        ? tl("Squeeze de ALTA em curso — vendidos lotados sendo liquidados", "UPSIDE squeeze underway — crowded shorts being liquidated")
        : tl("Squeeze de ALTA armando — vendidos lotados pagando funding caro", "UPSIDE squeeze building — crowded shorts paying high funding"),
      detail,
      level: flushShort ? "red" : "yellow",
    };
  // Pressão de um lado só, sem lotação extrema.
  if (fr > 0.0005) return { label: tl("Comprados pagando caro — risco de squeeze de baixa", "Longs paying up — downside-squeeze risk"), detail, level: "yellow" };
  if (fr < -0.0005) return { label: tl("Vendidos pagando caro — risco de squeeze de alta", "Shorts paying up — upside-squeeze risk"), detail, level: "yellow" };
  return { label: tl("Sem armadilha de squeeze evidente", "No clear squeeze setup"), detail, level: "green" };
}

/** Regime de gamma (PRD §8.5). */
export function readGammaRegime(regime: "positive" | "negative" | null | undefined): Reading {
  if (regime == null) return { label: tl("Regime indisponível", "Regime unavailable"), detail: "—", level: "neutral" };
  if (regime === "positive")
    return {
      label: tl("Volatilidade amortecida — dealers vendem altas e compram quedas; preço tende a grudar", "Dampened volatility — dealers sell rips and buy dips; price tends to pin"),
      detail: tl("GEX líquido positivo", "Net GEX positive"),
      level: "green",
    };
  return {
    label: tl("Movimentos amplificados — dealers aceleram a tendência", "Amplified moves — dealers accelerate the trend"),
    detail: tl("GEX líquido negativo", "Net GEX negative"),
    level: "red",
  };
}

/** Prêmio Coinbase: (preço Coinbase − preço Binance)/Binance — §8.6.3.
 *  Proxy de demanda institucional (Coinbase, US) × varejo/global (Binance).
 *  Positivo = instituições comprando agressivo no spot; negativo = desconto na
 *  Coinbase, varejo/global pressionando e instituições contidas. */
export function readCoinbasePremium(
  premium: number | null | undefined,
  cbVol?: number | null,
  bnVol?: number | null,
): Reading {
  if (premium == null) {
    return { label: tl("Prêmio Coinbase indisponível", "Coinbase premium unavailable"), detail: "—", level: "neutral" };
  }
  const volTxt =
    cbVol != null && bnVol != null
      ? ` · ${tl("vol Coinbase", "Coinbase vol")} ${fmtUsd(cbVol)} vs Binance ${fmtUsd(bnVol)}`
      : "";
  const detail = `${tl("Prêmio", "Premium")} ${fmtPct(premium * 100, 3)}${volTxt}`;
  if (premium >= 0.0015)
    return { label: tl("Prêmio forte na Coinbase — instituições comprando agressivo", "Strong Coinbase premium — institutions buying aggressively"), detail, level: "green" };
  if (premium >= 0.0003)
    return { label: tl("Leve prêmio na Coinbase — bid institucional presente", "Slight Coinbase premium — institutional bid present"), detail, level: "green" };
  if (premium <= -0.0015)
    return { label: tl("Desconto forte na Coinbase — venda institucional, varejo dominando", "Strong Coinbase discount — institutional selling, retail dominating"), detail, level: "red" };
  if (premium <= -0.0003)
    return { label: tl("Leve desconto na Coinbase — varejo pressiona, instituições contidas", "Slight Coinbase discount — retail pressing, institutions holding back"), detail, level: "yellow" };
  return { label: tl("Sem prêmio relevante — institucional e varejo equilibrados", "No meaningful premium — institutions and retail balanced"), detail, level: "yellow" };
}

/** Saúde DeFi: TVL + fluxo de stablecoins 24h (DefiLlama, ETH/SOL) — §8.6.3. */
export function readTvl(
  tvl: number | null | undefined,
  flow: number | null | undefined,
): Reading {
  if (tvl == null) return { label: tl("TVL indisponível", "TVL unavailable"), detail: "—", level: "neutral" };
  const detail = `TVL ${fmtUsd(tvl)}${flow != null ? ` · ${tl("Stablecoins 24h", "Stablecoins 24h")} ${fmtUsd(flow)}` : ""}`;
  if (flow != null && flow > 0)
    return { label: tl(`Rede com ${fmtUsd(tvl)} em TVL — stablecoins entrando, capital novo`, `Network with ${fmtUsd(tvl)} in TVL — stablecoins flowing in, fresh capital`), detail, level: "green" };
  if (flow != null && flow < 0)
    return { label: tl(`Rede com ${fmtUsd(tvl)} em TVL — stablecoins saindo, capital recuando`, `Network with ${fmtUsd(tvl)} in TVL — stablecoins leaving, capital retreating`), detail, level: "yellow" };
  return { label: tl(`Rede com ${fmtUsd(tvl)} em TVL`, `Network with ${fmtUsd(tvl)} in TVL`), detail, level: "neutral" };
}

/** Delta de Open Interest × movimento de preço (4h) — leitura de fluxo (§8.8.4). */
export function readOiDelta(
  oiDelta: number | null | undefined,
  priceDelta: number | null | undefined,
): Reading {
  if (oiDelta == null || priceDelta == null) {
    return { label: tl("Delta de OI — acumulando histórico (4h)", "OI delta — building history (4h)"), detail: "—", level: "neutral" };
  }
  const detail = `OI ${fmtPct(oiDelta * 100, 1)} · ${tl("preço", "price")} ${fmtPct(priceDelta * 100, 1)} (4h)`;
  const oiUp = oiDelta >= 0;
  const priceUp = priceDelta >= 0;
  if (oiUp && priceUp) return { label: tl("Novas compras alavancadas — momentum de alta", "New leveraged buying — bullish momentum"), detail, level: "green" };
  if (oiUp && !priceUp) return { label: tl("Novas vendas alavancadas — atenção a squeeze", "New leveraged selling — watch for a squeeze"), detail, level: "red" };
  if (!oiUp && priceUp) return { label: tl("Short cobrindo — squeeze em andamento", "Shorts covering — squeeze in progress"), detail, level: "yellow" };
  return { label: tl("Long capitulando — desalavancagem", "Longs capitulating — deleveraging"), detail, level: "yellow" };
}

/** Ativo macro (DXY, S&P, ouro, 10Y) + correlação 30d com o cripto (§8.8.3). */
export function readMacro(
  name: string,
  change7d: number | null,
  corr: number | null,
  asset: string,
): Reading {
  const chg = change7d != null ? fmtPct(change7d * 100, 1) : "—";
  const corrTxt = corr != null ? corr.toFixed(2) : "—";
  const detail = `${name} · 7d ${chg} · ${tl("correlação 30d com", "30d correlation with")} ${asset}: ${corrTxt}`;
  if (corr == null) {
    return { label: tl(`${name}: ${chg} em 7d`, `${name}: ${chg} over 7d`), detail, level: "neutral" };
  }
  const abs = Math.abs(corr);
  const strength = abs >= 0.5 ? tl("forte", "strong") : abs >= 0.3 ? tl("moderada", "moderate") : tl("fraca", "weak");
  const dir = corr < 0 ? tl("inversa", "inverse") : tl("direta", "direct");
  return {
    label: tl(
      `${name} ${chg} em 7d · correlação ${dir} ${strength} (${corrTxt}) com ${asset}`,
      `${name} ${chg} over 7d · ${strength} ${dir} correlation (${corrTxt}) with ${asset}`,
    ),
    detail,
    level: abs >= 0.5 ? "yellow" : "neutral",
  };
}

/** Fluxo líquido de exchanges (§8.8.2). netflow > 0 = entrando (venda), < 0 = saindo (acumulação). */
export function readExchangeFlow(netflow: number | null | undefined, asset: string): Reading {
  if (netflow == null) return { label: tl("Fluxo de exchanges indisponível", "Exchange flow unavailable"), detail: "—", level: "neutral" };
  const detail = `Netflow 24h: ${netflow > 0 ? "+" : ""}${netflow.toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR")} ${asset}`;
  if (netflow < 0) return { label: tl(`Saída líquida das exchanges — sinal de acumulação`, "Net outflow from exchanges — accumulation signal"), detail, level: "green" };
  if (netflow > 0) return { label: tl(`Entrada líquida nas exchanges — possível pressão vendedora`, "Net inflow to exchanges — possible selling pressure"), detail, level: "red" };
  return { label: tl("Fluxo de exchanges equilibrado", "Balanced exchange flow"), detail, level: "yellow" };
}

/** Tempo relativo curto ("há 2h" / "2h ago"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const en = getLocale() === "en";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return en ? "now" : "agora";
  if (min < 60) return en ? `${min}m ago` : `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return en ? `${h}h ago` : `há ${h}h`;
  const d = Math.round(h / 24);
  return en ? `${d}d ago` : `há ${d}d`;
}

/** Put/Call ratio por OI (Deribit). >1 = mais puts (defensivo); <0,7 = mais calls (otimista). */
export function readPutCall(ratio: number | null | undefined): { label: string; level: Level } {
  if (ratio == null) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  if (ratio >= 1.2) return { label: tl("Mais puts que calls — proteção / viés defensivo", "More puts than calls — protection / defensive bias"), level: "red" };
  if (ratio >= 0.9) return { label: tl("Equilíbrio com leve viés defensivo", "Balanced with a slight defensive bias"), level: "yellow" };
  if (ratio <= 0.6) return { label: tl("Predomínio de calls — viés otimista", "Calls dominating — bullish bias"), level: "green" };
  return { label: tl("Mais calls que puts — viés levemente otimista", "More calls than puts — slightly bullish bias"), level: "yellow" };
}

/** IV média ponderada (%). Nível de volatilidade implícita esperada. */
export function readIvLevel(iv: number | null | undefined): { label: string; level: Level } {
  if (iv == null) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  if (iv >= 80) return { label: tl("Volatilidade implícita alta — mercado esperando grandes movimentos", "High implied volatility — market expecting big moves"), level: "red" };
  if (iv >= 50) return { label: tl("Volatilidade implícita moderada", "Moderate implied volatility"), level: "yellow" };
  return { label: tl("Volatilidade implícita baixa — mercado calmo", "Low implied volatility — calm market"), level: "green" };
}

/** Skew de IV (puts − calls, %). Positivo = medo de queda; negativo = demanda de alta. */
export function readSkew(skew: number | null | undefined): { label: string; level: Level } {
  if (skew == null) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  if (skew >= 3) return { label: tl("Puts mais caros — proteção contra queda em alta", "Puts richer — downside protection in demand"), level: "red" };
  if (skew <= -3) return { label: tl("Calls mais caros — demanda por alta", "Calls richer — upside in demand"), level: "green" };
  return { label: tl("Skew neutro entre puts e calls", "Neutral skew between puts and calls"), level: "yellow" };
}

/** Participação institucional no volume spot: Coinbase (institucional/US) vs varejo
 *  agregado (Binance + OKX). Quanto maior a fatia da Coinbase, mais presença
 *  institucional/US; fatia baixa = mercado dominado pelo varejo/global. */
export function readInstitutionalShare(
  instVol: number | null | undefined,
  retailVol: number | null | undefined,
): Reading {
  if (instVol == null || retailVol == null || instVol + retailVol <= 0) {
    return { label: tl("Participação institucional indisponível", "Institutional share unavailable"), detail: "—", level: "neutral" };
  }
  const share = (instVol / (instVol + retailVol)) * 100;
  const detail = tl(
    `Institucional (Coinbase) ${fmtUsd(instVol)} · Varejo (Binance+OKX) ${fmtUsd(retailVol)} · institucional ${share.toFixed(1)}% do spot`,
    `Institutional (Coinbase) ${fmtUsd(instVol)} · Retail (Binance+OKX) ${fmtUsd(retailVol)} · institutional ${share.toFixed(1)}% of spot`,
  );
  if (share >= 25)
    return { label: tl(`Institucional forte — ${share.toFixed(0)}% do volume spot na Coinbase`, `Strong institutional — ${share.toFixed(0)}% of spot volume on Coinbase`), detail, level: "green" };
  if (share <= 12)
    return { label: tl(`Mercado dominado pelo varejo — institucional só ${share.toFixed(0)}% do spot`, `Retail-dominated market — institutions only ${share.toFixed(0)}% of spot`), detail, level: "yellow" };
  return { label: tl(`Institucional em ${share.toFixed(0)}% do volume spot — proporção típica`, `Institutions at ${share.toFixed(0)}% of spot volume — typical split`), detail, level: "neutral" };
}

/**
 * Viés Institucional × Varejo — síntese única de 3 sinais (§8.6.3): Prêmio Coinbase
 * (preço), Participação Institucional (volume) e CVD agressor institucional×varejo.
 * Resume "quem está no comando" numa leitura só, com os números no detalhe.
 */
export function readInstitutionalBias(
  premium: number | null | undefined,
  instVol: number | null | undefined,
  retailVol: number | null | undefined,
  instCvd: number | null | undefined,
  retailCvd: number | null | undefined,
): Reading {
  let score = 0;
  let signals = 0;

  // 1) Prêmio Coinbase — sinal direcional principal (instituições pagando mais/menos)
  if (premium != null) {
    signals++;
    if (premium >= 0.0015) score += 2;
    else if (premium >= 0.0003) score += 1;
    else if (premium <= -0.0015) score -= 2;
    else if (premium <= -0.0003) score -= 1;
  }

  // 2) CVD institucional vs varejo — divergência de fluxo agressor (smart money)
  if (instCvd != null) {
    signals++;
    if (instCvd > 0) score += retailCvd != null && retailCvd < 0 ? 1.5 : 0.5;
    else if (instCvd < 0) score += retailCvd != null && retailCvd > 0 ? -1.5 : -0.5;
  }

  // 3) Participação institucional — modula o contexto (confiança), não a direção
  let share: number | null = null;
  if (instVol != null && retailVol != null && instVol + retailVol > 0) {
    share = (instVol / (instVol + retailVol)) * 100;
  }

  if (!signals) {
    return { label: tl("Viés institucional indisponível", "Institutional bias unavailable"), detail: "—", level: "neutral" };
  }

  const parts: string[] = [];
  if (premium != null) parts.push(`${tl("Prêmio", "Premium")} ${fmtPct(premium * 100, 3)}`);
  if (share != null) parts.push(tl(`Institucional ${share.toFixed(0)}% do spot`, `Institutional ${share.toFixed(0)}% of spot`));
  if (instCvd != null) parts.push(`${tl("CVD inst.", "Inst. CVD")} ${fmtUsd(instCvd)}`);
  if (retailCvd != null) parts.push(`${tl("CVD varejo", "Retail CVD")} ${fmtUsd(retailCvd)}`);
  const detail = parts.join(" · ");

  const ctx = share == null ? "" : share >= 25 ? tl(" · instituições muito ativas", " · institutions very active") : share <= 12 ? tl(" · varejo dominando o volume", " · retail dominating volume") : "";

  if (score >= 2.5)
    return { label: tl(`Institucional comprando com convicção — fluxo e prêmio a favor${ctx}`, `Institutions buying with conviction — flow and premium aligned${ctx}`), detail, level: "green" };
  if (score >= 1)
    return { label: tl(`Viés institucional comprador — smart money mais firme que o varejo${ctx}`, `Institutional buy bias — smart money firmer than retail${ctx}`), detail, level: "green" };
  if (score <= -2.5)
    return { label: tl(`Institucional distribuindo — smart money vendendo, varejo segurando${ctx}`, `Institutions distributing — smart money selling, retail holding${ctx}`), detail, level: "red" };
  if (score <= -1)
    return { label: tl(`Viés institucional vendedor — instituições reduzindo exposição${ctx}`, `Institutional sell bias — institutions trimming exposure${ctx}`), detail, level: "yellow" };
  return { label: tl(`Institucional e varejo equilibrados — sem comando claro${ctx}`, `Institutions and retail balanced — no clear lead${ctx}`), detail, level: "yellow" };
}

/** IV Percentile 90d (0-100): onde a IV atual está na faixa dos últimos 90 dias. */
export function readIvp(ivp: number | null | undefined): { label: string; level: Level } {
  if (ivp == null) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  if (ivp >= 70) return { label: tl("Volatilidade implícita em zona alta — opções caras, vendedores favorecidos", "Implied vol in a high zone — expensive options, sellers favored"), level: "red" };
  if (ivp <= 30) return { label: tl("Volatilidade implícita em zona baixa — opções baratas, compradores favorecidos", "Implied vol in a low zone — cheap options, buyers favored"), level: "green" };
  return { label: tl("Volatilidade implícita em zona neutra", "Implied vol in a neutral zone"), level: "yellow" };
}

/** IV-RV spread: prêmio de risco (implícita − realizada). Normaliza por |RV|. */
export function readIvRvSpread(
  spread: number | null | undefined,
  rv: number | null | undefined,
): { label: string; level: Level } {
  if (spread == null || rv == null || rv === 0) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  const pct = (spread / Math.abs(rv)) * 100;
  if (pct > 10) return { label: tl("Opções precificando muito mais volatilidade que a realizada — prêmio de risco elevado", "Options pricing far more vol than realized — elevated risk premium"), level: "red" };
  if (pct < -10) return { label: tl("Opções subprecificadas vs. volatilidade realizada — possível oportunidade compradora de vol", "Options underpriced vs. realized vol — possible long-vol opportunity"), level: "green" };
  return { label: tl("Implícita e realizada alinhadas", "Implied and realized aligned"), level: "yellow" };
}

/** Term structure: compara o curto (7d) com o médio (90d). */
export function readTermStructure(term: Record<string, number> | null | undefined): { label: string; level: Level } {
  const short = term?.["7d"];
  const back = term?.["90d"];
  if (short == null || back == null) return { label: tl("indisponível", "unavailable"), level: "neutral" };
  if (short > back) return { label: tl("Backwardation — mercado pricing evento de curto prazo", "Backwardation — market pricing a near-term event"), level: "yellow" };
  return { label: tl("Estrutura normal — mercado tranquilo", "Normal structure — calm market"), level: "green" };
}

/** ETFs spot (BTC/ETH): fluxo líquido do último dia útil + sequência de dias. */
export function readEtfFlow(
  net: number | null | undefined,
  streak: number | null | undefined,
  flow7d: number | null | undefined,
  asOf?: string | null,
): Reading {
  if (net == null) return { label: tl("ETFs spot indisponível", "Spot ETFs unavailable"), detail: "—", level: "neutral" };
  const days = Math.abs(streak ?? 0);
  const seq = days >= 2
    ? tl(` · ${days}º dia de ${net >= 0 ? "entradas" : "saídas"}`, ` · day ${days} of ${net >= 0 ? "inflows" : "outflows"}`)
    : "";
  const detail =
    `${tl("Dia", "Day")} ${fmtUsd(net)}${flow7d != null ? ` · 7d ${fmtUsd(flow7d)}` : ""}${asOf ? ` · ${asOf}` : ""}`;
  if (net > 0) return { label: tl(`ETFs spot comprando${seq} — entrada institucional`, `Spot ETFs buying${seq} — institutional inflow`), detail, level: "green" };
  if (net < 0) return { label: tl(`ETFs spot vendendo${seq} — saída institucional`, `Spot ETFs selling${seq} — institutional outflow`), detail, level: "red" };
  return { label: tl("ETFs spot sem fluxo no dia", "Spot ETFs flat on the day"), detail, level: "yellow" };
}

/** Liquidez de mercado: oferta de stablecoins (dry powder) + dominância + TVL DeFi. */
export function readMarketLiquidity(
  totalSc: number | null | undefined,
  chg7dPct: number | null | undefined,
  totalMcap?: number | null,
  tvl?: number | null,
): Reading {
  if (totalSc == null) return { label: tl("Liquidez de mercado indisponível", "Market liquidity unavailable"), detail: "—", level: "neutral" };
  const dom = totalMcap ? (totalSc / totalMcap) * 100 : null;
  const detail =
    `Stablecoins ${fmtUsd(totalSc)}${chg7dPct != null ? ` (7d ${fmtPct(chg7dPct, 2)})` : ""}` +
    `${dom != null ? ` · ${tl("dominância", "dominance")} ${dom.toFixed(1)}%` : ""}${tvl != null ? ` · TVL DeFi ${fmtUsd(tvl)}` : ""}`;
  if (chg7dPct != null && chg7dPct >= 0.3)
    return { label: tl("Liquidez entrando — oferta de stablecoins subindo (dry powder)", "Liquidity flowing in — stablecoin supply rising (dry powder)"), detail, level: "green" };
  if (chg7dPct != null && chg7dPct <= -0.3)
    return { label: tl("Liquidez recuando — stablecoins saindo do mercado", "Liquidity retreating — stablecoins leaving the market"), detail, level: "yellow" };
  return { label: tl("Liquidez estável — oferta de stablecoins de lado", "Liquidity steady — stablecoin supply flat"), detail, level: "neutral" };
}

/** Posicionamento institucional em opções (Deribit): Put/Call ratio + skew de IV. */
export function readOptionsPositioning(
  pcr: number | null | undefined,
  skew: number | null | undefined,
): Reading {
  if (pcr == null && skew == null) return { label: tl("Opções indisponível", "Options unavailable"), detail: "—", level: "neutral" };
  const detail = `Put/Call ${pcr != null ? pcr.toFixed(2) : "—"} · Skew ${skew != null ? fmtPct(skew, 1) : "—"}`;
  let score = 0;
  if (pcr != null) score += pcr >= 1.2 ? -1 : pcr <= 0.7 ? 1 : 0;
  if (skew != null) score += skew >= 3 ? -1 : skew <= -3 ? 1 : 0;
  if (score <= -1)
    return { label: tl("Hedge institucional elevado — puts caros, demanda por proteção", "Elevated institutional hedging — puts rich, demand for protection"), detail, level: "red" };
  if (score >= 1)
    return { label: tl("Apetite por alta — calls demandados, pouca proteção", "Upside appetite — calls in demand, little protection"), detail, level: "green" };
  return { label: tl("Opções equilibradas entre proteção e alta", "Options balanced between protection and upside"), detail, level: "yellow" };
}

// ─── Utilidades de UI ────────────────────────────────────────────────────────
// Semáforo refinado (institucional): emerald/amber/rose em vez das cores cruas.
export const LEVEL_DOT: Record<Level, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  neutral: "bg-slate-400 dark:bg-slate-500",
};

export const LEVEL_RING: Record<Level, string> = {
  green: "ring-emerald-500/40",
  yellow: "ring-amber-500/40",
  red: "ring-rose-500/40",
  neutral: "ring-slate-400/40",
};

/** Cor de TEXTO por nível (claro/escuro) — para valores numéricos e rótulos. */
export const LEVEL_TEXT: Record<Level, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  yellow: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
  neutral: "text-muted-foreground",
};

/** Moedas com a camada institucional COMPLETA (gamma/opções/DVOL/CVD-Coinbase) —
 *  exigem bolsa de opções líquida (Deribit BTC/ETH, Bybit SOL). As demais têm o
 *  cockpit de derivativos & fluxo (funding/OI/long-short/liquidações/book). */
export const INSTITUTIONAL_ASSETS = ["BTC", "ETH", "SOL"];
export const isInstitutional = (asset: string) => INSTITUTIONAL_ASSETS.includes(asset);

export const ASSET_NAME: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  SUI: "Sui",
  TON: "Toncoin",
  POL: "Polygon",
  DOT: "Polkadot",
  LTC: "Litecoin",
  AAVE: "Aave",
  UNI: "Uniswap",
  LDO: "Lido DAO",
  ARB: "Arbitrum",
  ATOM: "Cosmos",
  PEPE: "Pepe",
  // Moedas adicionais do Smart Money (price-action via Binance)
  TRX: "TRON", BCH: "Bitcoin Cash", NEAR: "NEAR", APT: "Aptos", ICP: "Internet Computer",
  FIL: "Filecoin", ETC: "Ethereum Classic", HBAR: "Hedera", XLM: "Stellar", IMX: "Immutable",
  OP: "Optimism", INJ: "Injective", VET: "VeChain", GRT: "The Graph", ALGO: "Algorand",
  STX: "Stacks", RENDER: "Render", MKR: "Maker", SAND: "The Sandbox", MANA: "Decentraland",
  AXS: "Axie Infinity", THETA: "Theta", XTZ: "Tezos", EOS: "EOS", CHZ: "Chiliz",
  GALA: "Gala", CRV: "Curve", SNX: "Synthetix", COMP: "Compound", APE: "ApeCoin",
  FLOW: "Flow", EGLD: "MultiversX", DYDX: "dYdX", ENS: "Ethereum Name Service", SEI: "Sei",
  TIA: "Celestia", WIF: "dogwifhat", BONK: "Bonk", JUP: "Jupiter", WLD: "Worldcoin",
  ENA: "Ethena", ORDI: "ORDI", PENDLE: "Pendle", FET: "Fetch.ai", RUNE: "THORChain",
  KAVA: "Kava", ROSE: "Oasis", ZEC: "Zcash", DASH: "Dash", "1INCH": "1inch",
  ZIL: "Zilliqa", ENJ: "Enjin", BAT: "Basic Attention", QNT: "Quant", NEO: "Neo",
  IOTA: "IOTA", KSM: "Kusama", GMT: "GMT", JASMY: "JasmyCoin", MASK: "Mask Network",
  CFX: "Conflux", AR: "Arweave", ONDO: "Ondo", TWT: "Trust Wallet", GMX: "GMX",
  SUSHI: "SushiSwap", YFI: "yearn.finance", ANKR: "Ankr", CELO: "Celo", SKL: "SKALE",
  LRC: "Loopring", ONT: "Ontology", RVN: "Ravencoin", STORJ: "Storj", FLOKI: "Floki",
  PYTH: "Pyth Network", JTO: "Jito", STRK: "Starknet", BLUR: "Blur", W: "Wormhole",
};
