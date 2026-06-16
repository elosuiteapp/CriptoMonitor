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
