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
import { useT } from "../lib/i18n";
import { fmtUsd, priceDecimals } from "../lib/format";
import { gammaLevels } from "../lib/gammaLevels";
import { buildLiquidationGrid, heatColor, liquidationMagnets, HEAT_GRADIENT_LONG, HEAT_GRADIENT_SHORT, type OiPoint } from "../lib/liquidationModel";
import {
  ANALYSIS_BARS,
  computeVolumeProfile,
  DEEP_HISTORY_BARS,
  DEFAULT_VISIBLE_BARS,
  fetchKlines,
  subscribeKline,
  type Candle,
  type ChartType,
  type Timeframe,
  type VolumeProfile,
} from "../lib/marketData";
import { aggregateWalls, type WallZone } from "../lib/orderbookWalls";
import type { GammaData, OrderbookWall } from "../lib/types";

export interface ActiveLayers {
  gex: boolean; // Call Wall + Put Wall
  zeroGamma: boolean;
  maxPain: boolean;
  volumeProfile: boolean; // POC + value area (calculado dos candles)
  orderbookWalls: boolean; // paredes do book (Binance + Coinbase)
  funding: boolean; // faixa de funding (renderizada abaixo do gráfico)
  cvd: boolean; // sub-gráfico de CVD (renderizado abaixo do gráfico)
  bookPressure: boolean; // sub-gráfico de pressão do book (bid×ask) no tempo
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
  // Emite o último preço (close do candle em formação, ao vivo via WS) para o pai —
  // assim o preço do topo (PriceHeader) espelha EXATAMENTE o do gráfico, em tempo real.
  onPrice?: (price: number) => void;
}

const UP = "#22c55e";
const DOWN = "#ef4444";

