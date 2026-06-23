import { Link } from "react-router-dom";

import { useT } from "../lib/i18n";

// Alturas fixas (não-aleatórias) para o "gráfico" borrado de enfeite.
const BARS = [40, 65, 30, 80, 55, 70, 25, 60, 45, 75, 35, 85, 50, 65, 30, 70, 55, 40, 60, 45];

/** Teaser de upgrade no formato de um subgráfico (mesmo footprint do CvdSubchart).
 *  Usado para o lado INSTITUCIONAL (Coinbase) do CVD e da Pressão do book no Free:
 *  mostra que o dado existe — varejo visível × instituição escondida — e leva ao
 *  /pricing. Não renderiza dado real (o RLS já bloqueia o institucional no Free). */
export default function LockedSubchart({
  title,
  hint,
  plan = "Expert",
}: {
  title: string;
  hint: string;
  plan?: string;
}) {
  const { t } = useT();
  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-card p-2 dark:bg-card/60">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{title}</span>
        <span aria-hidden>🔒</span>
      </div>
      <div className="flex h-12 items-end gap-[2px] opacity-50 blur-[2px]" aria-hidden>
        {BARS.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${i % 3 === 0 ? "bg-rose-400/60" : "bg-emerald-400/60"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-t from-card/90 to-card/40 px-3 text-center dark:from-card/85">
        <p className="text-[11px] font-medium text-foreground">{hint}</p>
        <Link
          to="/pricing"
          className="rounded-lg bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          {t.locked.viewOn.replace("{plan}", plan)}
        </Link>
      </div>
    </div>
  );
}
