import { useEffect, useRef, useState } from "react";

import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { computeForexProfile, type ForexCandle } from "../../lib/forex";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";
import { bollinger, ema } from "../../lib/indicators/ta";
import { type ChartType } from "../../lib/marketData";

const UP = "#10b981";
const DOWN = "#f43f5e";
const VISIBLE_BARS = 120;
const EMAS = [
  { p: 9, color: "#eab308" },
  { p: 21, color: "#3b82f6" },
  { p: 50, color: "#a855f7" },
];

interface Props {
  candles: ForexCandle[];
  chartType: ChartType;
  decimals: number;
  showEma: boolean;
  showBollinger?: boolean;
  showVolumeProfile?: boolean;
}

/** Gráfico do módulo Forex (Lightweight Charts) — isolado do B3/Crypto. Velas/barras/
 *  linha/área, EMA 9/21/50, Bollinger e Volume Profile. Sem WS (câmbio spot Yahoo). */
export default function ForexChart({ candles, chartType, decimals, showEma, showBollinger = false, showVolumeProfile = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const c = chartAxisColors(isDark);
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.text, fontFamily: "system-ui, sans-serif" },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      localization: chartLocalization,
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chartAxisColors(isDark);
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
  }, [isDark]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // dedup por time + ordena asc (Yahoo às vezes repete timestamp → setData lança).
    const map = new Map<number, ForexCandle>();
    for (const c of candles) if (Number.isFinite(c.time) && Number.isFinite(c.close)) map.set(c.time, c);
    const sorted = [...map.values()].sort((a, b) => a.time - b.time);
    // deno-lint-ignore no-explicit-any
    const created: ISeriesApi<any>[] = [];
    const priceFormat = { type: "price" as const, precision: decimals, minMove: Number(`1e-${decimals}`) };

    try {
      const price =
        chartType === "candles"
          ? chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false, priceFormat })
          : chartType === "bars"
            ? chart.addBarSeries({ upColor: UP, downColor: DOWN, priceFormat })
            : chartType === "line"
              ? chart.addLineSeries({ color: "#6366f1", lineWidth: 2, priceFormat })
              : chart.addAreaSeries({ lineColor: "#6366f1", topColor: "rgba(99,102,241,0.4)", bottomColor: "rgba(99,102,241,0.02)", priceFormat });
      if (chartType === "line" || chartType === "area") price.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as never);
      else price.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })) as never);
      created.push(price);

      const overlayLine = (vals: number[], color: string, width: 1 | 2 = 1) => {
        const ls = chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat });
        ls.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] })).filter((p) => Number.isFinite(p.value)) as never);
        created.push(ls);
      };

      if (showEma && sorted.length > 12) {
        const closes = sorted.map((c) => c.close);
        for (const e of EMAS) overlayLine(ema(closes, e.p), e.color);
      }
      if (showBollinger && sorted.length > 21) {
        const closes = sorted.map((c) => c.close);
        const bb = bollinger(closes, 20, 2);
        overlayLine(bb.upper, "rgba(56,189,248,0.7)");
        overlayLine(bb.mid, "rgba(56,189,248,0.4)");
        overlayLine(bb.lower, "rgba(56,189,248,0.7)");
      }
      if (showVolumeProfile && sorted.length > 10) {
        // FX não tem volume → perfil tempo-no-preço (TPO). Funciona com OHLC puro.
        const vp = computeForexProfile(sorted.slice(-VISIBLE_BARS));
        if (vp) {
          price.createPriceLine({ price: vp.poc, color: "rgba(234,179,8,0.85)", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "POC" });
          price.createPriceLine({ price: vp.vah, color: "rgba(168,85,247,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "VAH" });
          price.createPriceLine({ price: vp.val, color: "rgba(168,85,247,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "VAL" });
        }
      }

      const total = sorted.length;
      if (total > 0) chart.timeScale().setVisibleLogicalRange({ from: total - Math.min(total, VISIBLE_BARS), to: total + 4 });
    } catch {
      /* dados inválidos neste ciclo — não derruba a tela */
    }

    return () => {
      if (chartRef.current !== chart) return;
      try {
        for (const s of created) chart.removeSeries(s);
      } catch {
        /* chart já descartado */
      }
    };
  }, [candles, chartType, decimals, showEma, showBollinger, showVolumeProfile]);

  return (
    <div className={`relative w-full ${expanded ? "h-[78vh]" : "h-[360px]"}`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        title={expanded ? "Recolher gráfico" : "Expandir gráfico"}
        aria-label={expanded ? "Recolher gráfico" : "Expandir gráfico"}
        className="absolute right-2 top-2 z-20 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
      >
        {expanded ? "⤡" : "⤢"}
      </button>
      <div ref={wrapRef} className="h-full w-full" />
    </div>
  );
}
