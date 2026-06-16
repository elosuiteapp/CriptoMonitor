import { fmtUsd } from "../lib/format";
import type { CvdPoint } from "../lib/marketData";

/** Painel de Volume Delta / CVD (padrão dos gráficos de trade): histograma de
 *  delta agressor por candle (verde comprador / vermelho vendedor) + linha do
 *  CVD acumulado por cima. Escalas independentes (barras × linha) no mesmo pane. */
export default function VolumeDeltaSubchart({ data, title }: { data: CvdPoint[]; title: string }) {
  if (data.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {title} — carregando…
      </div>
    );
  }

  const W = 100;
  const H = 40;
  const n = data.length;
  const bw = W / n;
  const maxAbsDelta = Math.max(1, ...data.map((p) => Math.abs(p.delta)));
  const cvds = data.map((p) => p.cvd);
  const cMin = Math.min(...cvds);
  const cMax = Math.max(...cvds);
  const cRange = cMax - cMin || 1;
  // CVD ocupa quase toda a altura (margem de 3 em cima/baixo p/ não colar nas bordas)
  const yCvd = (v: number) => 3 + (1 - (v - cMin) / cRange) * (H - 6);

  const last = data[n - 1];
  const rising = last.cvd >= data[0].cvd;
  const lineCls = rising ? "stroke-emerald-500 dark:stroke-emerald-400" : "stroke-rose-500 dark:stroke-rose-400";
  const linePts = data.map((p, i) => `${(i * bw + bw / 2).toFixed(2)},${yCvd(p.cvd).toFixed(2)}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className={`num ${last.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            Δ {fmtUsd(last.delta)}
          </span>
          <span className={`num ${rising ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            CVD {fmtUsd(last.cvd)}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full">
        {/* linha zero das barras de delta (meio do pane) */}
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        {/* histograma de delta por candle (secundário, esmaecido) */}
        {data.map((p, i) => {
          const h = (Math.abs(p.delta) / maxAbsDelta) * (H / 2);
          const y = p.delta >= 0 ? H / 2 - h : H / 2;
          return (
            <rect
              key={i}
              x={i * bw}
              y={y}
              width={Math.max(0.4, bw - 0.2)}
              height={h}
              className={p.delta >= 0 ? "fill-emerald-500/25 dark:fill-emerald-400/25" : "fill-rose-500/25 dark:fill-rose-400/25"}
            />
          );
        })}
        {/* CVD acumulado (linha principal) */}
        <polyline points={linePts} fill="none" className={lineCls} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
