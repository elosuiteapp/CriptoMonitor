import { useEffect, useRef } from "react";
import { ColorType, createChart, type IChartApi } from "lightweight-charts";

import { supabase } from "../lib/supabase";

interface LiqRow {
  long_usd: number | null;
  short_usd: number | null;
  ts: string;
}

const fmtUsd = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`;

/** Liquidações realizadas por bucket de 5 min (estilo CoinGlass): shorts liquidados
 *  sobem (verde = squeeze de baixa, preço subindo), longs descem (vermelho = flush
 *  de alta, preço caindo), com o spot sobreposto no eixo direito. Resolução 5 min. */
export default function LiquidationsChart({ asset }: { asset: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const emptyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: IChartApi | undefined;
    let cancelled = false;
    (async () => {
      const [{ data: liq }, { data: px }] = await Promise.all([
        supabase.from("liquidations").select("long_usd, short_usd, ts").eq("asset", asset).order("ts", { ascending: true }).limit(288),
        supabase.from("prices_cex").select("price, ts").eq("asset", asset).eq("exchange", "binance").order("ts", { ascending: true }).limit(288),
      ]);
      if (cancelled || !ref.current) return;
      const liqRows = (liq as LiqRow[]) ?? [];
      const pxRows = (px as { price: number | null; ts: string }[]) ?? [];
      if (emptyRef.current) emptyRef.current.style.display = liqRows.length < 2 ? "block" : "none";

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
        rightPriceScale: { visible: true, borderColor: "rgba(148,163,184,0.15)" },
        leftPriceScale: {
          visible: true,
          borderColor: "rgba(148,163,184,0.15)",
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true },
      });

      // Spot (eixo direito) por baixo das barras
      const spotSeries = chart.addLineSeries({
        color: "#cbd5e1", lineWidth: 2, priceScaleId: "right", priceLineVisible: false, lastValueVisible: true, title: "Spot",
      });
      // Shorts liquidados → barras positivas (verde); longs liquidados → negativas (vermelho)
      const usdFormat = { type: "custom" as const, minMove: 1, formatter: (v: number) => fmtUsd(Math.abs(v)) };
      const shortsSeries = chart.addHistogramSeries({
        color: "#22c55e", priceScaleId: "left", priceLineVisible: false, lastValueVisible: false, priceFormat: usdFormat,
      });
      const longsSeries = chart.addHistogramSeries({
        color: "#ef4444", priceScaleId: "left", priceLineVisible: false, lastValueVisible: false, priceFormat: usdFormat,
      });

      const dedupe = <T extends { time: number }>(rows: T[]): T[] => {
        const seen = new Set<number>();
        return rows.filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));
      };
      const epoch = (ts: string) => Math.floor(new Date(ts).getTime() / 1000);

      const shortsData = dedupe(
        liqRows.map((r) => ({ time: epoch(r.ts), value: Number(r.short_usd ?? 0) })),
      );
      const longsData = dedupe(
        liqRows.map((r) => ({ time: epoch(r.ts), value: -Number(r.long_usd ?? 0) })),
      );
      shortsSeries.setData(shortsData as never);
      longsSeries.setData(longsData as never);

      const spotData = dedupe(
        pxRows.filter((r) => r.price != null).map((r) => ({ time: epoch(r.ts), value: Number(r.price) })),
      );
      spotSeries.setData(spotData as never);

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
        <div ref={ref} className="h-[260px] w-full" />
        <div ref={emptyRef} className="absolute inset-0 grid place-items-center text-xs text-slate-500" style={{ display: "none" }}>
          Coletando liquidações (a cada 5 min).
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-green-500" />Shorts liquidados ↑ (squeeze de baixa, preço sobe)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-red-500" />Longs liquidados ↓ (flush de alta, preço cai)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-slate-300" />Spot</span>
      </div>
    </div>
  );
}
