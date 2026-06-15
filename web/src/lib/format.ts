// Tradução "número cru → leitura em português" + semáforo (PRD §8.2 e §8.3).
// Regra central: nenhum número cru sem tradução.

import type { Level } from "./types";

export interface Reading {
  label: string; // leitura em português (o que aparece no card)
  detail: string; // número bruto (estado expandido)
  level: Level; // cor do semáforo
}

// ─── Formatadores numéricos ──────────────────────────────────────────────────
export function fmtUsd(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}US$ ${(abs / 1e12).toFixed(digits)} tri`;
  if (abs >= 1e9) return `${sign}US$ ${(abs / 1e9).toFixed(digits)} bi`;
  if (abs >= 1e6) return `${sign}US$ ${(abs / 1e6).toFixed(digits)} mi`;
  if (abs >= 1e3) return `${sign}US$ ${(abs / 1e3).toFixed(digits)} mil`;
  return `${sign}US$ ${abs.toFixed(digits)}`;
}

export function fmtPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 10 ? 4 : 2,
  });
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

// ─── Leituras com semáforo ───────────────────────────────────────────────────

/** Funding rate (fração, ex: 0.000125 = +0,0125%). */
export function readFunding(rate: number | null | undefined): Reading {
  if (rate == null) return { label: "Funding indisponível", detail: "—", level: "neutral" };
  const pct = rate * 100;
  const detail = fmtPct(pct, 4);
  if (rate > 0.0005)
    return { label: "Comprados pagando caro — risco de squeeze de altas", detail, level: "red" };
  if (rate > 0)
    return { label: "Alavancados pagando para ficar comprados — viés otimista", detail, level: "yellow" };
  if (rate < -0.0005)
    return { label: "Vendidos pagando caro — risco de squeeze de baixas", detail, level: "red" };
  if (rate < 0)
    return { label: "Alavancados pagando para ficar vendidos — viés pessimista", detail, level: "yellow" };
  return { label: "Funding neutro — sem pressão alavancada", detail, level: "green" };
}

/** CVD (delta de volume agressor, em USD). */
export function readCvd(cvd: number | null | undefined): Reading {
  if (cvd == null) return { label: "CVD indisponível", detail: "—", level: "neutral" };
  const detail = fmtUsd(cvd);
  if (cvd < 0) return { label: "Varejo vendendo de forma agressiva", detail, level: "red" };
  if (cvd > 0) return { label: "Varejo comprando de forma agressiva", detail, level: "green" };
  return { label: "Fluxo de varejo equilibrado", detail, level: "yellow" };
}

/** Fear & Greed Index (0–100). */
export function readFng(value: number | null | undefined): Reading {
  if (value == null) return { label: "Sentimento indisponível", detail: "—", level: "neutral" };
  const detail = `${value}/100`;
  if (value >= 75) return { label: "Ganância extrema — região historicamente de cautela", detail, level: "red" };
  if (value >= 55) return { label: "Ganância — otimismo predominante", detail, level: "yellow" };
  if (value >= 45) return { label: "Mercado neutro", detail, level: "yellow" };
  if (value >= 25) return { label: "Medo — cautela predominante", detail, level: "yellow" };
  return { label: "Medo extremo — região historicamente de oportunidade", detail, level: "green" };
}

/** Long/short ratio. */
export function readLongShort(ratio: number | null | undefined): Reading {
  if (ratio == null) return { label: "Long/short indisponível", detail: "—", level: "neutral" };
  const detail = ratio.toFixed(2);
  if (ratio >= 2) return { label: "Maioria comprada — atenção a squeeze de baixas", detail, level: "red" };
  if (ratio >= 1.2) return { label: "Mais comprados que vendidos", detail, level: "yellow" };
  if (ratio <= 0.5) return { label: "Maioria vendida — atenção a squeeze de altas", detail, level: "red" };
  if (ratio <= 0.8) return { label: "Mais vendidos que comprados", detail, level: "yellow" };
  return { label: "Posicionamento equilibrado", detail, level: "green" };
}

/** Liquidações (notional long vs short em USD). */
export function readLiquidations(
  longUsd: number | null | undefined,
  shortUsd: number | null | undefined,
): Reading {
  if (longUsd == null && shortUsd == null)
    return { label: "Liquidações indisponíveis", detail: "—", level: "neutral" };
  const l = longUsd ?? 0;
  const s = shortUsd ?? 0;
  const detail = `Long ${fmtUsd(l)} · Short ${fmtUsd(s)}`;
  if (l > s * 1.5) return { label: "Cascata de liquidações compradas — pressão vendedora", detail, level: "red" };
  if (s > l * 1.5) return { label: "Cascata de liquidações vendidas — pressão compradora", detail, level: "green" };
  return { label: "Liquidações equilibradas nos dois lados", detail, level: "yellow" };
}

/** Regime de gamma (PRD §8.5). */
export function readGammaRegime(regime: "positive" | "negative" | null | undefined): Reading {
  if (regime == null) return { label: "Regime indisponível", detail: "—", level: "neutral" };
  if (regime === "positive")
    return {
      label: "Volatilidade amortecida — dealers vendem altas e compram quedas; preço tende a grudar",
      detail: "GEX líquido positivo",
      level: "green",
    };
  return {
    label: "Movimentos amplificados — dealers aceleram a tendência",
    detail: "GEX líquido negativo",
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
    return { label: "Prêmio Coinbase indisponível", detail: "—", level: "neutral" };
  }
  const volTxt =
    cbVol != null && bnVol != null
      ? ` · vol Coinbase ${fmtUsd(cbVol)} vs Binance ${fmtUsd(bnVol)}`
      : "";
  const detail = `Prêmio ${fmtPct(premium * 100, 3)}${volTxt}`;
  if (premium >= 0.0015)
    return { label: "Prêmio forte na Coinbase — instituições comprando agressivo", detail, level: "green" };
  if (premium >= 0.0003)
    return { label: "Leve prêmio na Coinbase — bid institucional presente", detail, level: "green" };
  if (premium <= -0.0015)
    return { label: "Desconto forte na Coinbase — venda institucional, varejo dominando", detail, level: "red" };
  if (premium <= -0.0003)
    return { label: "Leve desconto na Coinbase — varejo pressiona, instituições contidas", detail, level: "yellow" };
  return { label: "Sem prêmio relevante — institucional e varejo equilibrados", detail, level: "yellow" };
}

/** Saúde DeFi: TVL + fluxo de stablecoins 24h (DefiLlama, ETH/SOL) — §8.6.3. */
export function readTvl(
  tvl: number | null | undefined,
  flow: number | null | undefined,
): Reading {
  if (tvl == null) return { label: "TVL indisponível", detail: "—", level: "neutral" };
  const detail = `TVL ${fmtUsd(tvl)}${flow != null ? ` · Stablecoins 24h ${fmtUsd(flow)}` : ""}`;
  if (flow != null && flow > 0)
    return { label: `Rede com ${fmtUsd(tvl)} em TVL — stablecoins entrando, capital novo`, detail, level: "green" };
  if (flow != null && flow < 0)
    return { label: `Rede com ${fmtUsd(tvl)} em TVL — stablecoins saindo, capital recuando`, detail, level: "yellow" };
  return { label: `Rede com ${fmtUsd(tvl)} em TVL`, detail, level: "neutral" };
}

/** Delta de Open Interest × movimento de preço (4h) — leitura de fluxo (§8.8.4). */
export function readOiDelta(
  oiDelta: number | null | undefined,
  priceDelta: number | null | undefined,
): Reading {
  if (oiDelta == null || priceDelta == null) {
    return { label: "Delta de OI — acumulando histórico (4h)", detail: "—", level: "neutral" };
  }
  const detail = `OI ${fmtPct(oiDelta * 100, 1)} · preço ${fmtPct(priceDelta * 100, 1)} (4h)`;
  const oiUp = oiDelta >= 0;
  const priceUp = priceDelta >= 0;
  if (oiUp && priceUp) return { label: "Novas compras alavancadas — momentum de alta", detail, level: "green" };
  if (oiUp && !priceUp) return { label: "Novas vendas alavancadas — atenção a squeeze", detail, level: "red" };
  if (!oiUp && priceUp) return { label: "Short cobrindo — squeeze em andamento", detail, level: "yellow" };
  return { label: "Long capitulando — desalavancagem", detail, level: "yellow" };
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
  const detail = `${name} · 7d ${chg} · correlação 30d com ${asset}: ${corrTxt}`;
  if (corr == null) {
    return { label: `${name}: ${chg} em 7d`, detail, level: "neutral" };
  }
  const abs = Math.abs(corr);
  const strength = abs >= 0.5 ? "forte" : abs >= 0.3 ? "moderada" : "fraca";
  const dir = corr < 0 ? "inversa" : "direta";
  return {
    label: `${name} ${chg} em 7d · correlação ${dir} ${strength} (${corrTxt}) com ${asset}`,
    detail,
    level: abs >= 0.5 ? "yellow" : "neutral",
  };
}

/** Fluxo líquido de exchanges (§8.8.2). netflow > 0 = entrando (venda), < 0 = saindo (acumulação). */
export function readExchangeFlow(netflow: number | null | undefined, asset: string): Reading {
  if (netflow == null) return { label: "Fluxo de exchanges indisponível", detail: "—", level: "neutral" };
  const detail = `Netflow 24h: ${netflow > 0 ? "+" : ""}${netflow.toLocaleString("pt-BR")} ${asset}`;
  if (netflow < 0) return { label: `Saída líquida das exchanges — sinal de acumulação`, detail, level: "green" };
  if (netflow > 0) return { label: `Entrada líquida nas exchanges — possível pressão vendedora`, detail, level: "red" };
  return { label: "Fluxo de exchanges equilibrado", detail, level: "yellow" };
}

/** Tempo relativo curto em PT-BR ("há 2h", "há 30min"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d}d`;
}

