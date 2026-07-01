import { useEffect, useRef } from "react";

import { ColorType, CrosshairMode, createChart, LineStyle, type IChartApi, type IPriceLine, type ISeriesApi, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";

import { useTheme } from "../../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../../lib/chartTheme";

const UP = "#10b981";
const DOWN = "#f43f5e";
const EXIT = "#3b82f6"; // azul — ponto de SAÍDA/fechamento (distinto de compra/venda)

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
  kind?: "entry" | "add" | "exit"; // entrada, pirâmide (adição) ou SAÍDA/fechamento
  text?: string;
}
export interface BotPriceLine {
  price: number;
  color: string;
  title: string;
  dashed?: boolean; // tracejada (entrada/pico) × sólida (stop)
}

/** Gráfico de velas (Lightweight Charts) com marcadores de compra/venda do robô.
 *  Isolado/reutilizável no /admin/robo. */
export default function BotChart({ candles, markers, priceLines = [], decimals = 2, height = 420, fitKey }: { candles: BotCandle[]; markers: BotMarker[]; priceLines?: BotPriceLine[]; decimals?: number; height?: number; fitKey?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const didFitRef = useRef(false);
  const { isDark } = useTheme();

  // Re-enquadra só quando troca o ativo/timeframe (não a cada atualização ao vivo).
  useEffect(() => {
    didFitRef.current = false;
  }, [fitKey]);

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
      timeScale: { borderColor: c.border, timeVisible: true, rightOffset: 4, barSpacing: 9, tickMarkFormatter: chartTickFormatter },
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
      .map((m): SeriesMarker<UTCTimestamp> => {
        // SAÍDA/fechamento: quadrado AZUL destacado (posicionado do lado do fechamento).
        if (m.kind === "exit") {
          return {
            time: m.time,
            position: m.side === "buy" ? "belowBar" : "aboveBar",
            color: EXIT,
            shape: "square",
            text: m.text ?? "Saída",
          };
        }
        // ENTRADA (arrow C/V) ou PIRÂMIDE (círculo "+", mesma direção).
        return {
          time: m.time,
          position: m.side === "buy" ? "belowBar" : "aboveBar",
          color: m.side === "buy" ? UP : DOWN,
          shape: m.kind === "add" ? "circle" : m.side === "buy" ? "arrowUp" : "arrowDown",
          text: m.text ?? (m.side === "buy" ? "C" : "V"),
        };
      });
    s.setMarkers(mk);
    // Mostra as ~110 velas mais recentes (candles largos) — SÓ no 1º carregamento/troca de TF;
    // em atualizações ao vivo preserva o zoom/scroll do usuário.
    if (candles.length && !didFitRef.current) {
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 110), to: candles.length + 4 });
      didFitRef.current = true;
    }
  }, [candles, markers, decimals]);

  // Linhas de nível da posição aberta: Entrada (tracejada), 🛑 Stop (sólida, sobe c/ o trailing), Pico.
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    for (const pl of priceLinesRef.current) s.removePriceLine(pl);
    priceLinesRef.current = priceLines.map((l) =>
      s.createPriceLine({ price: l.price, color: l.color, lineWidth: 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: l.title }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceLines.map((l) => `${l.title}:${l.price}`).join("|")]);

  return <div ref={wrapRef} style={{ height }} className="w-full" />;
}
