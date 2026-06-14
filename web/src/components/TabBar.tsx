export type TabId = "cockpit" | "macro" | "smart" | "reports";

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  advanced: boolean; // Pro+
  isExpert: boolean;
}

const TABS: { id: TabId; label: string; need: "free" | "pro" | "expert" }[] = [
  { id: "cockpit", label: "Cockpit Principal", need: "free" },
  { id: "macro", label: "Macro & Correlações", need: "pro" },
  { id: "smart", label: "Smart Money & On-chain", need: "expert" },
  { id: "reports", label: "Relatórios", need: "free" }, // conteúdo gated por RLS/plano
];

/** Abas da página do ativo (PRD §8.7) — escada de profundidade e de planos. */
export default function TabBar({ tab, onTab, advanced, isExpert }: Props) {
  const isLocked = (need: string) =>
    (need === "pro" && !advanced) || (need === "expert" && !isExpert);

  return (
    <div className="flex flex-wrap gap-1 border-b border-ink-600">
      {TABS.map((t) => {
        const locked = isLocked(t.need);
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-accent text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label} {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