export default function Chart({ asset, timeframe, chartType, gamma, layers, canUseLayers, walls, oiSeries, onPrice }: ChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wallsCanvasRef = useRef<HTMLCanvasElement | null>(null); // barras de liquidez (Paredes do book)
  const heatTipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const magnetLinesRef = useRef<IPriceLine[]>([]); // linhas das zonas-ímã (camada Liquidações)
  const [error, setError] = useState<string | null>(null);
  const [vp, setVp] = useState<VolumeProfile | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const { isDark } = useTheme();
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);

  // Espelhamento do preço ao vivo para o topo: ref evita re-subscrever o WS, e o
  // throttle (~1s) evita re-render do Dashboard a cada tick.
  const onPriceRef = useRef(onPrice);
  onPriceRef.current = onPrice;
  const lastEmitRef = useRef(0);
  const livePriceRef = useRef<number | null>(null); // preço ao vivo p/ classificar suporte×resistência
  const emitPrice = (price: number | undefined, force = false) => {
    if (typeof price !== "number" || !Number.isFinite(price)) return;
    livePriceRef.current = price; // sempre atualiza (mesmo com o throttle do onPrice abaixo)
    const now = Date.now();
    if (!force && now - lastEmitRef.current < 1000) return;
    lastEmitRef.current = now;
    onPriceRef.current?.(price);
  };

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
        // Histórico profundo p/ exibição (zoom-out vê o passado); análise na janela recente.
        const display = await fetchKlines(asset, timeframe, DEEP_HISTORY_BARS);
        if (cancelled) return;
        series.setData(toSeriesData(display) as never);
        const dec = priceDecimals(display[display.length - 1]?.close);
        series.applyOptions({ priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) } });
        // Abre focado nos últimos candles (momento atual); o histórico fica no zoom-out.
        const total = display.length;
        if (total > 0) {
          chart.timeScale().setVisibleLogicalRange({ from: total - Math.min(total, DEFAULT_VISIBLE_BARS), to: total + 4 });
        }
        const recent = total > ANALYSIS_BARS ? display.slice(-ANALYSIS_BARS) : display;
        setVp(computeVolumeProfile(recent));
        setCandles(recent);
        emitPrice(display[display.length - 1]?.close, true); // topo já casa com o gráfico

        cleanupWs = subscribeKline(asset, timeframe, (bar) => {
          if (chartType === "line" || chartType === "area") {
            series.update({ time: bar.time as never, value: bar.close } as never);
          } else {
            series.update(bar as never);
          }
          emitPrice(bar.close); // mantém o topo em sincronia, ao vivo
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load_error");
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
    // Paredes do book NÃO são mais price lines — viram BARRAS de liquidez (canvas,
    // efeito próprio abaixo) para não poluir o eixo e mostrar o tamanho visualmente.
  }, [gamma, layers, canUseLayers, chartType, vp]);

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
    const removeMagnets = () => {
      for (const l of magnetLinesRef.current) {
        try {
          series.removePriceLine(l);
        } catch {
          /* a série pode ter sido descartada (troca de tipo de gráfico) */
        }
      }
      magnetLinesRef.current = [];
    };

    if (!canUseLayers || !layers.liquidations || candles.length < 10) {
      clear();
      removeMagnets();
      return;
    }

    const grid = buildLiquidationGrid(candles, oiSeries ?? []);
    if (!grid) {
      clear();
      removeMagnets();
      return;
    }

    // (B) Zonas-ímã: até 3 bolsões mais fortes acima (shorts ↑) e 3 abaixo (longs ↓).
    // Opacidade da linha ∝ força da zona. CONFLUÊNCIA (◎ + linha sólida): a zona cai
    // em cima de um nível de outra camada (Call/Put Wall, Zero Gamma, Max Pain, POC
    // ou parede do book) → vários mecanismos no mesmo preço = nível de alta
    // probabilidade. Vale mesmo com a camada desligada (a confluência é real).
    removeMagnets();
    const lv = gammaLevels(gamma);
    const confLevels: { price: number; name: string }[] = [];
    const pushLv = (price: number | null | undefined, name: string) => {
      if (price != null && Number.isFinite(price)) confLevels.push({ price, name });
    };
    pushLv(lv.callWall, "Call Wall");
    pushLv(lv.putWall, "Put Wall");
    pushLv(lv.zeroGamma, "Zero Gamma");
    pushLv(lv.maxPain, "Max Pain");
    if (vp) pushLv(vp.poc, "POC");
    for (const w of [...(walls ?? [])].sort((a, b) => b.notional_usd - a.notional_usd).slice(0, 6)) {
      pushLv(w.price, "parede do book");
    }
    const confluenceOf = (price: number): string | null => {
      let best: { name: string; dist: number } | null = null;
      for (const l of confLevels) {
        const dist = Math.abs(l.price - price);
        if (dist <= price * 0.01 && (!best || dist < best.dist)) best = { name: l.name, dist };
      }
      return best?.name ?? null;
    };
    const refPrice = candles[candles.length - 1]?.close;
    if (typeof refPrice === "number") {
      for (const m of liquidationMagnets(grid, refPrice, 3, 0.25)) {
        const conf = confluenceOf(m.price);
        const base = m.side === "short" ? "16,185,129" : "239,68,68";
        const alpha = conf ? "1" : (0.4 + 0.6 * Math.min(1, m.intensity)).toFixed(2);
        const sideTitle = m.side === "short" ? "↑ shorts" : "↓ longs";
        const line = series.createPriceLine({
          price: m.price,
          color: `rgba(${base},${alpha})`,
          lineWidth: 1,
          lineStyle: conf ? LineStyle.Solid : LineStyle.Dotted,
          axisLabelVisible: true,
          title: conf ? `◎ ${sideTitle} · ${conf}` : sideTitle,
        });
        magnetLinesRef.current.push(line);
      }
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
        const idx = col * grid.nBins + bin;
        const vl = grid.longValues[idx];
        const vs = grid.shortValues[idx];
        const tot = vl + vs;
        const ratio = tot / grid.max;
        const px = (bin * grid.nCols + col) * 4;
        if (ratio < HEAT_FLOOR) {
          img.data[px + 3] = 0;
          continue;
        }
        // (C) compressão sqrt: revela as zonas médias (linear deixava 2-3 gigantes
        // ofuscando o resto). Cor = intensidade (paleta térmica única).
        const r = Math.sqrt((ratio - HEAT_FLOOR) / (1 - HEAT_FLOOR));
        const [cr, cg, cb] = heatColor(r, vs >= vl ? "short" : "long");
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
      const inRange = bin >= 0 && bin < grid.nBins;
      const idx = col * grid.nBins + bin;
      const vl = inRange ? grid.longValues[idx] : 0;
      const vs = inRange ? grid.shortValues[idx] : 0;
      const tot = vl + vs;
      const ratio = grid.max > 0 ? tot / grid.max : 0;
      if (ratio < 0.06) {
        tip.style.display = "none";
        return;
      }
      const side = vs >= vl ? "shorts ↑" : "longs ↓";
      const word = ratio >= 0.66 ? tt("forte", "strong") : ratio >= 0.33 ? tt("média", "medium") : tt("fraca", "weak");
      const px = Math.round(price).toLocaleString(isEn ? "en-US" : "pt-BR");
      tip.textContent = isEn
        ? `${side} liq. · ~$${px} · ${Math.round(ratio * 100)}% (${word})`
        : `Liq. de ${side} · ~$${px} · ${Math.round(ratio * 100)}% (${word})`;
      tip.style.display = "block";
      tip.style.left = `${param.point.x + 12}px`;
      tip.style.top = `${param.point.y + 12}px`;
    };
    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      cancelAnimationFrame(raf);
      chart.unsubscribeCrosshairMove(onCrosshair);
      if (heatTipRef.current) heatTipRef.current.style.display = "none";
      removeMagnets();
      clear();
    };
  }, [candles, oiSeries, layers.liquidations, canUseLayers, chartType, gamma, vp, walls, isEn]);

  // ─── Paredes do book — barras de liquidez na borda direita ───────────────────
  // Cada parede vira uma barra horizontal ancorada à direita; comprimento ∝ tamanho
  // (notional). Verde = compra (suporte), vermelho = venda (resistência). Alinhada
  // ao eixo de preço (priceToCoordinate) e repintada quando a escala muda.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = wallsCanvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!chart || !series || !canvas || !wrap || !ctx) return;

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    if (!canUseLayers || !layers.orderbookWalls || !walls?.length) {
      clear();
      return;
    }

    // Agrega paredes em ZONAS (mesma lógica do painel "escada de liquidez" — fonte
    // única em lib/orderbookWalls). Soma o notional de paredes coladas: a zona mais
    // "cheia" = barra maior = onde tem MAIS parede.
    const picked = aggregateWalls(walls).slice(0, 8);
    const maxNot = picked[0]?.notional || 1;
    const labelBid = isDark ? "#4ade80" : "#15803d";
    const labelAsk = isDark ? "#f87171" : "#b91c1c";

    let raf = 0;
    let lastSig = "";

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const psw = chart.priceScale("right").width();
      const ys = picked.map((w) => series.priceToCoordinate(w.price));
      const sig = `${W}x${H}|${psw}|${ys.join(",")}`;
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

      const plotRight = W - psw - 1; // borda direita da área de velas (antes do eixo)
      const MAX_BAR = Math.min(170, (W - psw) * 0.34);
      const LABEL_GAP = 16; // distância mínima entre rótulos (anti-sobreposição)
      ctx.font = "600 10px system-ui, sans-serif";
      ctx.textBaseline = "middle";

      // Paredes visíveis, ordenadas pelo Y real (preço). A barra fica no preço real;
      // o RÓTULO é espalhado p/ não colar e ligado à barra por uma linha-guia.
      const items = picked
        .map((z, i) => ({ z, y: ys[i] as number | null }))
        .filter((it): it is { z: WallZone; y: number } => it.y != null && it.y >= 4 && it.y <= H - 4)
        .sort((a, b) => a.y - b.y);
      if (!items.length) return;

      // SUPORTE (abaixo do preço) × RESISTÊNCIA (acima) pela posição relativa ao preço
      // AO VIVO — não pelo lado do snapshot (que aparecia "verde acima" quando o preço
      // caía através de uma parede de compra). Resistência abre o rótulo PRA CIMA, suporte PRA BAIXO.
      const cur = livePriceRef.current ?? candles[candles.length - 1]?.close ?? null;
      const meta = items.map((it, i) => ({ i, y: it.y, above: cur != null ? it.z.price >= cur : it.z.side === "ask" }));
      const labelYs = new Array<number>(items.length);

      // Resistência (acima): de baixo p/ cima, empurrando PRA CIMA.
      const asks = meta.filter((m) => m.above).sort((a, b) => b.y - a.y);
      let pa = Infinity;
      for (const m of asks) {
        const ly = Math.min(m.y, pa - LABEL_GAP);
        labelYs[m.i] = ly;
        pa = ly;
      }
      if (asks.length) {
        const top = Math.min(...asks.map((m) => labelYs[m.i]));
        if (top < 8) for (const m of asks) labelYs[m.i] += 8 - top;
      }

      // Suporte (abaixo): de cima p/ baixo, empurrando PRA BAIXO.
      const bids = meta.filter((m) => !m.above).sort((a, b) => a.y - b.y);
      let pb = -Infinity;
      for (const m of bids) {
        const ly = Math.max(m.y, pb + LABEL_GAP);
        labelYs[m.i] = ly;
        pb = ly;
      }
      if (bids.length) {
        const bot = Math.max(...bids.map((m) => labelYs[m.i]));
        if (bot > H - 6) for (const m of bids) labelYs[m.i] -= bot - (H - 6);
      }

      const labelX = plotRight - MAX_BAR - 12; // coluna fixa dos rótulos, à esquerda das barras

      for (let i = 0; i < items.length; i++) {
        const { z, y } = items[i];
        const ly = labelYs[i];
        // suporte = abaixo do preço ao vivo (verde) · resistência = acima (vermelho)
        const isSupport = cur != null ? z.price < cur : z.side === "bid";
        const ratio = z.notional / maxNot; // 0..1 — força relativa da zona
        const len = Math.max(12, ratio * MAX_BAR);
        const bh = 4 + Math.round(7 * Math.sqrt(ratio)); // espessura ∝ tamanho (4..11px)
        const confluent = z.venues.size >= 2; // várias exchanges no mesmo preço = parede forte
        const x0 = plotRight - len;
        const a = 0.42 + 0.5 * ratio; // mais cheia = mais opaca
        const soft = isSupport ? `rgba(34,197,94,${a.toFixed(2)})` : `rgba(239,68,68,${a.toFixed(2)})`;
        const strong = isSupport ? "rgba(34,197,94,0.98)" : "rgba(239,68,68,0.98)";

        // barra no PREÇO real (ancorada à direita); espessura comunica o tamanho
        ctx.fillStyle = soft;
        ctx.fillRect(x0, y - bh / 2, len, bh);
        ctx.fillStyle = strong;
        ctx.fillRect(plotRight - 3, y - bh / 2, 3, bh);
        // confluência (≥2 exchanges no mesmo preço): contorno claro destaca a zona forte
        if (confluent) {
          ctx.strokeStyle = isSupport ? "rgba(134,239,172,0.95)" : "rgba(252,165,165,0.95)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x0 - 0.5, y - bh / 2 - 0.5, len + 1, bh + 1);
        }

        // linha-guia: do início da barra (preço real) até o rótulo espalhado
        ctx.strokeStyle = soft;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(labelX + 5, ly);
        ctx.stroke();

        // rótulo: notional total da zona (multi-corretora é sinalizado pelo contorno)
        const txt = fmtUsd(z.notional);
        const tw = ctx.measureText(txt).width;
        const padX = 5;
        ctx.fillStyle = isDark ? "rgba(10,11,16,0.82)" : "rgba(255,255,255,0.92)";
        ctx.fillRect(labelX - tw - padX * 2, ly - 8, tw + padX * 2, 16);
        ctx.fillStyle = isSupport ? labelBid : labelAsk;
        ctx.textAlign = "right";
        ctx.fillText(txt, labelX - padX, ly);
      }
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [walls, layers.orderbookWalls, canUseLayers, chartType, isDark]);

  return (
    <div ref={wrapRef} className="relative h-[360px] w-full">
      <canvas ref={heatCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 1 }} />
      <canvas ref={wallsCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 2 }} />
      {canUseLayers && layers.orderbookWalls && walls && walls.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-2.5 rounded bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: "rgba(34,197,94,0.7)" }} /> {tt("suporte (abaixo)", "support (below)")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: "rgba(239,68,68,0.7)" }} /> {tt("resistência (acima)", "resistance (above)")}
          </span>
          <span>· {tt("barra = tamanho (notional)", "bar = size (notional)")}</span>
          <span>· {tt("contorno = +1 corretora", "outline = multi-venue")}</span>
        </div>
      )}
      {canUseLayers && layers.liquidations && (
        <>
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
            {tt("Heatmap de liquidações · estimativa (modelo de alavancagem)", "Liquidations heatmap · estimate (leverage model)")}
          </div>
          {/* Legenda: cor = LADO (longs vermelho / shorts verde), brilho = intensidade. */}
          <div className="pointer-events-none absolute bottom-8 left-2 z-10 flex items-center gap-3 rounded bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              longs ↓
              <span className="h-2 w-12 rounded" style={{ background: HEAT_GRADIENT_LONG }} />
            </span>
            <span className="flex items-center gap-1">
              shorts ↑
              <span className="h-2 w-12 rounded" style={{ background: HEAT_GRADIENT_SHORT }} />
            </span>
            <span className="opacity-70">{tt("fraco→forte", "weak→strong")}</span>
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
          {tt("Gráfico indisponível", "Chart unavailable")} ({error === "load_error" ? tt("falha ao carregar candles", "failed to load candles") : error})
        </div>
      )}
    </div>
  );
}
