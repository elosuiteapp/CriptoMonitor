import { useT } from "../lib/i18n";
import { MODULES, moduleDescription, moduleLabel, type ModuleId } from "../lib/modules";

interface Props {
  module: ModuleId;
  onBack: () => void;
}

// Copy "em breve" por módulo (o que o cockpit daquele mercado vai trazer), por idioma.
const COMING_SOON: Partial<Record<ModuleId, { pt: string; en: string }>> = {
  forex: {
    pt: "pares de moedas, sessões de mercado (Londres/NY/Tóquio), calendário econômico e correlações de câmbio",
    en: "currency pairs, market sessions (London/NY/Tokyo), economic calendar, and FX correlations",
  },
  b3: {
    pt: "ações da B3 — preço e candles, volume e perfil de volume, book/profundidade, fluxo (incl. estrangeiro), notícias e leitura por IA, adaptados ao mercado à vista de ações",
    en: "B3 stocks — price and candles, volume and volume profile, order book/depth, flow (incl. foreign), news, and AI read, tailored to the cash equities market",
  },
};

/** Tela de um módulo de mercado ainda não liberado (preview admin). Genérica:
 *  usa o ícone/label de `modules.ts` e a copy específica do mercado. */
export default function MarketPlaceholder({ module, onBack }: Props) {
  const { t, isEn } = useT();
  const m = MODULES.find((x) => x.id === module);
  const soon = COMING_SOON[module];
  const soonText = soon ? (isEn ? soon.en : soon.pt) : moduleDescription(module);
  return (
    <section className="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
      <div className="max-w-md space-y-3">
        <div className="text-4xl" aria-hidden>
          {m?.icon ?? "📊"}
        </div>
        <h2 className="text-xl font-bold text-foreground">{t.placeholder.titleSuffix.replace("{label}", m ? moduleLabel(module) : module)}</h2>
        <p className="text-sm text-muted-foreground">
          {t.placeholder.comingSoon} {soonText}.{" "}
          <span className="text-foreground">{t.placeholder.correspondingPlan}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t.placeholder.adminPreview}</p>
        <button
          onClick={onBack}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90"
        >
          {t.placeholder.backToCrypto}
        </button>
      </div>
    </section>
  );
}
