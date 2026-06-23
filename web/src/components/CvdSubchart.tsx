import type { SeriesPoint } from "../hooks/useSeries";
import { fmtUsd } from "../lib/format";
import { useT } from "../lib/i18n";

/** Sub-gráfico de CVD (delta de volume agressor) — PRD §8.4.
 *  `title` distingue a fonte: CVD do varejo (Binance) × institucional (Coinbase). */
export default function CvdSubchart({ data, title }: { data: SeriesPoint[]; title?: string }) {
  const { t } = useT();
  const label = title ?? t.strips.cvdRetail;
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-card dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {label} — {t.strips.awaiting}
      </div>
    );
  }
  const maxAbs = Math.max(1, ...data.map((p) => Math.abs(p.value)));
  const W = 100;
  const H = 40;
  const bw = W / data.length;
  const last = data[data.length - 1].value;

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className={`num ${last >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{fmtUsd(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        {data.map((p, i) => {
          const h = (Math.abs(p.value) / maxAbs) * (H / 2);
          const y = p.value >= 0 ? H / 2 - h : H / 2;
          return (
            <rect
              key={i}
              x={i * bw}
              y={y}
              width={Math.max(0.5, bw - 0.3)}
              height={h}
              className={p.value >= 0 ? "fill-emerald-500/70 dark:fill-emerald-400/70" : "fill-rose-500/70 dark:fill-rose-400/70"}
            />
          );
        })}
      </svg>
    </div>
  );
}
