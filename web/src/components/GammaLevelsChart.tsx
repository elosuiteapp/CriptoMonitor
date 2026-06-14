import { useEffect, useRef } from "react";
import { ColorType, LineStyle, createChart, type IChartApi } from "lightweight-charts";

import { supabase } from "../lib/supabase";

interface Row {
  ts: string;
  spot_price: number | null;
  zero_gamma_level: number | null;
  call_wall: number | null;
  put_wall: number | null;
  max_pain: number | null;
  avg_call_strike: number | null;
  avg_put_strike: number | null;
}

const LINES: { key: keyof Row; color: string; title: string; dashed?: boolean }[] = [
  { key: "spot_price", color: "#e5e7eb", title: "Spot" },
  { key: "zero_gamma_level", color: "#a855f7", title: "Zero Gamma" },
  { key: "call_wall", color: "#22c55e", title: "Call Wall" },
  { key: "put_wall", color: "#ef4444", title: "Put Wall" },
  { key: "max_pain", color: "#eab308", title: "Max Pain", dashed: true },
  { key: "avg_call_strike", color: "#16a34a", title: "Média calls", dashed: true },
  { key: "avg_put_strike", color: "#dc2626", title: "Média puts", dashed: true },
];

/** Níveis de gamma ao longo do tempo (PRD3, estilo SpotGamma key levels).
 *  Lê o histórico do gamma_profile e plota cada nível como uma linha. */
export default function GammaLevelsChart({ asset }: { asset: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const emptyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: IChartApi | undefined;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("gamma_profile")
        .select("ts, spot_price, zero_gamma_level, call_wall, put_wall, max_pain, avg_call_strike, avg_put_strike")
        .eq("asset", asset)
        .order("ts", { ascending: true })
        .limit(500);
      if (cancelled || !ref.current) return;
      const rows = (data as Row[]) ?? [];
      if (emptyRef.current) emptyRef.current.style.display = rows.length < 2 ? "block" : "none";

      chart = createChart(ref.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#94a3b8",
          fontFamily: "system-ui, sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(148,163,184,0.06)" },
          horzLines: { color: "rgba(148,163,184,0.06)" },
        },
        rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
        timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true },
      });

      for (const l of LINES) {
        const series = chart.addLineSeries({
          color: l.color,
          lineWidth: 2,
          lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: true,
          title: l.title,
        });
        const seen = new Set<number>();
        const pts = rows
          .filter((r) => r[l.key] != null)
          .map((r) => ({ time: Math.floor(new Date(r.ts).getTime() / 1000), value: Number(r[l.key]) }))
          .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
        series.setData(pts as never);
      }
      chart.timeScale().fitContent();
    })();

    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [asset]);

  return (
    <div>
      <div className="relative">
        <div ref={ref} className="h-[320px] w-full" />
        <div ref={emptyRef} className="absolute inset-0 grid place-items-center text-xs text-slate-500" style={{ display: "none" }}>
          Acumulando histórico de níveis (a cada 5 min).
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {LINES.map((l) => (
          <span key={l.title} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded" style={{ background: l.color }} />
            {l.title}
          </span>
        ))}
      </div>
    </div>
  );
}
