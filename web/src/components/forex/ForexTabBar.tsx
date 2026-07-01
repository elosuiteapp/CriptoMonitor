export type ForexTabId = "cockpit" | "smart" | "leitura" | "macro" | "relatorio";

const TABS: { id: ForexTabId; label: string }[] = [
  { id: "cockpit", label: "Cockpit Principal" },
  { id: "smart", label: "Smart Money" },
  { id: "leitura", label: "Leitura do Mercado" },
  { id: "macro", label: "Macro & Correlações" },
  { id: "relatorio", label: "Relatório" },
];

// Abas liberadas no Free (vitrine); as demais viram 🔒 até assinar o módulo. Igual à cripto.
const FREE_TABS: ForexTabId[] = ["cockpit", "macro"];

/** Abas da plataforma Forex — mesmo modelo do cripto/B3, contexto de câmbio. */
export default function ForexTabBar({ tab, onTab, full = false }: { tab: ForexTabId; onTab: (t: ForexTabId) => void; full?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = tab === t.id;
        const locked = !full && !FREE_TABS.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
