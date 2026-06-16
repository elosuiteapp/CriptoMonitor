import type { SeriesPoint } from "../hooks/useSeries";
import { fmtPct } from "../lib/format";
import InfoTip from "./InfoTip";

/** Faixa de cor de funding positivo/negativo ao longo do tempo (PRD §8.4). */
export default function FundingStrip({ data }: { data: SeriesPoint[] }) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-card dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        Funding — aguardando coleta
      </div>
    );
  }
  const last = data[data.length - 1].value;
  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">Funding (faixa temporal) <InfoTip text="Funding ao longo do tempo: verde = comprados pagando (otimismo alavancado), vermelho = vendidos pagando. Faixas longas no mesmo lado sinalizam posicionamento esticado." /></span>
        <span className={`num ${last >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          atual {fmtPct(last * 100, 4)}
        </span>
      </div>
      <div className="flex h-4 w-full gap-px overflow-hidden rounded">
        {data.map((p, i) => (
          <div
            key={i}
            title={fmtPct(p.value * 100, 4)}
            className={`h-full flex-1 ${p.value >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`}
          />
        ))}
      </div>
    </div>
  );
}
