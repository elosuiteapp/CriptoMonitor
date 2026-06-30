import type { SeriesPoint } from "../hooks/useSeries";
import { fmtPct } from "../lib/format";
import { useT } from "../lib/i18n";
import InfoTip from "./InfoTip";

/** Funding ao longo do tempo (CEX agregado, Coinalyze, intervalo de 8h).
 *  Histograma em torno do zero: verde acima = comprados pagando; vermelho abaixo
 *  = vendidos pagando; altura ∝ magnitude. Valores em FRAÇÃO (ver useSeries). */
export default function FundingStrip({ data }: { data: SeriesPoint[] }) {
  const { t } = useT();
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {t.strips.fundingLabel} — {t.strips.awaiting}
      </div>
    );
  }

  const W = 100;
  const H = 24;
  const n = data.length;
  const bw = W / n;
  const maxAbs = Math.max(1e-9, ...data.map((p) => Math.abs(p.value)));
  const last = data[n - 1].value;
  // Anualizado: funding de 8h paga 3×/dia × 365 dias.
  const annual = last * 3 * 365;

  return (
    <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {t.strips.fundingCexTitle}
          <InfoTip text={t.strips.fundingTip} />
        </span>
        <span className="flex items-center gap-2">
          <span className={`num ${last >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {t.strips.current} {fmtPct(last * 100, 4)}
          </span>
          <span className={`num ${annual >= 0 ? "text-emerald-600/80 dark:text-emerald-400/80" : "text-rose-600/80 dark:text-rose-400/80"}`}>
            ~{fmtPct(annual * 100, 1)}{t.strips.perYear}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(148,163,184,0.25)" strokeWidth="0.3" />
        {data.map((p, i) => {
          const h = (Math.abs(p.value) / maxAbs) * (H / 2);
          const y = p.value >= 0 ? H / 2 - h : H / 2;
          return (
            <rect
              key={i}
              x={i * bw}
              y={y}
              width={Math.max(0.4, bw - 0.2)}
              height={Math.max(0.3, h)}
              className={p.value >= 0 ? "fill-emerald-500/70 dark:fill-emerald-400/70" : "fill-rose-500/70 dark:fill-rose-400/70"}
            >
              <title>{fmtPct(p.value * 100, 4)}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
