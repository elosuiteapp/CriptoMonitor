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
/** Sub-painel de indicadores (blocos do Robô 2.0) — GRÁFICO SEPARADO embaixo, escala própria ±100, tempo sincronizado. */
export interface BotSub { lines: BotIndicatorLine[]; refs?: BotSubRef[] }

const PIN_100 = () => ({ priceRange: { minValue: -108, maxValue: 108 } }); // trava a escala do sub-gráfico em ±100
const shortLabel = (t: string) => (t === "Força ponderada" ? "Força" : t === "Microestrutura" ? "Micro" : t === "Posicionamento" ? "Posic" : t);
const AXIS_W = 66; // largura fixa dos dois eixos de preço → as duas telas alinham na vertical

/** Gráfico do robô: velas (com marcadores de trade) em cima + tela separada de indicadores por bloco embaixo,
 *  com o eixo de TEMPO sincronizado (zoom/pan em uma move a outra). Lightweight Charts (2 instâncias). */
export default function BotChart({ candles, markers, priceLines = [], lines = [], sub = null, decimals = 2, height = 460, fitKey }: { candles: BotCandle[]; markers: BotMarker[]; priceLines?: BotPriceLine[]; lines?: BotIndicatorLine[]; sub?: BotSub | null; decimals?: number; height?: number; fitKey?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const subWrapRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const subChartRef = useRef<IChartApi | null>(null);
  const subSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const subRefSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const didFitRef = useRef(false);
  const syncingRef = useRef(false);
  const candleByTimeRef = useRef<Map<number, number>>(new Map());
  const subMetaRef = useRef<{ short: string; color: string; byTime: Map<number, number>; last: number | null }[]>([]);
  const mainHRef = useRef(height);
  const renderLegendRef = useRef<(p: unknown, isSub: boolean) => void>(() => {});
  const { isDark } = useTheme();

  const showSub = !!sub; // reserva a tela de baixo sempre que houver blocos
  const mainH = showSub ? Math.round((height - 1) * 0.64) : height;
  const subH = showSub ? height - mainH - 1 : 0;
  mainHRef.current = mainH;

  useEffect(() => { didFitRef.current = false; }, [fitKey]);

  // ── GRÁFICO PRINCIPAL (velas) — criado uma vez. Assina o crosshair p/ a legenda. ──
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
      timeScale: { borderColor: c.border, timeVisible: true, rightOffset: 4, barSpacing: 9, tickMarkFormatter: chartTickFormatter },
    });
    const series = chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    chartRef.current = chart;
    seriesRef.current = series;
    // Legenda (pop-up glass que segue o cursor): mostra preço + valor de cada bloco no ponto sob o mouse.
    const fmt = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}`;
    const renderLegend = (param: unknown, isSub: boolean) => {
      const leg = legendRef.current;
      if (!leg) return;
      const p = param as { point?: { x: number; y: number }; time?: number } | null;
      const meta = subMetaRef.current;
      if (!meta.length || !p?.point || p.time == null) { leg.style.display = "none"; return; }
      const t = p.time;
      const rows: string[] = [`<div style="opacity:.5;margin-bottom:3px">${new Date(t * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>`];
      const close = candleByTimeRef.current.get(t);
      if (close != null) rows.push(`<div style="display:flex;justify-content:space-between;gap:16px;padding-bottom:3px;margin-bottom:2px;border-bottom:1px solid rgba(127,127,127,.18)"><span style="opacity:.7">preço</span><b>${close}</b></div>`);
      for (const m of meta) {
        const v = m.byTime.get(t) ?? m.last;
        rows.push(`<div style="display:flex;align-items:center;justify-content:space-between;gap:16px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:9999px;background:${m.color};display:inline-block"></span><span style="opacity:.8">${m.short}</span></span><b style="color:${m.color}">${v == null ? "—" : fmt(v)}</b></div>`);
      }
      leg.innerHTML = rows.join("");
      leg.style.display = "flex";
      const cont = containerRef.current;
      const W = cont?.clientWidth ?? 0, H = cont?.clientHeight ?? 0;
      const lw = leg.offsetWidth, lh = leg.offsetHeight;
      const yBase = p.point.y + (isSub ? mainHRef.current + 1 : 0);
      let x = p.point.x + 16, y = yBase + 16;
      if (x + lw > W - 6) x = p.point.x - lw - 16;
      if (y + lh > H - 6) y = yBase - lh - 16;
      leg.style.left = `${Math.max(6, x)}px`;
      leg.style.top = `${Math.max(6, y)}px`;
    };
    renderLegendRef.current = renderLegend;
    chart.subscribeCrosshairMove((p) => renderLegend(p, false));
    return () => {
      chart.remove();
      subChartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      subChartRef.current = null;
      lineSeriesRef.current.clear();
      subSeriesRef.current.clear();
      subRefSeriesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tema — atualiza cores dos dois gráficos.
  useEffect(() => {
    const c = chartAxisColors(isDark);
    const opts = { layout: { textColor: c.text }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.border }, timeScale: { borderColor: c.border } };
    chartRef.current?.applyOptions(opts);
    subChartRef.current?.applyOptions(opts);
  }, [isDark]);

  // Velas + marcadores + enquadramento + índice tempo→preço p/ a legenda.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
    s.setData(candles);
    candleByTimeRef.current = new Map(candles.map((c) => [c.time as number, c.close]));
    // MARCADORES — entrada = ESTRELA (seta grande C/V), saída = ponto discreto (sem texto), pirâmide = "+".
    const mk: SeriesMarker<UTCTimestamp>[] = markers
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((m): SeriesMarker<UTCTimestamp> => {
        if (m.kind === "exit") return { time: m.time, position: m.side === "sell" ? "aboveBar" : "belowBar", color: EXIT, shape: "circle", size: 0.5 };
        if (m.kind === "add") return { time: m.time, position: m.side === "buy" ? "belowBar" : "aboveBar", color: m.side === "buy" ? UP : DOWN, shape: "circle", text: "+", size: 0.9 };
        return { time: m.time, position: m.side === "buy" ? "belowBar" : "aboveBar", color: m.side === "buy" ? UP : DOWN, shape: m.side === "buy" ? "arrowUp" : "arrowDown", text: m.side === "buy" ? "C" : "V", size: 1.4 };
      });
    s.setMarkers(mk);
    if (candles.length && !didFitRef.current) {
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 110), to: candles.length + 4 });
      didFitRef.current = true;
    }
  }, [candles, markers, decimals]);

  // Indicadores SOBRE as velas (EMA/VWAP) — na escala do preço do gráfico principal.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const map = lineSeriesRef.current;
    const ids = new Set(lines.map((l) => l.id));
    for (const [id, ser] of map) if (!ids.has(id)) { chart.removeSeries(ser); map.delete(id); }
    for (const l of lines) {
      let ser = map.get(l.id);
      const opts = { color: l.color, lineWidth: (l.width ?? 1) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      if (!ser) { ser = chart.addLineSeries(opts); map.set(l.id, ser); } else ser.applyOptions(opts);
      ser.setData(l.data);
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

  // ── TELA SEPARADA DE INDICADORES (2º gráfico embaixo) — criada/destruída conforme houver blocos;
  //    eixo de TEMPO sincronizado com o de cima (zoom/pan em um move o outro). ──
  useEffect(() => {
    const main = chartRef.current;
    if (!main) return;
    if (!showSub) {
      if (subChartRef.current) { subChartRef.current.remove(); subChartRef.current = null; subSeriesRef.current.clear(); subRefSeriesRef.current = []; subMetaRef.current = []; }
      main.applyOptions({ timeScale: { visible: true } });
      renderLegendRef.current(null, false);
      return;
    }
    const el = subWrapRef.current;
    if (!el) return;
    const c = chartAxisColors(isDark);
    if (!subChartRef.current) {
      const sc = createChart(el, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.text, fontFamily: "system-ui, sans-serif" },
        grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
        crosshair: { mode: CrosshairMode.Normal },
        localization: chartLocalization,
        rightPriceScale: { borderColor: c.border, minimumWidth: AXIS_W },
        timeScale: { borderColor: c.border, timeVisible: true, rightOffset: 4, barSpacing: 9, tickMarkFormatter: chartTickFormatter },
      });
      subChartRef.current = sc;
      main.applyOptions({ timeScale: { visible: false } }); // o eixo de tempo fica só na tela de baixo
      // SINCRONIZA o range de tempo nos dois sentidos (com trava anti-loop).
      const link = (from: IChartApi, to: IChartApi) => from.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (syncingRef.current || !r) return; syncingRef.current = true; try { to.timeScale().setVisibleLogicalRange(r); } finally { syncingRef.current = false; } });
      link(main, sc);
      link(sc, main);
      sc.subscribeCrosshairMove((p) => renderLegendRef.current(p, true));
      const r = main.timeScale().getVisibleLogicalRange();
      if (r) sc.timeScale().setVisibleLogicalRange(r);
    }
    const sc = subChartRef.current;
    // Refs (0 / ±limiar) reconstruídas.
    for (const rs of subRefSeriesRef.current) sc.removeSeries(rs);
    subRefSeriesRef.current = [];
    const t0 = candles[0]?.time, t1 = candles[candles.length - 1]?.time;
    if (t0 != null && t1 != null) for (const r of sub!.refs ?? []) {
      const rs = sc.addLineSeries({ color: r.color, lineWidth: 1, lineStyle: r.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: PIN_100 });
      rs.setData([{ time: t0, value: r.value }, { time: t1, value: r.value }]);
      subRefSeriesRef.current.push(rs);
    }
    // Linhas dos blocos.
    const map = subSeriesRef.current;
    const ids = new Set(sub!.lines.map((l) => l.id));
    for (const [id, ser] of map) if (!ids.has(id)) { sc.removeSeries(ser); map.delete(id); }
    for (const l of sub!.lines) {
      let ser = map.get(l.id);
      const opts = { color: l.color, lineWidth: (l.width ?? 2) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true, autoscaleInfoProvider: PIN_100 };
      if (!ser) { ser = sc.addLineSeries(opts); map.set(l.id, ser); } else ser.applyOptions(opts);
      ser.setData(l.data);
    }
    subMetaRef.current = sub!.lines.map((l) => ({ short: shortLabel(l.title), color: l.color, byTime: new Map(l.data.map((d) => [d.time as number, d.value])), last: l.data.length ? l.data[l.data.length - 1].value : null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSub, sub, candles, isDark]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height }}>
      <div ref={wrapRef} style={{ height: mainH }} className="w-full" />
      {showSub && <div className="h-px w-full bg-border/70" />}
      <div ref={subWrapRef} style={{ height: subH, display: showSub ? "block" : "none" }} className="w-full" />
      <div ref={legendRef} style={{ display: "none" }} className="pointer-events-none absolute z-20 flex-col gap-0.5 rounded-lg border border-white/10 bg-background/80 px-2.5 py-2 text-[11px] font-medium text-foreground shadow-xl backdrop-blur-md" />
    </div>
  );
}
