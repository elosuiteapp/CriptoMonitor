import type { ForexCandle } from "../../lib/forex";
import { last, macd, rsi } from "../../lib/indicators/ta";

const W = 100;
const H = 40;

/** Subgráfico de RSI (14) — sobrecompra (>70) / sobrevenda (<30). SVG leve, padrão dos módulos. */
function RsiPanel({ closes }: { closes: number[] }) {
  const series = rsi(closes, 14);
  const total = closes.length;
  if (total < 16) return null;
  const pts = series
    .map((v, i) => (Number.isFinite(v) ? `${((i / (total - 1)) * W).toFixed(2)},${(H - (v / 100) * H).toFixed(2)}` : null))
    .filter(Boolean)
    .join(" ");
  const cur = last(series);
  const tone = !Number.isFinite(cur) ? "text-muted-foreground" : cur >= 70 ? "text-rose-500" : cur <= 30 ? "text-emerald-500" : "text-foreground";
  const label = !Number.isFinite(cur) ? "—" : cur >= 70 ? "sobrecompra" : cur <= 30 ? "sobrevenda" : "neutro";
  const y = (v: number) => H - (v / 100) * H;
  return (
    <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-2 dark:bg-card/60">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>RSI (14)</span>
        <span className={`num ${tone}`}>{Number.isFinite(cur) ? `${cur.toFixed(0)} · ${label}` : "—"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full">
        <line x1="0" y1={y(70)} x2={W} y2={y(70)} stroke="rgba(244,63,94,0.35)" strokeWidth="0.3" strokeDasharray="1 1" />
        <line x1="0" y1={y(50)} x2={W} y2={y(50)} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        <line x1="0" y1={y(30)} x2={W} y2={y(30)} stroke="rgba(16,185,129,0.35)" strokeWidth="0.3" strokeDasharray="1 1" />
        <polyline points={pts} fill="none" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Subgráfico de MACD (12/26/9) — histograma + linha + sinal. */
function MacdPanel({ closes }: { closes: number[] }) {
  const total = closes.length;
  if (total < 35) return null;
  const m = macd(closes);
  const finite = (arr: number[]) => arr.filter((v) => Number.isFinite(v));
  const maxAbs = Math.max(1e-9, ...finite(m.line).map(Math.abs), ...finite(m.signal).map(Math.abs), ...finite(m.hist).map(Math.abs));
  const x = (i: number) => (i / (total - 1)) * W;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 2);
  const bw = W / total;
  const poly = (arr: number[]) =>
    arr.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(2)},${y(v).toFixed(2)}` : null)).filter(Boolean).join(" ");
  const curHist = last(m.hist);
  const tone = !Number.isFinite(curHist) ? "text-muted-foreground" : curHist >= 0 ? "text-emerald-500" : "text-rose-500";
  return (
    <div className="rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-2 dark:bg-card/60">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>MACD (12/26/9)</span>
        <span className={`num ${tone}`}>histograma {Number.isFinite(curHist) ? (curHist >= 0 ? "positivo" : "negativo") : "—"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(148,163,184,0.25)" strokeWidth="0.3" />
        {m.hist.map((v, i) =>
          Number.isFinite(v) ? (
            <rect
              key={i}
              x={x(i) - bw / 2}
              y={v >= 0 ? y(v) : H / 2}
              width={Math.max(0.4, bw - 0.2)}
              height={Math.abs(H / 2 - y(v))}
              className={v >= 0 ? "fill-emerald-500/40 dark:fill-emerald-400/40" : "fill-rose-500/40 dark:fill-rose-400/40"}
            />
          ) : null,
        )}
        <polyline points={poly(m.line)} fill="none" stroke="#3b82f6" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
        <polyline points={poly(m.signal)} fill="none" stroke="#f97316" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/** Subgráficos de momento (RSI/MACD) abaixo do gráfico do cockpit Forex. Isolado. */
export default function ForexIndicatorPanels({ candles, showRsi, showMacd }: { candles: ForexCandle[]; showRsi: boolean; showMacd: boolean }) {
  if ((!showRsi && !showMacd) || candles.length < 16) return null;
  const closes = candles.map((c) => c.close);
  return (
    <div className="mt-2 space-y-2">
      {showRsi && <RsiPanel closes={closes} />}
      {showMacd && <MacdPanel closes={closes} />}
    </div>
  );
}
