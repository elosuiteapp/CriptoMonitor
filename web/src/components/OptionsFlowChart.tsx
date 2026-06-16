import { useEffect, useRef } from "react";
import { ColorType, LineStyle, createChart, type IChartApi } from "lightweight-charts";

import { useTheme } from "../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../lib/chartTheme";
import { supabase } from "../lib/supabase";

/** Proxy de fluxo de opções (HIRO simplificado, PRD3). Linha do delta-fluxo
 *  acumulado (eixo esquerdo), colorida por direção (verde sobe / vermelho cai),
 *  sobre o preço spot (eixo direito). Resolução 5 min. */
export default function OptionsFlowChart({ asset }: { asset: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const emptyRef = useRef<HTMLDivElement | null>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    let chart: IChartApi | undefined;
    let cancelled = false;
    (async () => {
      // Busca as 288 linhas MAIS RECENTES (24h): ordena desc + limit e depois
      // inverte para crescente (o gráfico exige tempo crescente). Ordenar asc +
      // limit traria as 288 MAIS ANTIGAS — o gráfico ficava parado no 1º dia.
      const [{ data: flow }, { data: gp }] = await Promise.all([
        supabase.from("options_flow").select("net_delta_flow, ts").eq("asset", asset).order("ts", { ascending: false }).limit(288),
        supabase.from("gamma_profile").select("spot_price, ts").eq("asset", asset).order("ts", { ascending: false }).limit(288),
      ]);
      if (cancelled || !ref.current) return;
      const flowRows = ((flow as { net_delta_flow: number | null; ts: string }[]) ?? []).slice().reverse();
      const gpRows = ((gp as { spot_price: number | null; ts: string }[]) ?? []).slice().reverse();
      if (emptyRef.current) emptyRef.current.style.display = flowRows.length < 2 ? "block" : "none";

      const ax = chartAxisColors(isDark);
      chart = createChart(ref.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: ax.text,
          fontFamily: "system-ui, sans-serif",
        },
        grid: {
          vertLines: { color: ax.grid },
          horzLines: { color: ax.grid },
        },
        localization: chartLocalization,
        rightPriceScale: { borderColor: ax.border },
        leftPriceScale: { visible: true, borderColor: ax.border },
        timeScale: { borderColor: ax.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
      });

      const spotSeries = chart.addLineSeries({
        color: ax.text, lineWidth: 1, lineStyle: LineStyle.Dotted, priceScaleId: "right", priceLineVisible: false, lastValueVisible: true, title: "Spot",
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

      // Cor por direção do acumulado: cada trecho contíguo de mesma direção é UMA
      // série própria (séries sobrepostas vazariam cor uma na outra). A direção sai
      // de uma média móvel curta pra não virar confete no ruído. Verde sobe, vermelho desce.
      const ch = chart;
      const win = 5;
      const sm = cumData.map((_, i) => {
        let s = 0;
        let c = 0;
        for (let j = Math.max(0, i - win + 1); j <= i; j++) {
          s += cumData[j].value;
          c++;
        }
        return s / c;
      });
      const runs: { up: boolean; pts: { time: number; value: number }[] }[] = [];
      for (let i = 1; i < cumData.length; i++) {
        const up = sm[i] >= sm[i - 1];
        const last = runs[runs.length - 1];
        if (last && last.up === up) last.pts.push(cumData[i]);
        else runs.push({ up, pts: [cumData[i - 1], cumData[i]] });
      }
      runs.forEach((run, idx) => {
        const isLast = idx === runs.length - 1;
        const s = ch.addLineSeries({
          color: run.up ? "#22c55e" : "#ef4444",
          lineWidth: 2,
          priceScaleId: "left",
          priceLineVisible: false,
          lastValueVisible: isLast,
          title: isLast ? "Fluxo acum." : "",
        });
        s.setData(run.pts as never);
        if (idx === 0) {
          s.createPriceLine({ price: 0, color: "rgba(148,163,184,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        }
      });

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
  }, [asset, isDark]);

  return (
    <div>
      <div className="relative">
        <div ref={ref} className="h-[260px] w-full" />
        <div ref={emptyRef} className="absolute inset-0 grid place-items-center text-xs text-muted-foreground" style={{ display: "none" }}>
          Acumulando fluxo de opções (a cada 5 min).
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-emerald-500" />Fluxo subindo (hedge comprador: compra de call/venda de put)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-rose-500" />Fluxo caindo (hedge vendedor)</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded bg-muted-foreground" />Spot</span>
      </div>
    </div>
  );
}
