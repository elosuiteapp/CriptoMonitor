import { useEffect, useRef } from "react";

import { ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";

const UP = "#10b981";
const DOWN = "#f43f5e";

export interface BotCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}
export interface BotMarker {
  time: UTCTimestamp;
  side: "buy" | "sell";
  text?: string;
}

/** Gráfico de velas (Lightweight Charts) com marcadores de compra/venda do robô.
 *  Isolado/reutilizável no /admin/robo. */
export default function BotChart({ candles, markers, decimals = 2, height = 360 }: { candles: BotCandle[]; markers: BotMarker[]; decimals?: number; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
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
      rightPriceScale: { borderColor: c.border, minimumWidth: 64 },
      timeScale: { borderColor: c.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
    });
    const series = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chartAxisColors(isDark);
    chartRef.current?.applyOptions({ layout: { textColor: c.text }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border } });
  }, [isDark]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    s.setData(candles);
    const mk: SeriesMarker<UTCTimestamp>[] = markers
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: m.time,
        position: m.side === "buy" ? "belowBar" : "aboveBar",
        color: m.side === "buy" ? UP : DOWN,
        shape: m.side === "buy" ? "arrowUp" : "arrowDown",
        text: m.text ?? (m.side === "buy" ? "C" : "V"),
      }));
    s.setMarkers(mk);
    if (candles.length) chartRef.current?.timeScale().fitContent();
  }, [candles, markers, decimals]);

  return <div ref={wrapRef} style={{ height }} className="w-full" />;
}
