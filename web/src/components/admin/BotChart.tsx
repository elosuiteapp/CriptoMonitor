import { useEffect, useRef } from "react";

import { ColorType, CrosshairMode, createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";

const UP = "#10b981";
const DOWN = "#f43f5e";
const EXIT = "#64748b"; // slate discreto — ponto de SAÍDA (recua visualmente; a entrada é a estrela)

export interface BotCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
export interface BotIndicatorLine {
  id: string; // estável — reusa a série entre atualizações ao vivo
  title: string;
  color: string;
  dashed?: boolean;
  width?: 1 | 2;
  data: { time: UTCTimestamp; value: number }[];
}
export interface BotMarker {
  time: UTCTimestamp;
  side: "buy" | "sell";
  kind?: "entry" | "add" | "exit";
  text?: string;
}
export interface BotPriceLine {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
  width?: 1 | 2;
}
export interface BotSubRef { value: number; color: string; dashed?: boolean }
/** Sub-painel de indicadores (blocos do Robô 2.0) — escala própria −100..+100 no rodapé do gráfico. */
export interface BotSub { lines: BotIndicatorLine[]; refs?: BotSubRef[] }

const SUB_SCALE = "left"; // escala do sub-painel (eixo à esquerda, −100..+100)
const PIN_100 = () => ({ priceRange: { minValue: -108, maxValue: 108 } }); // trava a escala do sub-painel

/** Gráfico de velas (Lightweight Charts) — marcadores de trade + sub-painel de indicadores por bloco. */
export default function BotChart({ candles, markers, priceLines = [], lines = [], sub = null, decimals = 2, height = 460, fitKey }: { candles: BotCandle[]; markers: BotMarker[]; priceLines?: BotPriceLine[]; lines?: BotIndicatorLine[]; sub?: BotSub | null; decimals?: number; height?: number; fitKey?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const subSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const subRefSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const didFitRef = useRef(false);
  const { isDark } = useTheme();

  useEffect(() => { didFitRef.current = false; }, [fitKey]);

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
      leftPriceScale: { visible: false, borderColor: c.border, minimumWidth: 40, scaleMargins: { top: 0.68, bottom: 0.02 } },
      timeScale: { borderColor: c.border, timeVisible: true, rightOffset: 4, barSpacing: 9, tickMarkFormatter: chartTickFormatter },
    });
    const series = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lineSeriesRef.current.clear();
      subSeriesRef.current.clear();
      subRefSeriesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = chartAxisColors(isDark);
    chartRef.current?.applyOptions({ layout: { textColor: c.text }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.border }, leftPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border } });
  }, [isDark]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    s.setData(candles);
    // MARCADORES — entrada = ESTRELA (seta grande C/V), saída = ponto discreto (sem texto, tira poluição), pirâmide = "+".
    const mk: SeriesMarker<UTCTimestamp>[] = markers
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((m): SeriesMarker<UTCTimestamp> => {
        if (m.kind === "exit") {
          return { time: m.time, position: m.side === "sell" ? "aboveBar" : "belowBar", color: EXIT, shape: "circle", size: 0.5 };
        }
        if (m.kind === "add") {
          return { time: m.time, position: m.side === "buy" ? "belowBar" : "aboveBar", color: m.side === "buy" ? UP : DOWN, shape: "circle", text: "+", size: 0.9 };
        }
        return { time: m.time, position: m.side === "buy" ? "belowBar" : "aboveBar", color: m.side === "buy" ? UP : DOWN, shape: m.side === "buy" ? "arrowUp" : "arrowDown", text: m.side === "buy" ? "C" : "V", size: 1.4 };
      });
    s.setMarkers(mk);
    if (candles.length && !didFitRef.current) {
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 110), to: candles.length + 4 });
      didFitRef.current = true;
    }
  }, [candles, markers, decimals]);

  // Indicadores SOBRE as velas (EMA/VWAP) — série de linha por id estável (escala do preço).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = lineSeriesRef.current;
    const ids = new Set(lines.map((l) => l.id));
    for (const [id, s] of map) if (!ids.has(id)) { chart.removeSeries(s); map.delete(id); }
    for (const l of lines) {
      let s = map.get(l.id);
      const opts = { color: l.color, lineWidth: (l.width ?? 1) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      if (!s) { s = chart.addLineSeries(opts); map.set(l.id, s); } else s.applyOptions(opts);
      s.setData(l.data);
    }
  }, [lines]);

  // Linhas de nível da posição (Entrada tracejada · 🛑 Stop sólida · Pico) — na escala do preço.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    for (const pl of priceLinesRef.current) s.removePriceLine(pl);
    priceLinesRef.current = priceLines.map((l) =>
      s.createPriceLine({ price: l.price, color: l.color, lineWidth: (l.width ?? 2) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: l.title }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLines.map((l) => `${l.title}:${l.price}`).join("|")]);

  // ── SUB-PAINEL DE INDICADORES (blocos do Robô 2.0) — escala própria −100..+100 no rodapé. ──
  useEffect(() => {
    const chart = chartRef.current, cs = seriesRef.current;
    if (!chart || !cs) return;
    const c = chartAxisColors(isDark);
    const has = !!(sub && sub.lines.length && candles.length);
    // As velas cedem o rodapé quando o sub-painel está ligado.
    cs.priceScale().applyOptions({ scaleMargins: has ? { top: 0.05, bottom: 0.36 } : { top: 0.08, bottom: 0.08 } });
    chart.applyOptions({ leftPriceScale: { visible: has, borderColor: c.border, scaleMargins: { top: 0.68, bottom: 0.02 } } });
    for (const s of subRefSeriesRef.current) chart.removeSeries(s);
    subRefSeriesRef.current = [];
    const map = subSeriesRef.current;
    if (!has) { for (const [id, s] of map) { chart.removeSeries(s); map.delete(id); } return; }
    const t0 = candles[0].time, t1 = candles[candles.length - 1].time;
    for (const r of sub!.refs ?? []) {
      const rs = chart.addLineSeries({ priceScaleId: SUB_SCALE, color: r.color, lineWidth: 1, lineStyle: r.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: PIN_100 });
      rs.setData([{ time: t0, value: r.value }, { time: t1, value: r.value }]);
      subRefSeriesRef.current.push(rs);
    }
    const ids = new Set(sub!.lines.map((l) => l.id));
    for (const [id, s] of map) if (!ids.has(id)) { chart.removeSeries(s); map.delete(id); }
    for (const l of sub!.lines) {
      let s = map.get(l.id);
      const opts = { priceScaleId: SUB_SCALE, color: l.color, lineWidth: (l.width ?? 2) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true, autoscaleInfoProvider: PIN_100 };
      if (!s) { s = chart.addLineSeries(opts); map.set(l.id, s); } else s.applyOptions(opts);
      s.setData(l.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, candles, isDark]);

  return <div ref={wrapRef} style={{ height }} className="w-full" />;
}
