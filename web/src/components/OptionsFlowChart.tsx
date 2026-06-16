import { useEffect, useRef } from "react";
import { ColorType, LineStyle, createChart, type IChartApi } from "lightweight-charts";

import { supabase } from "../lib/supabase";

/** Proxy de fluxo de opções (HIRO simplificado, PRD3). Linha do delta-fluxo
 *  acumulado (eixo esquerdo), colorida por direção (verde sobe / vermelho cai),
 *  sobre o preço spot (eixo direito). Resolução 5 min. */
export default function OptionsFlowChart({ asset }: { asset: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const emptyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: IChartApi | undefined;
    let cancelled = false;
    (async () => {
      const [{ data: flow }, { data: gp }] = await Promise.all([
        supabase.from("options_flow").select("net_delta_flow, ts").eq("asset", asset).order("ts", { ascending: true }).limit(288),
        supabase.from("gamma_profile").select("spot_price, ts").eq("asset", asset).order("ts", { ascending: true }).limit(288),
      ]);
      if (cancelled || !ref.current) return;
      const flowRows = (flow as { net_delta_flow: number | null; ts: string }[]) ?? [];
      const gpRows = (gp as { spot_price: number | null; ts: string }[]) ?? [];
      if (emptyRef.current) emptyRef.current.style.display = flowRows.length < 2 ? "block" : "none";

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
        leftPriceScale: { visible: true, borderColor: "rgba(148,163,184,0.15)" },
        timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true },
      });

      // Duas séries para colorir o acumulado por direção: verde quando sobe (fluxo
      // de hedge comprador), vermelho quando cai. Cada trecho é desenhado por uma
      // série; os pontos de virada entram nas duas para a linha não quebrar.
      const upSeries = chart.addLineSeries({
        color: "#22c55e", lineWidth: 2, priceScaleId: "left", priceLineVisible: false, lastValueVisible: true, title: "Fluxo acum.",
      });
      const downSeries = chart.addLineSeries({
        color: "#ef4444", lineWidth: 2, priceScaleId: "left", priceLineVisible: false, lastValueVisible: true, title: "Fluxo acum.",
      });
      upSeries.createPriceLine({
        price: 0, color: "rgba(148,163,184,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "",
      });
      const spotSeries = chart.addLineSeries({
        color: "#94a3b8", lineWidth: 1, lineStyle: LineStyle.Dotted, priceScaleId: "right", priceLineVisible: false, lastValueVisible: true, title: "Spot",
      });

      let cum = 0;
      const seen = new Set<number>();
      const cumData = flowRows
        .filter((r) => r.net_delta_flow != null)
        .map((r) => {
          cum += Number(r.net_delta_flow);
          return { time: Math.floor(new Date(r.ts).getTime() / 1000), value: Number(cum.toFixed(4)) };
        })
        .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)));

      const upData: { time: number; value?: number }[] = [];
      const downData: { time: number; value?: number }[] = [];
      cumData.forEach((p, i) => {
        const prevUp = i > 0 ? p.value >= cumData[i - 1].value : null;
        const nextUp = i < cumData.length - 1 ? cumData[i + 1].value >= p.value : null;
        const inUp = prevUp === true || nextUp === true;
        const inDown = prevUp === false || nextUp === false;
        upData.push(inUp ? { time: p.time, value: p.value } : { time: p.time });
        downData.push(inDown ? { time: p.time, value: p.value } : { time: p.time });
      });
      upSeries.setData(upData as never);
      downSeries.setData(downData as never);

      const seen2 = new Set<number>();
      const spotData = gpRows
        .filter((r) => r.spot_price != null)
        .map((r) => ({ time: Math.floor(new Date(r.ts).getTime() / 1000), value: Number(r.spot_price) }))
        .filter((p) => (seen2.has(p.time) ? false : (seen2.add(p.time), true)));
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
          Acumulando fluxo de opções (a cada 5 min).
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-emerald-500" />Fluxo subindo (hedge comprador: compra de call/venda de put)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-rose-500" />Fluxo caindo (hedge vendedor)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-slate-400" />Spot</span>
      </div>
    </div>
  );
}
