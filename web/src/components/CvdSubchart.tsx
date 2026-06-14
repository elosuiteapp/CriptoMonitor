import type { SeriesPoint } from "../hooks/useSeries";
import { fmtUsd } from "../lib/format";

/** Sub-gráfico do CVD do varejo (delta de volume agressor) — PRD §8.4. */
export default function CvdSubchart({ data }: { data: SeriesPoint[] }) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-slate-500">
        CVD — aguardando coleta
      </div>
    );
  }
  const maxAbs = Math.max(1, ...data.map((p) => Math.abs(p.value)));
  const W = 100;
  const H = 40;
  const bw = W / data.length;
  const last = data[data.length - 1].value;

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>CVD do varejo</span>
        <span className={last >= 0 ? "text-signal-green" : "text-signal-red"}>{fmtUsd(last)}</span>
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
              className={p.value >= 0 ? "fill-signal-green/70" : "fill-signal-red/70"}
            />
          );
        })}
      </svg>
    </div>
  );
}
