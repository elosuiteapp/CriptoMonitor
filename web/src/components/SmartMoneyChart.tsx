import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import type { Candle } from "../lib/marketData";
import type { SmcResult } from "../lib/smc";

const UP = "#22c55e";
const DOWN = "#ef4444";
const AMBER = "#f59e0b";
const INK = "#0a0e17";

interface Props {
  candles: Candle[];
  smc: SmcResult | null;
}

/** Gráfico da aba Smart Money, estilo TradingView mas discreto: candles + zonas
 *  preenchidas (order blocks, premium/discount, liquidez) num <canvas> sobre o
 *  gráfico, sincronizado com pan/zoom. Poucos elementos, cores suaves, etiquetas
 *  sem sobreposição — para não poluir. Marcadores de BOS/CHoCH ficam na série. */
export default function SmartMoneyChart({ candles, smc }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
    };
  }, []);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    series.setData(candles as never);
    chart.timeScale().fitContent();
  }, [candles]);

  // ─── Marcadores BOS/CHoCH ────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!smc) {
      series.setMarkers([]);
      return;
    }
    const markers = smc.structures.slice(-8).map((s) => ({
      time: s.time as Time,
      position: (s.bias === "bullish" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
      color: s.bias === "bullish" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
      shape: (s.bias === "bullish" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
      text: s.type,
    }));
    series.setMarkers(markers as never);
  }, [smc]);

  // ─── Zonas preenchidas (canvas overlay) ──────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = overlayRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!chart || !series || !canvas || !wrap || !ctx || !smc) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const tscale = chart.timeScale();
    let raf = 0;
    let lastSig = "";

    const yOf = (price: number, H: number): number => {
      const y = series.priceToCoordinate(price);
      if (y != null) return y;
      return price > smc.price ? 0 : H;
    };
    const xOf = (time: number, right: number): number => {
      const x = tscale.timeToCoordinate(time as Time);
      if (x == null) return 0;
      return Math.max(0, Math.min(x, right));
    };
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      const rad = Math.min(r, h / 2, w / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      const right = tscale.width();

      const sig = `${W}x${H}|${right}|${yOf(smc.price, H).toFixed(1)}|${yOf(smc.trailingTop, H).toFixed(1)}|${yOf(smc.trailingBottom, H).toFixed(1)}`;
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

      // etiquetas da direita coletadas e depois descolididas (sem sobreposição)
      const tags: { y: number; text: string; bg: string; fg: string }[] = [];
      const queueTag = (price: number, text: string, bg: string, fg: string) => tags.push({ y: yOf(price, H), text, bg, fg });

      const softBand = (top: number, bottom: number, fill: string) => {
        const yt = yOf(top, H);
        const yb = yOf(bottom, H);
        ctx.fillStyle = fill;
        ctx.fillRect(0, Math.min(yt, yb), right, Math.abs(yb - yt));
      };
      const faintLabel = (price: number, text: string, color: string) => {
        ctx.font = "500 10px system-ui, sans-serif";
        ctx.fillStyle = color;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(text, 8, yOf(price, H));
      };
      const dashed = (price: number, color: string) => {
        const y = yOf(price, H);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // 1) Faixas premium / discount — bem suaves, ao fundo
      softBand(smc.premium.top, smc.premium.bottom, "rgba(239,68,68,0.05)");
      softBand(smc.discount.top, smc.discount.bottom, "rgba(34,197,94,0.05)");
      faintLabel(smc.premium.bottom, "Premium", "rgba(239,68,68,0.7)");
      faintLabel(smc.discount.top, "Discount", "rgba(34,197,94,0.7)");

      // 2) Extremos do range — linha pontilhada quase imperceptível
      dashed(smc.trailingTop, "rgba(148,163,184,0.3)");
      dashed(smc.trailingBottom, "rgba(148,163,184,0.3)");

      // 3) Order blocks — só os 2 mais próximos do preço, caixa arredondada suave
      [...smc.orderBlocks]
        .sort((a, b) => Math.abs(a.mid - smc.price) - Math.abs(b.mid - smc.price))
        .slice(0, 2)
        .forEach((ob) => {
          const bull = ob.bias === "bullish";
          const x1 = xOf(ob.time, right);
          const yt = yOf(ob.top, H);
          const yb = yOf(ob.bottom, H);
          const y = Math.min(yt, yb);
          const h = Math.max(Math.abs(yb - yt), 3);
          rr(x1, y, right - x1, h, 4);
          ctx.fillStyle = bull ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
          ctx.fill();
          ctx.strokeStyle = bull ? "rgba(34,197,94,0.40)" : "rgba(239,68,68,0.40)";
          ctx.lineWidth = 1;
          ctx.stroke();
          queueTag(ob.mid, `OB ${bull ? "alta" : "baixa"}`, bull ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)", bull ? INK : "#fff");
        });

      // 4) Liquidez — só a mais próxima acima e abaixo do preço (não varridas)
      const liqAbove = smc.liquidity.filter((l) => !l.swept && l.price > smc.price).sort((a, b) => a.price - b.price)[0];
      const liqBelow = smc.liquidity.filter((l) => !l.swept && l.price < smc.price).sort((a, b) => b.price - a.price)[0];
      [liqAbove, liqBelow].filter(Boolean).forEach((l) => {
        dashed(l.price, "rgba(245,158,11,0.7)");
        queueTag(l.price, l.side === "buy" ? "Liquidez" : "Liquidez", AMBER, INK);
      });

      // 5) Etiquetas à direita, descolididas verticalmente
      tags.sort((a, b) => a.y - b.y);
      const GAP = 16;
      for (let i = 1; i < tags.length; i++) {
        if (tags[i].y - tags[i - 1].y < GAP) tags[i].y = tags[i - 1].y + GAP;
      }
      ctx.font = "600 10px system-ui, sans-serif";
      for (const t of tags) {
        const padX = 5;
        const h = 15;
        const w = ctx.measureText(t.text).width + padX * 2;
        const x = right - w - 3;
        const yc = Math.max(h / 2, Math.min(t.y, H - h / 2));
        rr(x, yc - h / 2, w, h, 3);
        ctx.fillStyle = t.bg;
        ctx.fill();
        ctx.fillStyle = t.fg;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(t.text, x + padX, yc + 0.5);
      }
    };

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [smc, candles]);

  return (
    <div ref={wrapRef} className="relative h-[380px] w-full">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 1 }} />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 2 }} />
    </div>
  );
}
