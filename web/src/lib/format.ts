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
