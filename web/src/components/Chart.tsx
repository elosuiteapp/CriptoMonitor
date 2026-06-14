import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
} from "lightweight-charts";

import { fmtUsd } from "../lib/format";
import { gammaLevels } from "../lib/gammaLevels";
import {
  computeVolumeProfile,
  fetchKlines,
  subscribeKline,
  type Candle,
  type ChartType,
  type Timeframe,
  type VolumeProfile,
} from "../lib/marketData";
import type { GammaData, OrderbookWall } from "../lib/types";

export interface ActiveLayers {
  gex: boolean; // Call Wall + Put Wall
  zeroGamma: boolean;
  maxPain: boolean;
  volumeProfile: boolean; // POC + value area (calculado dos candles)
  orderbookWalls: boolean; // paredes do book (Binance + Coinbase)
  funding: boolean; // faixa de funding (renderizada abaixo do gráfico)
  cvd: boolean; // sub-gráfico de CVD (renderizado abaixo do gráfico)
}

interface ChartProps {
  asset: string;
  timeframe: Timeframe;
  chartType: ChartType;
  gamma: GammaData | null;
  layers: ActiveLayers;
  canUseLayers: boolean;
  walls?: OrderbookWall[];
}

const UP = "#22c55e";
const DOWN = "#ef4444";

export default function Chart({ asset, timeframe, chartType, gamma, layers, canUseLayers, walls }: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vp, setVp] = useState<VolumeProfile | null>(null);

  // ─── Cria o chart uma vez ──────────────────────────────────────────────────
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
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, []);

  // ─── (Re)cria a série conforme o tipo de gráfico e carrega os dados ─────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cleanupWs: (() => void) | undefined;
    let cancelled = false;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
      priceLinesRef.current = [];
    }

    const series =
      chartType === "candles"
        ? chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false })
        : chartType === "bars"
          ? chart.addBarSeries({ upColor: UP, downColor: DOWN })
          : chartType === "line"
            ? chart.addLineSeries({ color: "#6366f1", lineWidth: 2 })
            : chart.addAreaSeries({ lineColor: "#6366f1", topColor: "rgba(99,102,241,0.4)", bottomColor: "rgba(99,102,241,0.02)" });
    seriesRef.current = series;

    const toSeriesData = (candles: Candle[]) =>
      chartType === "line" || chartType === "area"
        ? candles.map((c) => ({ time: c.time as never, value: c.close }))
        : (candles as never[]);

    (async () => {
      try {
        setError(null);
        const candles = await fetchKlines(asset, timeframe);
        if (cancelled) return;
        series.setData(toSeriesData(candles) as never);
        chart.timeScale().fitContent();
        setVp(computeVolumeProfile(candles));

        cleanupWs = subscribeKline(asset, timeframe, (bar) => {
          if (chartType === "line" || chartType === "area") {
            series.update({ time: bar.time as never, value: bar.close } as never);
          } else {
            series.update(bar as never);
          }
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "falha ao carregar candles");
      }
    })();

    return () => {
      cancelled = true;
      cleanupWs?.();
    };
  }, [asset, timeframe, chartType]);

  // ─── Camadas (price lines) sobre a série ────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const line of priceLinesRef.current) series.removePriceLine(line);
    priceLinesRef.current = [];
    if (!canUseLayers) return;

    const levels = gammaLevels(gamma);
    const add = (price: number | null, color: string, title: string) => {
      if (price == null || !Number.isFinite(price)) return;
      const line = series.createPriceLine({
        price,
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    if (layers.gex) {
      add(levels.callWall, UP, "Call Wall");
      add(levels.putWall, DOWN, "Put Wall");
    }
    if (layers.zeroGamma) add(levels.zeroGamma, "#a855f7", "Zero Gamma");
    if (layers.maxPain) add(levels.maxPain, "#eab308", "Max Pain");
    if (layers.volumeProfile && vp) {
      add(vp.poc, "#38bdf8", "POC");
      add(vp.vah, "rgba(56,189,248,0.45)", "VA High");
      add(vp.val, "rgba(56,189,248,0.45)", "VA Low");
    }
    if (layers.orderbookWalls && walls?.length) {
      const top = [...walls].sort((a, b) => b.notional_usd - a.notional_usd).slice(0, 6);
      for (const w of top) {
        add(
          w.price,
          w.side === "bid" ? "#16a34a" : "#dc2626",
          `Parede ${w.side === "bid" ? "compra" : "venda"} ${fmtUsd(w.notional_usd)}`,
        );
      }
    }
  }, [gamma, layers, canUseLayers, chartType, vp, walls]);

  return (
    <div className="relative h-[360px] w-full">
      <div ref={containerRef} className="h-full w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">
          Gráfico indisponível ({error})
        </div>
      )}
    </div>
  );
}
