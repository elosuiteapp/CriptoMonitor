/** Aba "Smart Money & On-chain" (PRD §8.7) — Expert. Conteúdo preenchido na
 *  Fase 6.6 (exchange flows). Placeholder enquanto a fonte on-chain é integrada. */
export default function SmartMoneyTab({ asset }: { asset: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">Smart Money & On-chain · {asset}</h2>
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-400">
        Fluxo de exchanges (in/outflow), whale alerts, MVRV e cronograma de unlocks serão
        exibidos aqui. Integração on-chain (Blockchair) em andamento.
      </div>
    </section>
  );
}
