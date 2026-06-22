import { useEffect, useRef } from "react";

import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import type { B3Candle } from "../../lib/b3";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";
import { bollinger, ema, sma } from "../../lib/indicators/ta";
import type { ChartType } from "../../lib/marketData";

const UP = "#10b981";
const DOWN = "#f43f5e";
const EMAS = [
  { p: 9, color: "#eab308" },
  { p: 21, color: "#3b82f6" },
  { p: 50, color: "#a855f7" },
];

interface Props {
  candles: B3Candle[];
  chartType: ChartType;
  showEma: boolean;
  showVolume: boolean;
  showBollinger?: boolean;
  showLongTrend?: boolean; // MM200 + linhas máx/mín 52 semanas
}

/** Gráfico da B3 — reusa o tema/comportamento do gráfico cripto (Lightweight Charts):
 *  tipos (velas/barras/linha/área), indicadores (EMA 9/21/50) e volume. Sem WS (B3 atrasado). */
export default function B3Chart({ candles, chartType, showEma, showVolume, showBollinger = false, showLongTrend = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { isDark } = useTheme();

  // cria o chart uma vez
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

  // recolore ao trocar de tema
  useEffect(() => {
    const c = chartAxisColors(isDark);
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
  }, [isDark]);

  // (re)desenha série + indicadores
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // dedup por time + ordena asc — lightweight-charts EXIGE tempos únicos e crescentes
    // (Yahoo às vezes repete o último timestamp → setData lança e derruba a tela).
    const map = new Map<number, B3Candle>();
    for (const c of candles) if (Number.isFinite(c.time) && Number.isFinite(c.close)) map.set(c.time, c);
    const sorted = [...map.values()].sort((a, b) => a.time - b.time);
    // deno-lint-ignore no-explicit-any
    const created: ISeriesApi<any>[] = [];

    try {
      const price =
        chartType === "candles"
          ? chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false })
          : chartType === "bars"
            ? chart.addBarSeries({ upColor: UP, downColor: DOWN })
            : chartType === "line"
              ? chart.addLineSeries({ color: "#6366f1", lineWidth: 2 })
              : chart.addAreaSeries({ lineColor: "#6366f1", topColor: "rgba(99,102,241,0.4)", bottomColor: "rgba(99,102,241,0.02)" });
      if (chartType === "line" || chartType === "area") price.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })) as never);
      else price.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })) as never);
      created.push(price);

      if (showEma && sorted.length > 12) {
        const closes = sorted.map((c) => c.close);
        for (const e of EMAS) {
          const vals = ema(closes, e.p);
          const ls = chart.addLineSeries({ color: e.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          ls.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] })) as never);
          created.push(ls);
        }
      }

      const lineData = (vals: number[]) =>
        sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] })).filter((p) => Number.isFinite(p.value)) as never;
      const overlayLine = (vals: number[], color: string, width: 1 | 2 = 1) => {
        const ls = chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ls.setData(lineData(vals));
        created.push(ls);
      };

      // Bandas de Bollinger (20, 2σ) — volatilidade e reversão à média.
      if (showBollinger && sorted.length > 21) {
        const closes = sorted.map((c) => c.close);
        const bb = bollinger(closes, 20, 2);
        overlayLine(bb.upper, "rgba(56,189,248,0.7)");
        overlayLine(bb.mid, "rgba(56,189,248,0.4)");
        overlayLine(bb.lower, "rgba(56,189,248,0.7)");
      }

      // Tendência longa: MM200 + linhas de máx/mín de 52 semanas (~252 pregões).
      if (showLongTrend && sorted.length > 1) {
        overlayLine(sma(sorted.map((c) => c.close), 200), "#f97316", 2);
        const win = sorted.slice(-252);
        const hi = Math.max(...win.map((c) => c.high));
        const lo = Math.min(...win.map((c) => c.low));
        if (Number.isFinite(hi)) price.createPriceLine({ price: hi, color: "rgba(16,185,129,0.65)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Máx 52s" });
        if (Number.isFinite(lo)) price.createPriceLine({ price: lo, color: "rgba(244,63,94,0.65)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Mín 52s" });
      }

      // Volume só quando há dado (pares de moeda como USD/BRL vêm sem volume no Yahoo).
      if (showVolume && sorted.some((c) => (c.volume || 0) > 0)) {
        const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        vol.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume || 0, color: c.close >= c.open ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)" })) as never);
        created.push(vol);
      }

      chart.timeScale().fitContent();
    } catch {
      /* dados inválidos neste ciclo — não derruba a tela */
    }

    return () => {
      // só remove se o chart AINDA é o atual (na desmontagem o effect de criação já
      // chamou chart.remove() → removeSeries lançaria "Object is disposed" → tela preta).
      if (chartRef.current !== chart) return;
      try {
        for (const s of created) chart.removeSeries(s);
      } catch {
        /* chart já descartado */
      }
    };
  }, [candles, chartType, showEma, showVolume, showBollinger, showLongTrend]);

  return <div ref={wrapRef} className="h-[360px] w-full" />;
}
