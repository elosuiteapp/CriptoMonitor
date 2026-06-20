import { ComingSoon } from "./B3Shared";

/** Relatórios da B3 — relatório diário por IA (espelha o cripto), em breve. */
export default function B3ReportsTab() {
  return (
    <ComingSoon icon="📝" title="Relatório diário por IA da B3">
      <p>Mesmo modelo do cripto: a IA lê os dados do dia (IBOV, dólar, macro BR, fundamentos e — quando disponível — o fluxo de investidor) e escreve um <strong className="text-foreground">resumo do pregão</strong> com o que mudou e o que observar.</p>
      <p className="text-[11px]">Reaproveita a infra de relatórios já existente (Gemini) adaptada ao contexto da B3.</p>
    </ComingSoon>
  );
}
