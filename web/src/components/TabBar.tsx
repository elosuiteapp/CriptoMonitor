import { useT } from "../lib/i18n";

export type TabId = "cockpit" | "indicadores" | "macro" | "smart" | "reports";

interface Props {
  tab: TabId;
  onTab: (t: TabId) => void;
  advanced: boolean; // Pro+
  canSmart: boolean; // acesso ao módulo Smart Money (flag do plano)
}

const TABS: { id: TabId; need: "free" | "pro" | "expert" }[] = [
  { id: "cockpit", need: "free" },
  { id: "smart", need: "expert" }, // Smart Money & On-chain (Expert)
  { id: "indicadores", need: "expert" }, // síntese de confluência (Expert)
  { id: "macro", need: "free" }, // aberta no Free (versão leve); Pro destrava a camada institucional dentro
  { id: "reports", need: "free" }, // conteúdo gated por RLS/plano
];

/** Abas da página do ativo (PRD §8.7) — escada de profundidade e de planos. */
export default function TabBar({ tab, onTab, advanced, canSmart }: Props) {
  const { t: tr } = useT();
  const label: Record<TabId, string> = {
    cockpit: tr.tabs.cockpit,
    smart: tr.tabs.smart,
    indicadores: tr.tabs.indicators,
    macro: tr.tabs.macro,
    reports: tr.tabs.reports,
  };
  const isLocked = (need: string) =>
    (need === "pro" && !advanced) || (need === "expert" && !canSmart);

  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {TABS.map((item) => {
        const locked = isLocked(item.need);
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTab(item.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-all duration-200 ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label[item.id]} {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
    </div>
  );
}
