export type TabId = "cockpit" | "indicadores" | "macro" | "smart" | "reports";

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  advanced: boolean; // Pro+
  canSmart: boolean; // acesso ao módulo Smart Money (flag do plano)
}

const TABS: { id: TabId; label: string; need: "free" | "pro" | "expert" }[] = [
  { id: "cockpit", label: "Cockpit Principal", need: "free" },
  { id: "smart", label: "Smart Money & On-chain", need: "expert" },
  { id: "indicadores", label: "Leitura do Mercado", need: "expert" }, // síntese de confluência (Expert)
  { id: "macro", label: "Macro & Correlações", need: "free" }, // aberta no Free (versão leve); Pro destrava a camada institucional dentro
  { id: "reports", label: "Relatórios", need: "free" }, // conteúdo gated por RLS/plano
];

/** Abas da página do ativo (PRD §8.7) — escada de profundidade e de planos. */
export default function TabBar({ tab, onTab, advanced, canSmart }: Props) {
  const isLocked = (need: string) =>
    (need === "pro" && !advanced) || (need === "expert" && !canSmart);

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((t) => {
        const locked = isLocked(t.need);
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
