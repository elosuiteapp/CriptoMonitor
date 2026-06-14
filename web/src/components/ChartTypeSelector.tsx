import type { ChartType, Timeframe } from "../lib/marketData";

const TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Velas" },
  { id: "bars", label: "Barras" },
  { id: "line", label: "Linha" },
  { id: "area", label: "Área" },
];

const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

interface Props {
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}

export default function ChartTypeSelector({ chartType, onChartType, timeframe, onTimeframe }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 rounded-lg bg-ink-700 p-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => onTimeframe(tf)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              timeframe === tf ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tf.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex gap-1 rounded-lg bg-ink-700 p-1">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChartType(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              chartType === t.id ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
