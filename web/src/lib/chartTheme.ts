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
type ChartTime = number | { year: number; month: number; day: number } | string;

function toDate(t: ChartTime): Date {
  return new Date((t as number) * 1000);
}

export const chartLocalization = {
  locale: "pt-BR",
  timeFormatter: (t: ChartTime) =>
    toDate(t).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
};

/** Rótulos do eixo de tempo no horário local (data nas viradas de dia, hora no resto). */
export function chartTickFormatter(time: ChartTime, tickMarkType: number): string {
  const d = toDate(time);
  return tickMarkType <= 2
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
