export type B3TabId = "cockpit" | "fluxo" | "leitura" | "macro" | "reports";

const TABS: { id: B3TabId; label: string }[] = [
  { id: "cockpit", label: "Cockpit Principal" },
  { id: "fluxo", label: "Fluxo & Smart Money" },
  { id: "leitura", label: "Leitura do Mercado" },
  { id: "macro", label: "Macro & Correlações" },
  { id: "reports", label: "Relatórios" },
];

/** Abas da plataforma B3 — mesmo modelo do cripto, contexto B3. */
export default function B3TabBar({ tab, onTab }: { tab: B3TabId; onTab: (t: B3TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