/** Put/Call ratio por OI (Deribit). >1 = mais puts (defensivo); <0,7 = mais calls (otimista). */
export function readPutCall(ratio: number | null | undefined): { label: string; level: Level } {
  if (ratio == null) return { label: "indisponível", level: "neutral" };
  if (ratio >= 1.2) return { label: "Mais puts que calls — proteção / viés defensivo", level: "red" };
  if (ratio >= 0.9) return { label: "Equilíbrio com leve viés defensivo", level: "yellow" };
  if (ratio <= 0.6) return { label: "Predomínio de calls — viés otimista", level: "green" };
  return { label: "Mais calls que puts — viés levemente otimista", level: "yellow" };
}

/** IV média ponderada (%). Nível de volatilidade implícita esperada. */
export function readIvLevel(iv: number | null | undefined): { label: string; level: Level } {
  if (iv == null) return { label: "indisponível", level: "neutral" };
  if (iv >= 80) return { label: "Volatilidade implícita alta — mercado esperando grandes movimentos", level: "red" };
  if (iv >= 50) return { label: "Volatilidade implícita moderada", level: "yellow" };
  return { label: "Volatilidade implícita baixa — mercado calmo", level: "green" };
}

/** Skew de IV (puts − calls, %). Positivo = medo de queda; negativo = demanda de alta. */
export function readSkew(skew: number | null | undefined): { label: string; level: Level } {
  if (skew == null) return { label: "indisponível", level: "neutral" };
  if (skew >= 3) return { label: "Puts mais caros — proteção contra queda em alta", level: "red" };
  if (skew <= -3) return { label: "Calls mais caros — demanda por alta", level: "green" };
  return { label: "Skew neutro entre puts e calls", level: "yellow" };
}

