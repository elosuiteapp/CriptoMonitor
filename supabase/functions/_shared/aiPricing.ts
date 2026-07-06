// Preço do Gemini em USD por 1M tokens — FONTE ÚNICA (auditoria 06/jul: estava duplicado
// literal em 4 funções — generate-analysis, cockpit-report, b3-analysis, forex-report — e uma
// mudança de preço exigiria editar 4 arquivos, com risco de drift). O custo gravado em
// ai_analysis.cost_usd_micros (sql/044) e o painel /admin/usage derivam daqui.
// Tabela: Flash $0.30/M entrada · $2.50/M saída; Pro $1.25/M · $10/M.
export function geminiPrice(model: string): { in: number; out: number } {
  return model.includes("pro") ? { in: 1.25, out: 10 } : { in: 0.3, out: 2.5 };
}
