import type { ChartType, Timeframe } from "../lib/marketData";

const TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Velas" },
  { id: "bars", label: "Barras" },
  { id: "line", label: "Linha" },
  { id: "area", label: "Área" },
];

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: "15m", label: "15M" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
  { id: "1M", label: "1Mês" },
];

interface Props {
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}

export default function ChartTypeSelector({ chartType, onChartType, timeframe, onTimeframe }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.id}
            onClick={() => onTimeframe(tf.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              timeframe === tf.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => onChartType(t.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              chartType === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