/** Participação institucional no volume spot: Coinbase (institucional/US) vs varejo
 *  agregado (Binance + OKX). Quanto maior a fatia da Coinbase, mais presença
 *  institucional/US; fatia baixa = mercado dominado pelo varejo/global. */
export function readInstitutionalShare(
  instVol: number | null | undefined,
  retailVol: number | null | undefined,
): Reading {
  if (instVol == null || retailVol == null || instVol + retailVol <= 0) {
    return { label: "Participação institucional indisponível", detail: "—", level: "neutral" };
  }
  const share = (instVol / (instVol + retailVol)) * 100;
  const detail = `Institucional (Coinbase) ${fmtUsd(instVol)} · Varejo (Binance+OKX) ${fmtUsd(retailVol)} · institucional ${share.toFixed(1)}% do spot`;
  if (share >= 25)
    return { label: `Institucional forte — ${share.toFixed(0)}% do volume spot na Coinbase`, detail, level: "green" };
  if (share <= 12)
    return { label: `Mercado dominado pelo varejo — institucional só ${share.toFixed(0)}% do spot`, detail, level: "yellow" };
  return { label: `Institucional em ${share.toFixed(0)}% do volume spot — proporção típica`, detail, level: "neutral" };
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
    return { label: "Viés institucional indisponível", detail: "—", level: "neutral" };
  }

  const parts: string[] = [];
  if (premium != null) parts.push(`Prêmio ${fmtPct(premium * 100, 3)}`);
  if (share != null) parts.push(`Institucional ${share.toFixed(0)}% do spot`);
  if (instCvd != null) parts.push(`CVD inst. ${fmtUsd(instCvd)}`);
  if (retailCvd != null) parts.push(`CVD varejo ${fmtUsd(retailCvd)}`);
  const detail = parts.join(" · ");

  const ctx = share == null ? "" : share >= 25 ? " · instituições muito ativas" : share <= 12 ? " · varejo dominando o volume" : "";

  if (score >= 2.5)
    return { label: `Institucional comprando com convicção — fluxo e prêmio a favor${ctx}`, detail, level: "green" };
  if (score >= 1)
    return { label: `Viés institucional comprador — smart money mais firme que o varejo${ctx}`, detail, level: "green" };
  if (score <= -2.5)
    return { label: `Institucional distribuindo — smart money vendendo, varejo segurando${ctx}`, detail, level: "red" };
  if (score <= -1)
    return { label: `Viés institucional vendedor — instituições reduzindo exposição${ctx}`, detail, level: "yellow" };
  return { label: `Institucional e varejo equilibrados — sem comando claro${ctx}`, detail, level: "yellow" };
}

