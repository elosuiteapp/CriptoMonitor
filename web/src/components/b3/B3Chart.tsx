import { useEffect, useRef, useState } from "react";

import { ColorType, CrosshairMode, LineStyle, createChart, type IChartApi, type ISeriesApi, type LogicalRange, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import type { B3Candle } from "../../lib/b3";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";
import { bollinger, ema, macd, rsi, sma } from "../../lib/indicators/ta";
import { computeVolumeProfile, type Candle, type ChartType } from "../../lib/marketData";

const UP = "#10b981";
const DOWN = "#f43f5e";
const VISIBLE_BARS = 120; // candles visíveis ao abrir (foco no momento atual; resto no zoom-out)
const AXIS_W = 64; // largura fixa do eixo de preço — alinha os subgráficos ao principal
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
  showVolumeProfile?: boolean; // Volume Profile: POC + topo/base do valor
  showRsi?: boolean; // subgráfico RSI sincronizado
  showMacd?: boolean; // subgráfico MACD sincronizado
}

/** Gráfico da B3 (Lightweight Charts): velas/barras/linha/área + EMA, Bollinger, MM200,
 *  Volume e Volume Profile. RSI/MACD viram SUBGRÁFICOS sincronizados (zoom/scroll juntos). */
export default function B3Chart({ candles, chartType, showEma, showVolume, showBollinger = false, showLongTrend = false, showVolumeProfile = false, showRsi = false, showMacd = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rsiWrapRef = useRef<HTMLDivElement>(null);
  const macdWrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const [expanded, setExpanded] = useState(false);
  const { isDark } = useTheme();

  // cria o chart principal uma vez
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
      rightPriceScale: { borderColor: c.border, minimumWidth: AXIS_W },
      timeScale: { borderColor: c.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recolore ao trocar de tema (principal + subs)
  useEffect(() => {
    const c = chartAxisColors(isDark);
    const opts = { layout: { textColor: c.text }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border } };
    for (const r of [chartRef, rsiChartRef, macdChartRef]) r.current?.applyOptions(opts);
  }, [isDark]);

  // cria/destrói subgráficos RSI/MACD + SINCRONIZA o eixo de tempo com o principal
  useEffect(() => {
    const main = chartRef.current;
    if (!main) return;
    const c = chartAxisColors(isDark);
    const mk = (el: HTMLDivElement) =>
      createChart(el, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.text, fontFamily: "system-ui, sans-serif" },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        localization: chartLocalization,
        rightPriceScale: { borderColor: c.border, minimumWidth: AXIS_W },
        timeScale: { borderColor: c.border, visible: false }, // só o principal mostra a data
      });
    const rsiChart = showRsi && rsiWrapRef.current ? mk(rsiWrapRef.current) : null;
    const macdChart = showMacd && macdWrapRef.current ? mk(macdWrapRef.current) : null;
    rsiChartRef.current = rsiChart;
    macdChartRef.current = macdChart;
    const all = [main, rsiChart, macdChart].filter(Boolean) as IChartApi[];

    // Sincroniza a janela visível entre todos (zoom/scroll juntos).
    let syncing = false;
    const handlers: { chart: IChartApi; fn: (r: LogicalRange | null) => void }[] = [];
    for (const src of all) {
      const fn = (range: LogicalRange | null) => {
        if (syncing || !range) return;
        syncing = true;
        for (const other of all) {
          if (other !== src) {
            try {
              other.timeScale().setVisibleLogicalRange(range);
            } catch {
              /* descartado */
            }
          }
        }
        syncing = false;
      };
      src.timeScale().subscribeVisibleLogicalRangeChange(fn);
      handlers.push({ chart: src, fn });
    }
    // alinhamento inicial
    const r0 = main.timeScale().getVisibleLogicalRange();
    if (r0) for (const s of [rsiChart, macdChart]) s?.timeScale().setVisibleLogicalRange(r0);

    return () => {
      for (const h of handlers) {
        try {
          h.chart.timeScale().unsubscribeVisibleLogicalRangeChange(h.fn);
        } catch {
          /* descartado */
        }
      }
      if (rsiChart) {
        rsiChart.remove();
        rsiChartRef.current = null;
      }
      if (macdChart) {
        macdChart.remove();
        macdChartRef.current = null;
      }
    };
  }, [showRsi, showMacd, isDark]);

  // (re)desenha série + indicadores (principal + RSI/MACD nos subgráficos)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = new Map<number, B3Candle>();
    for (const c of candles) if (Number.isFinite(c.time) && Number.isFinite(c.close)) map.set(c.time, c);
    const sorted = [...map.values()].sort((a, b) => a.time - b.time);
    const closes = sorted.map((c) => c.close);
    // deno-lint-ignore no-explicit-any
    const created: { chart: IChartApi; series: ISeriesApi<any> }[] = [];
    const add = (ch: IChartApi, s: ISeriesApi<"Line" | "Histogram" | "Candlestick" | "Bar" | "Area">) => created.push({ chart: ch, series: s });

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
      add(chart, price);

      if (showEma && sorted.length > 12) {
        for (const e of EMAS) {
          const vals = ema(closes, e.p);
          const ls = chart.addLineSeries({ color: e.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          ls.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] })) as never);
          add(chart, ls);
        }
      }

      const lineData = (vals: number[]) => sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: vals[i] })).filter((p) => Number.isFinite(p.value)) as never;
      const overlayLine = (vals: number[], color: string, width: 1 | 2 = 1) => {
        const ls = chart.addLineSeries({ color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ls.setData(lineData(vals));
        add(chart, ls);
      };

      if (showBollinger && sorted.length > 21) {
        const bb = bollinger(closes, 20, 2);
        overlayLine(bb.upper, "rgba(56,189,248,0.7)");
        overlayLine(bb.mid, "rgba(56,189,248,0.4)");
        overlayLine(bb.lower, "rgba(56,189,248,0.7)");
      }

      if (showLongTrend && sorted.length > 1) {
        overlayLine(sma(closes, 200), "#f97316", 2);
        const win = sorted.slice(-252);
        const hi = Math.max(...win.map((c) => c.high));
        const lo = Math.min(...win.map((c) => c.low));
        if (Number.isFinite(hi)) price.createPriceLine({ price: hi, color: "rgba(16,185,129,0.65)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Máx 52s" });
        if (Number.isFinite(lo)) price.createPriceLine({ price: lo, color: "rgba(244,63,94,0.65)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Mín 52s" });
      }

      if (showVolumeProfile && sorted.length > 10) {
        const win = sorted.slice(-VISIBLE_BARS);
        if (win.some((c) => (c.volume || 0) > 0)) {
          const vp = computeVolumeProfile(win as unknown as Candle[]);
          if (vp) {
            price.createPriceLine({ price: vp.poc, color: "rgba(234,179,8,0.85)", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "POC" });
            price.createPriceLine({ price: vp.vah, color: "rgba(168,85,247,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "VAH" });
            price.createPriceLine({ price: vp.val, color: "rgba(168,85,247,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: "VAL" });
          }
        }
      }

      if (showVolume && sorted.some((c) => (c.volume || 0) > 0)) {
        const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
        vol.setData(sorted.map((c) => ({ time: c.time as UTCTimestamp, value: c.volume || 0, color: c.close >= c.open ? "rgba(16,185,129,0.45)" : "rgba(244,63,94,0.45)" })) as never);
        add(chart, vol);
      }

      // ── RSI no subgráfico sincronizado ──
      const rc = rsiChartRef.current;
      if (rc && showRsi && sorted.length > 16) {
        const rs = rsi(closes, 14);
        const ls = rc.addLineSeries({ color: "#a855f7", lineWidth: 1, priceLineVisible: false });
        ls.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: rs[i] })).filter((p) => Number.isFinite(p.value)) as never);
        ls.createPriceLine({ price: 70, color: "rgba(244,63,94,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
        ls.createPriceLine({ price: 30, color: "rgba(16,185,129,0.4)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
        add(rc, ls);
      }

      // ── MACD no subgráfico sincronizado ──
      const mc = macdChartRef.current;
      if (mc && showMacd && sorted.length > 35) {
        const m = macd(closes);
        const hist = mc.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
        hist.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: m.hist[i], color: m.hist[i] >= 0 ? "rgba(16,185,129,0.5)" : "rgba(244,63,94,0.5)" })).filter((p) => Number.isFinite(p.value)) as never);
        const line = mc.addLineSeries({ color: "#3b82f6", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        line.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: m.line[i] })).filter((p) => Number.isFinite(p.value)) as never);
        const sig = mc.addLineSeries({ color: "#f97316", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        sig.setData(sorted.map((c, i) => ({ time: c.time as UTCTimestamp, value: m.signal[i] })).filter((p) => Number.isFinite(p.value)) as never);
        add(mc, hist);
        add(mc, line);
        add(mc, sig);
      }

      const total = sorted.length;
      if (total > 0) {
        const range = { from: total - Math.min(total, VISIBLE_BARS), to: total + 4 };
        chart.timeScale().setVisibleLogicalRange(range as LogicalRange);
        for (const s of [rsiChartRef.current, macdChartRef.current]) s?.timeScale().setVisibleLogicalRange(range as LogicalRange);
      }
    } catch {
      /* dados inválidos neste ciclo — não derruba a tela */
    }

    return () => {
      for (const { chart: ch, series } of created) {
        if (ch === chartRef.current || ch === rsiChartRef.current || ch === macdChartRef.current) {
          try {
            ch.removeSeries(series);
          } catch {
            /* chart já descartado */
          }
        }
      }
    };
  }, [candles, chartType, showEma, showVolume, showBollinger, showLongTrend, showVolumeProfile, showRsi, showMacd]);

  return (
    <div className={expanded ? "rounded-xl" : ""}>
      <div className={`relative w-full ${expanded ? "h-[60vh]" : "h-[360px]"}`}>
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
      {showRsi && (
        <div className="mt-1 rounded-lg border border-border/60 bg-card/40 p-1">
          <div className="px-1 text-[10px] text-muted-foreground">RSI (14) — sobrecompra &gt;70 · sobrevenda &lt;30</div>
          <div ref={rsiWrapRef} className="h-[96px] w-full" />
        </div>
      )}
      {showMacd && (
        <div className="mt-1 rounded-lg border border-border/60 bg-card/40 p-1">
          <div className="px-1 text-[10px] text-muted-foreground">MACD (12/26/9)</div>
          <div ref={macdWrapRef} className="h-[96px] w-full" />
        </div>
      )}
    </div>
  );
}
