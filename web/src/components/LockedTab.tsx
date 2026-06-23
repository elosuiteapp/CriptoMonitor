import { Link } from "react-router-dom";

import { useT } from "../lib/i18n";

/** Vitrine de aba bloqueada (PRD §8.7 / §8.3). */
export default function LockedTab({ title, plan }: { title: string; plan: string }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-10 text-center">
      <div className="text-3xl">🔒</div>
      <h2 className="mt-3 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.locked.availableOn.replace("{plan}", plan)}</p>
      <Link
        to="/pricing"
        className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {t.locked.unlock.replace("{plan}", plan)}
      </Link>
    </div>
  );
}
