import { useT } from "../lib/i18n";
import type { ChartType, Timeframe } from "../lib/marketData";

const TYPE_IDS: ChartType[] = ["candles", "bars", "line", "area"];
const TF_IDS: { id: Timeframe; key: "m15" | "h1" | "h4" | "d1" | "w1" | "mo1" }[] = [
  { id: "15m", key: "m15" },
  { id: "1h", key: "h1" },
  { id: "4h", key: "h4" },
  { id: "1d", key: "d1" },
  { id: "1w", key: "w1" },
  { id: "1M", key: "mo1" },
];

interface Props {
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  timeframe: Timeframe;
  onTimeframe: (t: Timeframe) => void;
}

export default function ChartTypeSelector({ chartType, onChartType, timeframe, onTimeframe }: Props) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TF_IDS.map((tf) => (
          <button
            key={tf.id}
            onClick={() => onTimeframe(tf.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              timeframe === tf.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.tf[tf.key]}
          </button>
        ))}
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TYPE_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onChartType(id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              chartType === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.chartType[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
