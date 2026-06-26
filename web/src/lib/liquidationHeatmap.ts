import { LineStyle } from "lightweight-charts";
import type { IChartApi, IPriceLine, ISeriesApi, Logical, MouseEventParams, Time } from "lightweight-charts";

import { buildLiquidationGrid, heatColor, liquidationMagnets, type OiPoint } from "./liquidationModel";
import type { Candle } from "./marketData";

interface Params {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick" | "Bar" | "Line" | "Area">;
  canvas: HTMLCanvasElement;
  wrap: HTMLElement;
  tip: HTMLElement | null;
  candles: Candle[];
  oiSeries: OiPoint[];
}

/**
 * Desenha o heatmap ESTIMADO de liquidações numa <canvas> ATRÁS das velas
 * (fundo do chart transparente → o heat aparece e as velas ficam por cima).
 * Mesma lógica/qualidade do cockpit (modelo de alavancagem; cai para volume
 * quando não há OI). Retorna o cleanup (cancela o raf, remove o crosshair e
 * limpa o canvas). Usado pelo Smart Money para qualquer das 100 moedas.
 */
export function runLiquidationHeatmap(p: Params): () => void {
  const { chart, series, canvas, wrap, tip, candles, oiSeries } = p;
  const ctx = canvas.getContext("2d");
  const clear = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  if (!ctx || candles.length < 10) {
    clear();
    return clear;
  }

  const grid = buildLiquidationGrid(candles, oiSeries);
  if (!grid) {
    clear();
    return clear;
  }

  // (B) Zonas-ímã: até 3 bolsões mais fortes acima (shorts ↑) e 3 abaixo (longs ↓)
  // do preço atual; opacidade da linha ∝ força da zona. Consistente com o cockpit.
  const magnetLines: IPriceLine[] = [];
  const refPrice = candles[candles.length - 1]?.close;
  if (typeof refPrice === "number") {
    for (const m of liquidationMagnets(grid, refPrice, 3, 0.25)) {
      const base = m.side === "short" ? "16,185,129" : "239,68,68";
      const alpha = (0.4 + 0.6 * Math.min(1, m.intensity)).toFixed(2);
      magnetLines.push(
        series.createPriceLine({
          price: m.price,
          color: `rgba(${base},${alpha})`,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: m.side === "short" ? "↑ shorts" : "↓ longs",
        }),
      );
    }
  }

  // Offscreen (nCols×nBins) com a paleta já aplicada → drawImage suaviza.
  const off = document.createElement("canvas");
  off.width = grid.nCols;
  off.height = grid.nBins;
  const octx = off.getContext("2d");
  if (!octx) {
    clear();
    return clear;
  }
  // Piso de intensidade: zonas fracas ficam transparentes (só as "magnet zones").
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
      // (C) sqrt revela zonas médias; cor = LADO dominante, brilho = intensidade.
      const r = Math.sqrt((ratio - HEAT_FLOOR) / (1 - HEAT_FLOOR));
      const [cr, cg, cb] = heatColor(r, vs >= vl ? "short" : "long");
      img.data[px] = cr;
      img.data[px + 1] = cg;
      img.data[px + 2] = cb;
      img.data[px + 3] = Math.round(120 + 135 * r);
    }
  }
  octx.putImageData(img, 0, 0);

  const tscale = chart.timeScale();
  let lastSig = "";
  let raf = 0;
  // Geometria da grade no último frame (px), pro tooltip achar a coluna sob o cursor.
  let gridX0 = 0;
  let gridCellW = 0;

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    // A grade cobre os ÚLTIMOS grid.nCols candles, mas a série pode ter histórico bem
    // mais profundo (logical 0 = candle mais ANTIGO). Ancoramos a última coluna no
    // TEMPO do último candle da grade e medimos a largura de coluna pelo espaçamento de
    // barras — imune ao offset série×grade e ao avanço dos candles ao vivo.
    const c0 = tscale.logicalToCoordinate(0 as Logical);
    const c1 = tscale.logicalToCoordinate(1 as Logical);
    const lastTime = candles[candles.length - 1]?.time;
    const xN = lastTime != null ? tscale.timeToCoordinate(lastTime as Time) : null;
    const yHi = series.priceToCoordinate(grid.refHigh);
    const yLo = series.priceToCoordinate(grid.refLow);
    if (c0 == null || c1 == null || xN == null || yHi == null || yLo == null) return;
    const cellW = c1 - c0; // px por coluna (espaçamento de barras), imune ao offset
    const x0 = xN - (grid.nCols - 1) * cellW; // 1ª coluna da grade, a partir da última
    gridX0 = x0;
    gridCellW = cellW;
    const slope = (yLo - yHi) / (grid.refLow - grid.refHigh);
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
    if (!tip) return;
    const price = param.point ? series.coordinateToPrice(param.point.y) : null;
    if (!param.point || param.logical == null || price == null) {
      tip.style.display = "none";
      return;
    }
    const bin = Math.floor(((grid.priceTop - price) / span) * grid.nBins);
    // Coluna pela posição do cursor relativa à grade desenhada (não por param.logical,
    // que indexa a série inteira e não a janela recente da grade).
    const rawCol = gridCellW > 0 ? Math.round((param.point.x - gridX0) / gridCellW) : grid.nCols - 1;
    const col = Math.max(0, Math.min(grid.nCols - 1, rawCol));
    const inRange = bin >= 0 && bin < grid.nBins && rawCol >= 0 && rawCol < grid.nCols;
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
    const word = ratio >= 0.66 ? "forte" : ratio >= 0.33 ? "média" : "fraca";
    tip.textContent = `Liq. de ${side} · ~$${Math.round(price).toLocaleString("pt-BR")} · ${Math.round(ratio * 100)}% (${word})`;
    tip.style.display = "block";
    tip.style.left = `${param.point.x + 12}px`;
    tip.style.top = `${param.point.y + 12}px`;
  };
  chart.subscribeCrosshairMove(onCrosshair);

  return () => {
    cancelAnimationFrame(raf);
    chart.unsubscribeCrosshairMove(onCrosshair);
    if (tip) tip.style.display = "none";
    for (const l of magnetLines) {
      try {
        series.removePriceLine(l);
      } catch {
        /* a série pode ter sido descartada */
      }
    }
    clear();
  };
}
