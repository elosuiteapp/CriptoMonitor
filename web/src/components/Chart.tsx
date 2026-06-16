import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type Logical,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";

import { useTheme } from "../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../lib/chartTheme";
import { fmtUsd, priceDecimals } from "../lib/format";
import { gammaLevels } from "../lib/gammaLevels";
import { buildLiquidationGrid, liqColor, type OiPoint } from "../lib/liquidationModel";
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
  liquidations: boolean; // heatmap de liquidações (estimado) sobre o gráfico
}

interface ChartProps {
  asset: string;
  timeframe: Timeframe;
  chartType: ChartType;
  gamma: GammaData | null;
  layers: ActiveLayers;
  canUseLayers: boolean;
  walls?: OrderbookWall[];
  oiSeries?: OiPoint[];
}

const UP = "#22c55e";
const DOWN = "#ef4444";

export default function Chart({ asset, timeframe, chartType, gamma, layers, canUseLayers, walls, oiSeries }: ChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatTipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vp, setVp] = useState<VolumeProfile | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const { isDark } = useTheme();

  // ─── Cria o chart uma vez ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = chartAxisColors(isDark);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: c.text,
        fontFamily: "system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: chartLocalization,
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, tickMarkFormatter: chartTickFormatter },
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recolore eixos/grade ao trocar de tema (sem recriar o chart).
  useEffect(() => {
    const c = chartAxisColors(isDark);
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
  }, [isDark]);

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
        const dec = priceDecimals(candles[candles.length - 1]?.close);
        series.applyOptions({ priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) } });
        chart.timeScale().fitContent();
        setVp(computeVolumeProfile(candles));
        setCandles(candles);

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

  // ─── Heatmap de liquidações (estimativa: modelo de alavancagem) ──────────────
  // Desenha numa <canvas> ATRÁS das velas (o fundo do chart é transparente, então
  // o heat aparece e as velas ficam por cima). A grade é em espaço de dados; só o
  // mapeamento p/ pixels muda no pan/zoom → recalcula a grade quando os candles
  // mudam e apenas repinta (drawImage) quando a escala muda.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = heatCanvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!chart || !series || !canvas || !wrap || !ctx) return;

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    if (!canUseLayers || !layers.liquidations || candles.length < 10) {
      clear();
      return;
    }

    const grid = buildLiquidationGrid(candles, oiSeries ?? []);
    if (!grid) {
      clear();
      return;
    }

    // canvas offscreen (nCols×nBins) com a paleta já aplicada → drawImage suaviza
    const off = document.createElement("canvas");
    off.width = grid.nCols;
    off.height = grid.nBins;
    const octx = off.getContext("2d");
    if (!octx) {
      clear();
      return;
    }
    // Piso de intensidade: zonas fracas ficam transparentes (despolui — mostra só
    // as "magnet zones" relevantes). A opacidade sobe com a intensidade → fraco
    // translúcido, forte sólido. HEAT_FLOOR é o corte (% do máximo).
    const HEAT_FLOOR = 0.3;
    const img = octx.createImageData(grid.nCols, grid.nBins);
    for (let col = 0; col < grid.nCols; col++) {
      for (let bin = 0; bin < grid.nBins; bin++) {
        const ratio = grid.values[col * grid.nBins + bin] / grid.max;
        const px = (bin * grid.nCols + col) * 4;
        if (ratio < HEAT_FLOOR) {
          img.data[px + 3] = 0;
          continue;
        }
        const r = (ratio - HEAT_FLOOR) / (1 - HEAT_FLOOR); // reescala 0..1
        const [cr, cg, cb] = liqColor(r);
        img.data[px] = cr;
        img.data[px + 1] = cg;
        img.data[px + 2] = cb;
        img.data[px + 3] = Math.round(120 + 135 * r); // 47% → 100% de opacidade
      }
    }
    octx.putImageData(img, 0, 0);

    const tscale = chart.timeScale();
    let lastSig = "";
    let raf = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const x0 = tscale.logicalToCoordinate(0 as Logical);
      const xN = tscale.logicalToCoordinate((grid.nCols - 1) as Logical);
      // mapeia a partir de dois preços in-range (high/low dos candles) e extrapola
      // até o topo/fundo da grade — robusto à auto-escala do eixo de preço
      const yHi = series.priceToCoordinate(grid.refHigh);
      const yLo = series.priceToCoordinate(grid.refLow);
      if (x0 == null || xN == null || yHi == null || yLo == null) return;
      const slope = (yLo - yHi) / (grid.refLow - grid.refHigh); // px por unidade de preço
      const yTop = yHi + (grid.priceTop - grid.refHigh) * slope;
      const yBot = yHi + (grid.priceBottom - grid.refHigh) * slope;

      const sig = `${W}x${H}|${x0}|${xN}|${yTop}|${yBot}`;
      if (sig === lastSig) return;
      lastSig = sig;

      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cellW = (xN - x0) / Math.max(1, grid.nCols - 1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, grid.nCols, grid.nBins, x0 - cellW / 2, yTop, xN - x0 + cellW, yBot - yTop);
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    // Tooltip no hover: lê a intensidade estimada da célula sob o cursor.
    const span = grid.priceTop - grid.priceBottom;
    const onCrosshair = (param: MouseEventParams<Time>) => {
      const tip = heatTipRef.current;
      if (!tip) return;
      const price = param.point ? series.coordinateToPrice(param.point.y) : null;
      if (!param.point || param.logical == null || price == null) {
        tip.style.display = "none";
        return;
      }
      const bin = Math.floor(((grid.priceTop - price) / span) * grid.nBins);
      const col = Math.max(0, Math.min(grid.nCols - 1, Math.round(param.logical)));
      const ratio = bin >= 0 && bin < grid.nBins ? grid.values[col * grid.nBins + bin] / grid.max : 0;
      if (ratio < 0.06) {
        tip.style.display = "none";
        return;
      }
      const word = ratio >= 0.66 ? "forte" : ratio >= 0.33 ? "média" : "fraca";
      tip.textContent = `Liq. estimada · ~$${Math.round(price).toLocaleString("pt-BR")} · ${Math.round(ratio * 100)}% (${word})`;
      tip.style.display = "block";
      tip.style.left = `${param.point.x + 12}px`;
      tip.style.top = `${param.point.y + 12}px`;
    };
    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      cancelAnimationFrame(raf);
      chart.unsubscribeCrosshairMove(onCrosshair);
      if (heatTipRef.current) heatTipRef.current.style.display = "none";
      clear();
    };
  }, [candles, oiSeries, layers.liquidations, canUseLayers, chartType]);

  return (
    <div ref={wrapRef} className="relative h-[360px] w-full">
      <canvas ref={heatCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 1 }} />
      {canUseLayers && layers.liquidations && (
        <>
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
            Heatmap de liquidações · estimativa (modelo de alavancagem)
          </div>
          {/* Legenda de intensidade (fraco → forte) */}
          <div className="pointer-events-none absolute bottom-8 left-2 z-10 flex items-center gap-1.5 rounded bg-background/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <span>fraco</span>
            <span
              className="h-2 w-24 rounded"
              style={{ background: "linear-gradient(to right, rgb(12,16,40), rgb(49,46,129), rgb(13,148,136), rgb(132,204,22), rgb(250,204,21))" }}
            />
            <span>forte</span>
          </div>
          <div
            ref={heatTipRef}
            className="pointer-events-none absolute z-20 rounded bg-background/95 px-2 py-1 text-[10px] text-foreground shadow-lg ring-1 ring-border"
            style={{ display: "none" }}
          />
        </>
      )}
      {error && (
        <div className="absolute inset-0 z-20 grid place-items-center text-sm text-muted-foreground">
          Gráfico indisponível ({error})
        </div>
      )}
    </div>
  );
}