/** IV Percentile 90d (0-100): onde a IV atual está na faixa dos últimos 90 dias. */
export function readIvp(ivp: number | null | undefined): { label: string; level: Level } {
  if (ivp == null) return { label: "indisponível", level: "neutral" };
  if (ivp >= 70) return { label: "Volatilidade implícita em zona alta — opções caras, vendedores favorecidos", level: "red" };
  if (ivp <= 30) return { label: "Volatilidade implícita em zona baixa — opções baratas, compradores favorecidos", level: "green" };
  return { label: "Volatilidade implícita em zona neutra", level: "yellow" };
}

/** IV-RV spread: prêmio de risco (implícita − realizada). Normaliza por |RV|. */
export function readIvRvSpread(
  spread: number | null | undefined,
  rv: number | null | undefined,
): { label: string; level: Level } {
  if (spread == null || rv == null || rv === 0) return { label: "indisponível", level: "neutral" };
  const pct = (spread / Math.abs(rv)) * 100;
  if (pct > 10) return { label: "Opções precificando muito mais volatilidade que a realizada — prêmio de risco elevado", level: "red" };
  if (pct < -10) return { label: "Opções subprecificadas vs. volatilidade realizada — possível oportunidade compradora de vol", level: "green" };
  return { label: "Implícita e realizada alinhadas", level: "yellow" };
}

/** Term structure: compara o curto (7d) com o médio (90d). */
export function readTermStructure(term: Record<string, number> | null | undefined): { label: string; level: Level } {
  const short = term?.["7d"];
  const back = term?.["90d"];
  if (short == null || back == null) return { label: "indisponível", level: "neutral" };
  if (short > back) return { label: "Backwardation — mercado pricing evento de curto prazo", level: "yellow" };
  return { label: "Estrutura normal — mercado tranquilo", level: "green" };
}

// ─── Utilidades de UI ────────────────────────────────────────────────────────
export const LEVEL_DOT: Record<Level, string> = {
  green: "bg-signal-green",
  yellow: "bg-signal-yellow",
  red: "bg-signal-red",
  neutral: "bg-slate-500",
};

export const LEVEL_RING: Record<Level, string> = {
  green: "ring-signal-green/40",
  yellow: "ring-signal-yellow/40",
  red: "ring-signal-red/40",
  neutral: "ring-slate-600/40",
};

export const ASSET_NAME: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
};
