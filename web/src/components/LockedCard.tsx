import { Link } from "react-router-dom";

import { useT } from "../lib/i18n";
import Card from "./ui/Card";

/** Vitrine de upgrade: card avançado aparece bloqueado (PRD §7.2, §8.3).
 *  `plan` define o degrau que desbloqueia ("Pro" por padrão, "Expert" para a
 *  camada institucional). */
export default function LockedCard({
  title,
  institutional,
  plan = "Pro",
}: {
  title: string;
  institutional?: boolean;
  plan?: string;
}) {
  const { t } = useT();
  return (
    <Card highlight={institutional} className="relative overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <span aria-hidden className="text-lg">🔒</span>
      </div>
      <div className="mt-6 blur-[2px]">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
      </div>
      <Link
        to="/pricing"
        className="mt-4 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90"
      >
        {t.locked.unlock.replace("{plan}", plan)}
      </Link>
    </Card>
  );
}
