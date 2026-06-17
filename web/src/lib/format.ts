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

/** Número compacto sem moeda (ex.: 786360 → "786 mil", 1858597 → "1.9 mi"). */
export function fmtCompact(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)} bi`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)} mi`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(0)} mil`;
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
  return value.toLocaleString("pt-BR", {
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

/** ETFs spot (BTC/ETH): fluxo líquido do último dia útil + sequência de dias. */
export function readEtfFlow(
  net: number | null | undefined,
  streak: number | null | undefined,
  flow7d: number | null | undefined,
  asOf?: string | null,
): Reading {
  if (net == null) return { label: "ETFs spot indisponível", detail: "—", level: "neutral" };
  const days = Math.abs(streak ?? 0);
  const seq = days >= 2 ? ` · ${days}º dia de ${net >= 0 ? "entradas" : "saídas"}` : "";
  const detail =
    `Dia ${fmtUsd(net)}${flow7d != null ? ` · 7d ${fmtUsd(flow7d)}` : ""}${asOf ? ` · ${asOf}` : ""}`;
  if (net > 0) return { label: `ETFs spot comprando${seq} — entrada institucional`, detail, level: "green" };
  if (net < 0) return { label: `ETFs spot vendendo${seq} — saída institucional`, detail, level: "red" };
  return { label: "ETFs spot sem fluxo no dia", detail, level: "yellow" };
}

/** Liquidez de mercado: oferta de stablecoins (dry powder) + dominância + TVL DeFi. */
export function readMarketLiquidity(
  totalSc: number | null | undefined,
  chg7dPct: number | null | undefined,
  totalMcap?: number | null,
  tvl?: number | null,
): Reading {
  if (totalSc == null) return { label: "Liquidez de mercado indisponível", detail: "—", level: "neutral" };
  const dom = totalMcap ? (totalSc / totalMcap) * 100 : null;
  const detail =
    `Stablecoins ${fmtUsd(totalSc)}${chg7dPct != null ? ` (7d ${fmtPct(chg7dPct, 2)})` : ""}` +
    `${dom != null ? ` · dominância ${dom.toFixed(1)}%` : ""}${tvl != null ? ` · TVL DeFi ${fmtUsd(tvl)}` : ""}`;
  if (chg7dPct != null && chg7dPct >= 0.3)
    return { label: "Liquidez entrando — oferta de stablecoins subindo (dry powder)", detail, level: "green" };
  if (chg7dPct != null && chg7dPct <= -0.3)
    return { label: "Liquidez recuando — stablecoins saindo do mercado", detail, level: "yellow" };
  return { label: "Liquidez estável — oferta de stablecoins de lado", detail, level: "neutral" };
}

/** Posicionamento institucional em opções (Deribit): Put/Call ratio + skew de IV. */
export function readOptionsPositioning(
  pcr: number | null | undefined,
  skew: number | null | undefined,
): Reading {
  if (pcr == null && skew == null) return { label: "Opções indisponível", detail: "—", level: "neutral" };
  const detail = `Put/Call ${pcr != null ? pcr.toFixed(2) : "—"} · Skew ${skew != null ? fmtPct(skew, 1) : "—"}`;
  let score = 0;
  if (pcr != null) score += pcr >= 1.2 ? -1 : pcr <= 0.7 ? 1 : 0;
  if (skew != null) score += skew >= 3 ? -1 : skew <= -3 ? 1 : 0;
  if (score <= -1)
    return { label: "Hedge institucional elevado — puts caros, demanda por proteção", detail, level: "red" };
  if (score >= 1)
    return { label: "Apetite por alta — calls demandados, pouca proteção", detail, level: "green" };
  return { label: "Opções equilibradas entre proteção e alta", detail, level: "yellow" };
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
