import { MODULES, type ModuleId } from "../lib/modules";

interface Props {
  module: ModuleId;
  onBack: () => void;
}

// Copy "em breve" por módulo (o que o cockpit daquele mercado vai trazer).
const COMING_SOON: Partial<Record<ModuleId, string>> = {
  forex: "pares de moedas, sessões de mercado (Londres/NY/Tóquio), calendário econômico e correlações de câmbio",
  b3: "ações da B3 — preço e candles, volume e perfil de volume, book/profundidade, fluxo (incl. estrangeiro), notícias e leitura por IA, adaptados ao mercado à vista de ações",
};

/** Tela de um módulo de mercado ainda não liberado (preview admin). Genérica:
 *  usa o ícone/label de `modules.ts` e a copy específica do mercado. */
export default function MarketPlaceholder({ module, onBack }: Props) {
  const m = MODULES.find((x) => x.id === module);
  return (
    <section className="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
      <div className="max-w-md space-y-3">
        <div className="text-4xl" aria-hidden>
          {m?.icon ?? "📊"}
        </div>
        <h2 className="text-xl font-bold text-foreground">Módulo {m?.label ?? module} — em construção</h2>
        <p className="text-sm text-muted-foreground">
          Em breve: {COMING_SOON[module] ?? m?.description}. Será liberado com o{" "}
          <span className="text-foreground">plano correspondente</span>.
        </p>
        <p className="text-xs text-muted-foreground">Você está vendo este preview por ser administrador.</p>
        <button
          onClick={onBack}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90"
        >
          Voltar ao módulo Crypto
        </button>
      </div>
    </section>
  );
}
