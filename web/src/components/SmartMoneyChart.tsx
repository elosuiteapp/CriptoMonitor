import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";

import type { Candle } from "../lib/marketData";
import type { SmcResult } from "../lib/smc";

const UP = "#22c55e";
const DOWN = "#ef4444";
const AMBER = "#f59e0b";
const GRAY = "#94a3b8";

interface Props {
  candles: Candle[];
  smc: SmcResult | null;
}

/** Gráfico dedicado da aba Smart Money: candles + níveis SMC (price lines) +
 *  marcadores de BOS/CHoCH. Mesmo tema visual do cockpit (Chart.tsx). */
export default function SmartMoneyChart({ candles, smc }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
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
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // Dados
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    series.setData(candles as never);
    chart.timeScale().fitContent();
  }, [candles]);

  // Níveis SMC + marcadores
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    if (!smc) {
      series.setMarkers([]);
      return;
    }

    const add = (price: number, color: string, title: string, style = LineStyle.Dotted) => {
      if (!Number.isFinite(price)) return;
      linesRef.current.push(
        series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }),
      );
    };

    // Liquidez (pools de stops) — os 4 maiores ainda não varridos
    smc.liquidity
      .filter((l) => !l.swept)
      .slice(0, 4)
      .forEach((l) => add(l.price, AMBER, l.side === "buy" ? "Liq compra" : "Liq venda"));

    // Order blocks (3 mais próximos do preço)
    [...smc.orderBlocks]
      .sort((a, b) => Math.abs(a.mid - smc.price) - Math.abs(b.mid - smc.price))
      .slice(0, 3)
      .forEach((ob) => {
        const c = ob.bias === "bullish" ? UP : DOWN;
        add(ob.top, c, `OB ${ob.bias === "bullish" ? "alta" : "baixa"}`, LineStyle.Solid);
        add(ob.bottom, c, "", LineStyle.Solid);
      });

    // Zonas premium / discount + extremos
    add(smc.premium.bottom, DOWN, "Premium", LineStyle.Dashed);
    add(smc.discount.top, UP, "Discount", LineStyle.Dashed);
    add(smc.trailingTop, GRAY, "Topo", LineStyle.Dotted);
    add(smc.trailingBottom, GRAY, "Fundo", LineStyle.Dotted);

    // Marcadores de estrutura (BOS/CHoCH) — últimos 10
    const markers = smc.structures.slice(-10).map((s) => ({
      time: s.time as never,
      position: (s.bias === "bullish" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
      color: s.bias === "bullish" ? UP : DOWN,
      shape: (s.bias === "bullish" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
      text: s.type,
    }));
    series.setMarkers(markers as never);
  }, [smc]);

  return <div ref={containerRef} className="h-[380px] w-full" />;
}
