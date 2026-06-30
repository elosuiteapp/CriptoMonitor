import type { LiqPoint } from "../hooks/useSeries";
import { fmtUsd } from "../lib/format";
import { useT } from "../lib/i18n";

/** Barras de liquidação REALIZADA (Coinalyze, bucket de 5 min) — subpainel abaixo
 *  do gráfico, no mesmo esquema do CvdSubchart. Complementa o heatmap estimado
 *  (que fica sobre as velas) com o dado real de quem JÁ foi liquidado no tempo:
 *  shorts ↑ verde (squeeze de baixa) / longs ↓ vermelho (flush de alta). */
export default function LiquidationsStrip({ data }: { data: LiqPoint[] }) {
  const { t } = useT();
  if (data.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {t.strips.liqRealizedShort} — {t.strips.awaiting}
      </div>
    );
  }

  const maxAbs = Math.max(1, ...data.flatMap((p) => [p.long, p.short]));
  const W = 100;
  const H = 44;
  const mid = H / 2;
  const bw = W / data.length;
  const totLong = data.reduce((a, p) => a + p.long, 0);
  const totShort = data.reduce((a, p) => a + p.short, 0);

  return (
    <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{t.strips.liqRealizedFull}</span>
        <span>
          <span className="text-emerald-600 dark:text-emerald-400">{t.strips.shorts} {fmtUsd(totShort)}</span>
          <span className="mx-1 text-muted-foreground">·</span>
          <span className="text-rose-600 dark:text-rose-400">{t.strips.longs} {fmtUsd(totLong)}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-14 w-full">
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        {data.map((p, i) => {
          const hs = (p.short / maxAbs) * mid;
          const hl = (p.long / maxAbs) * mid;
          const w = Math.max(0.5, bw - 0.3);
          return (
            <g key={i}>
              {p.short > 0 && <rect x={i * bw} y={mid - hs} width={w} height={hs} className="fill-emerald-500/80" />}
              {p.long > 0 && <rect x={i * bw} y={mid} width={w} height={hl} className="fill-rose-500/80" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
