/**
 * Cores de eixos/grade/borda dos gráficos (lightweight-charts) por tema.
 * No claro o texto fica mais escuro e a grade um pouco mais visível, para os
 * gráficos não "sumirem" no fundo branco. Use junto de `useTheme().isDark`.
 */
export interface ChartAxisColors {
  text: string;
  grid: string;
  border: string;
}

export function chartAxisColors(isDark: boolean): ChartAxisColors {
  return isDark
    ? { text: "#94a3b8", grid: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.18)" }
    : { text: "#475569", grid: "rgba(100,116,139,0.14)", border: "rgba(100,116,139,0.30)" };
}

// ─── Fuso horário ─────────────────────────────────────────────────────────────
// lightweight-charts renderiza o eixo de tempo em UTC. Estes formatadores exibem
// no fuso LOCAL do navegador (ex.: Brasília UTC−3) — só display, não altera o dado.
import { getLocale } from "../hooks/useLocale";

type ChartTime = number | { year: number; month: number; day: number } | string;

function toDate(t: ChartTime): Date {
  return new Date((t as number) * 1000);
}
const chartLoc = () => (getLocale() === "en" ? "en-US" : "pt-BR");

export const chartLocalization = {
  locale: "pt-BR",
  timeFormatter: (t: ChartTime) =>
    toDate(t).toLocaleString(chartLoc(), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
};

// Tipo do tick do lightweight-charts: 0=Ano, 1=Mês, 2=Dia, 3=Hora, 4=Hora c/ seg.
/** Rótulos do eixo de tempo: ANO nas viradas de ano (ex.: "2024"), mês nas viradas
 *  de mês, dia/mês no resto e hora nos intraday — assim o histórico longo fica legível
 *  (antes as viradas de ano viravam "01 de jan." e pareciam todas iguais). */
export function chartTickFormatter(time: ChartTime, tickMarkType: number): string {
  const d = toDate(time);
  const loc = chartLoc();
  switch (tickMarkType) {
    case 0: // Ano
      return d.toLocaleDateString(loc, { year: "numeric" });
    case 1: // Mês
      return d.toLocaleDateString(loc, { month: "short", year: "2-digit" });
    case 2: // Dia
      return d.toLocaleDateString(loc, { day: "2-digit", month: "short" });
    default: // Hora (intraday)
      return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  }
}
