import { ComingSoon } from "./B3Shared";

/** Fluxo & Smart Money da B3 — o equivalente ao Smart Money da cripto.
 *  Depende do dadosdemercado (fluxo de investidor) — placeholder até o acesso. */
export default function B3FluxoTab() {
  return (
    <div className="space-y-4">
      <ComingSoon icon="🏦" title="Fluxo de investidor (estrangeiro · institucional · PF)">
        <p>O "smart money" da B3 é o <strong className="text-foreground">fluxo por tipo de investidor</strong>: quanto o estrangeiro, o institucional e a pessoa física compraram ou venderam — o sinal mais acompanhado do mercado brasileiro.</p>
        <p>Vai trazer: saldo diário e acumulado do estrangeiro na B3, fluxo institucional/PF, e o cruzamento com IBOV e dólar (o estrangeiro tende a entrar quando o dólar cede).</p>
        <p className="text-[11px]">Fonte: <strong className="text-foreground">dadosdemercado</strong> (requer acesso à API). Enquanto isso, veja a correlação IBOV × Dólar na aba Macro — hoje fortemente inversa, o que sinaliza o humor do estrangeiro.</p>
      </ComingSoon>

      <ComingSoon icon="📈" title="On-chain não se aplica — em vez disso, dividendos & proventos">
        <p>Na cripto isto seria on-chain. Na B3, o equivalente de "qualidade" é o <strong className="text-foreground">dividendo</strong>: dividend yield, histórico de proventos, datas-com e ranking de pagadoras.</p>
        <p className="text-[11px]">Fonte: brapi.dev (com token grátis) + dadosdemercado.</p>
      </ComingSoon>
    </div>
  );
}
