export type B3TabId = "cockpit" | "dividendos" | "fluxo" | "leitura" | "macro" | "reports";

const TABS: { id: B3TabId; label: string }[] = [
  { id: "cockpit", label: "Cockpit Principal" },
  { id: "dividendos", label: "Dividendos" },
  { id: "fluxo", label: "Fluxo & Smart Money" },
  { id: "leitura", label: "Leitura do Mercado" },
  { id: "macro", label: "Macro & Correlações" },
  { id: "reports", label: "Relatórios" },
];

// Abas liberadas no Free (vitrine); as demais viram 🔒 até assinar o módulo. Igual à cripto.
const FREE_TABS: B3TabId[] = ["cockpit", "macro"];

/** Abas da plataforma B3 — mesmo modelo do cripto, contexto B3. */
export default function B3TabBar({ tab, onTab, full = false }: { tab: B3TabId; onTab: (t: B3TabId) => void; full?: boolean }) {
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
