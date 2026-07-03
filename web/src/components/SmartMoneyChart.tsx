import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import { getLocale } from "../hooks/useLocale";
import { useTheme } from "../hooks/useTheme";
import { chartAxisColors, chartLocalization, chartTickFormatter } from "../lib/chartTheme";
import { priceDecimals } from "../lib/format";
import { useT } from "../lib/i18n";
import { runLiquidationHeatmap } from "../lib/liquidationHeatmap";
import { HEAT_GRADIENT_LONG, HEAT_GRADIENT_SHORT, type OiPoint } from "../lib/liquidationModel";
import { DEFAULT_VISIBLE_BARS, subscribeKline, type Candle, type Timeframe, type VolumeProfile } from "../lib/marketData";
import type { SmcResult } from "../lib/smc";

const UP = "#22c55e";
const DOWN = "#ef4444";
const AMBER = "#f59e0b";
const INK = "#0a0e17";

export interface SmcLayers {
  orderBlocks: boolean;
  fvg: boolean;
  liquidity: boolean;
  zones: boolean; // premium/discount/equilibrium + topo/fundo (com strong/weak)
  equal: boolean; // EQH/EQL
  structure: boolean; // marcadores BOS/CHoCH
  swings: boolean; // labels HH/HL/LH/LL nos pivôs de swing
  prevLevels: boolean; // máx/mín do dia/semana/mês anterior (PDH/PDL/PWH/PWL/PMH/PML)
  volumeProfile: boolean; // POC / Value Area (price lines)
  liquidations: boolean; // heatmap estimado (canvas atrás das velas)
  cvd: boolean; // painel de Volume Delta / CVD abaixo do gráfico (em SmartMoneyTab)
  htf: boolean; // níveis do timeframe maior (order blocks/liquidez) como price lines
}

export const DEFAULT_LAYERS: SmcLayers = {
  orderBlocks: true,
  fvg: true,
  liquidity: true,
  zones: true,
  equal: true,
  structure: true,
  swings: true,
  prevLevels: true,
  volumeProfile: false,
  liquidations: false,
  cvd: false,
  htf: false,
};

interface Props {
  candles: Candle[]; // série EXIBIDA (histórico profundo; zoom-out vê o passado)
  analysisCandles?: Candle[]; // janela recente p/ o heatmap (cai p/ `candles` se ausente) — igual ao cockpit
  smc: SmcResult | null;
  layers?: SmcLayers;
  viewKey?: string; // muda só na troca de ativo/timeframe → re-enquadra; refresh silencioso preserva o zoom
  vp?: VolumeProfile | null; // Volume Profile (POC/VA) calculado dos candles
  oiSeries?: OiPoint[]; // OI p/ refinar o heatmap (cai p/ volume quando ausente)
  asset?: string; // p/ assinar a vela ao vivo (WebSocket Binance)
  tf?: Timeframe;
  htfLevels?: { price: number; label: string }[]; // níveis do timeframe maior
}

const kfmt = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 1 })}k`;
  if (a >= 1) return `${Math.round(v)}`;
  if (a >= 0.01) return v.toFixed(4);
  return v.toFixed(8); // moedas sub-centavo (ex.: PEPE)
};

/** Gráfico da aba Smart Money, estilo TradingView: candles + zonas preenchidas
 *  num <canvas> sincronizado com pan/zoom. Camadas controláveis por `layers`. */
export default function SmartMoneyChart({ candles, analysisCandles, smc, layers = DEFAULT_LAYERS, viewKey, vp = null, oiSeries = [], asset, tf, htfLevels = [] }: Props) {
  // Heatmap/análise na janela recente (igual ao cockpit); a série exibe o histórico profundo.
  const heatCandles = analysisCandles ?? candles;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const heatRef = useRef<HTMLCanvasElement | null>(null);
  const heatTipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vpLinesRef = useRef<IPriceLine[]>([]);
  const htfLinesRef = useRef<IPriceLine[]>([]);
  const lastViewKey = useRef<string | undefined>(undefined);
  const [expanded, setExpanded] = useState(false); // gráfico em altura ampliada
  const { isDark } = useTheme();
  const { t, isEn } = useT();

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

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;
    series.setData(candles as never);
    // Precisão do eixo conforme a magnitude (moedas sub-centavo precisam de mais casas).
    const dec = priceDecimals(candles[candles.length - 1].close);
    series.applyOptions({ priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) } });
    // Re-enquadra só quando muda ativo/timeframe (viewKey). No refresh silencioso o
    // viewKey não muda → preserva o zoom/pan do usuário. Sem o re-enquadre, o eixo de
    // preço ficaria preso na faixa do ativo anterior (ex.: ETH ~1.800 na escala do BTC).
    if (viewKey !== lastViewKey.current) {
      lastViewKey.current = viewKey;
      chart.priceScale("right").applyOptions({ autoScale: true });
      // Abre focado nos últimos candles; o histórico fica disponível no zoom-out.
      const total = candles.length;
      chart.timeScale().setVisibleLogicalRange({ from: total - Math.min(total, DEFAULT_VISIBLE_BARS), to: total + 4 });
    }
  }, [candles, viewKey]);

  // ─── Vela ao vivo (WebSocket Binance) — atualiza o candle em formação ────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !asset || !tf) return;
    const cleanup = subscribeKline(asset, tf, (bar) => {
      try {
        series.update(bar as never);
      } catch {
        /* atualização fora de ordem (troca de ativo): ignora */
      }
    });
    return cleanup;
  }, [asset, tf]);

  // ─── Marcadores BOS/CHoCH ────────────────────────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (!smc || !layers.structure) {
      series.setMarkers([]);
      return;
    }
    const markers = smc.structures.slice(-12).map((s) => ({
      time: s.time as Time,
      position: (s.bias === "bullish" ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
      color: s.bias === "bullish" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
      shape: (s.bias === "bullish" ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
      text: s.type,
    }));
    series.setMarkers(markers as never);
  }, [smc, layers.structure]);

  // ─── Volume Profile (POC / Value Area) como price lines ──────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of vpLinesRef.current) series.removePriceLine(l);
    vpLinesRef.current = [];
    if (!layers.volumeProfile || !vp) return;
    const add = (price: number | null | undefined, color: string, title: string) => {
      if (price == null || !Number.isFinite(price)) return;
      vpLinesRef.current.push(
        series.createPriceLine({ price, color, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title }),
      );
    };
    add(vp.poc, "#38bdf8", "POC");
    add(vp.vah, "rgba(56,189,248,0.5)", "VA High");
    add(vp.val, "rgba(56,189,248,0.5)", "VA Low");
  }, [vp, layers.volumeProfile]);

  // ─── Níveis do timeframe MAIOR (HTF) como price lines ────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of htfLinesRef.current) series.removePriceLine(l);
    htfLinesRef.current = [];
    if (!layers.htf) return;
    for (const lvl of htfLevels) {
      if (!Number.isFinite(lvl.price)) continue;
      htfLinesRef.current.push(
        series.createPriceLine({
          price: lvl.price,
          color: "#d946ef", // fuchsia — distinto das camadas do timeframe atual
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: lvl.label,
        }),
      );
    }
  }, [htfLevels, layers.htf]);

  // ─── Heatmap estimado de liquidações (canvas atrás das velas) ────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = heatRef.current;
    const wrap = wrapRef.current;
    if (!chart || !series || !canvas || !wrap) return;
    if (!layers.liquidations || heatCandles.length < 10) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    return runLiquidationHeatmap({ chart, series, canvas, wrap, tip: heatTipRef.current, candles: heatCandles, oiSeries });
  }, [heatCandles, oiSeries, layers.liquidations]);

  // ─── Zonas preenchidas (canvas overlay) ──────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const canvas = overlayRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!chart || !series || !canvas || !wrap || !ctx || !smc || candles.length < 2) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const tscale = chart.timeScale();
    const firstT = candles[0].time;
    const lastT = candles[candles.length - 1].time;
    const prevT = candles[candles.length - 2].time;
    let raf = 0;
    let lastSig = "";

    const yOf = (price: number, H: number): number => {
      const y = series.priceToCoordinate(price);
      if (y != null) return y;
      return price > smc.price ? 0 : H;
    };
    const xRaw = (time: number): number | null => tscale.timeToCoordinate(time as Time);
    const xOf = (time: number, right: number): number => {
      const x = xRaw(time);
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
      const xa = xRaw(lastT);
      const xb = xRaw(prevT);
      const barPx = xa != null && xb != null ? Math.max(Math.abs(xa - xb), 2) : 6;

      const sig = `${W}x${H}|${right}|${yOf(smc.price, H).toFixed(1)}|${yOf(smc.trailingTop, H).toFixed(1)}|${yOf(smc.trailingBottom, H).toFixed(1)}|${xRaw(firstT)}|${xa}|${barPx.toFixed(1)}`;
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
      const dashed = (price: number, color: string, dash: number[] = [2, 4]) => {
        const y = yOf(price, H);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      };

      // 1) Faixas premium / equilibrium / discount + topo/fundo com strong/weak (LuxAlgo)
      if (layers.zones) {
        softBand(smc.premium.top, smc.premium.bottom, "rgba(239,68,68,0.05)");
        softBand(smc.equilibrium.top, smc.equilibrium.bottom, "rgba(148,163,184,0.05)");
        softBand(smc.discount.top, smc.discount.bottom, "rgba(34,197,94,0.05)");
        faintLabel(smc.premium.bottom, "Premium", "rgba(239,68,68,0.7)");
        faintLabel(smc.equilibrium.top, "Equilibrium", "rgba(148,163,184,0.6)");
        faintLabel(smc.discount.top, "Discount", "rgba(34,197,94,0.7)");
        dashed(smc.trailingTop, "rgba(148,163,184,0.3)");
        dashed(smc.trailingBottom, "rgba(148,163,184,0.3)");
        if (smc.extremes) {
          const hiStrong = smc.extremes.high === "strong";
          const loStrong = smc.extremes.low === "strong";
          faintLabel(smc.trailingTop, hiStrong ? t.smart.strongHigh : t.smart.weakHigh, hiStrong ? "rgba(239,68,68,0.85)" : "rgba(148,163,184,0.75)");
          faintLabel(smc.trailingBottom, loStrong ? t.smart.strongLow : t.smart.weakLow, loStrong ? "rgba(34,197,94,0.85)" : "rgba(148,163,184,0.75)");
        }
      }

      // 1b) Máx/mín do período anterior — PDH/PDL (azul), PWH/PWL (índigo), PMH/PML (teal).
      // Ímãs clássicos de liquidez (referência Strong D&S: linhas D/S/M) + alvos de sweep.
      if (layers.prevLevels) {
        const P = smc.prevLevels;
        const items: [number | null, string, string][] = [
          [P.pdh, "PDH", "rgba(56,189,248,0.9)"],
          [P.pdl, "PDL", "rgba(56,189,248,0.9)"],
          [P.pwh, "PWH", "rgba(129,140,248,0.9)"],
          [P.pwl, "PWL", "rgba(129,140,248,0.9)"],
          [P.pmh, "PMH", "rgba(45,212,191,0.9)"],
          [P.pml, "PML", "rgba(45,212,191,0.9)"],
        ];
        for (const [price, label, color] of items) {
          if (price == null || !Number.isFinite(price)) continue;
          dashed(price, color.replace("0.9", "0.45"), [6, 4]);
          queueTag(price, `${label} ${kfmt(price)}`, color, INK);
        }
      }

      // 2) Imbalances / FVG
      if (layers.fvg) {
        smc.fvgs.forEach((g) => {
          const x1 = xOf(g.time, right);
          const x2 = Math.min(x1 + barPx * 5, right);
          if (x2 - x1 < 2) return;
          const yt = yOf(g.top, H);
          const yb = yOf(g.bottom, H);
          rr(x1, Math.min(yt, yb), x2 - x1, Math.max(Math.abs(yb - yt), 2), 2);
          ctx.fillStyle = "rgba(192,132,252,0.16)";
          ctx.fill();
        });
        if (smc.fvgs.length) {
          const g = smc.fvgs[smc.fvgs.length - 1];
          ctx.font = "500 9px system-ui, sans-serif";
          ctx.fillStyle = "rgba(192,132,252,0.85)";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("FVG", xOf(g.time, right) + 2, yOf(g.mid, H));
        }
      }

      // 3) Order blocks — os 3 mais próximos do preço de CADA viés (cor garantida)
      if (layers.orderBlocks) {
        const byDist = (a: { mid: number }, b: { mid: number }) => Math.abs(a.mid - smc.price) - Math.abs(b.mid - smc.price);
        const bears = smc.orderBlocks.filter((o) => o.bias === "bearish").sort(byDist).slice(0, 3);
        const bulls = smc.orderBlocks.filter((o) => o.bias === "bullish").sort(byDist).slice(0, 3);
        [...bears, ...bulls].forEach((ob) => {
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
          queueTag(ob.mid, `OB ${bull ? t.smart.obUp : t.smart.obDown} ${kfmt(ob.mid)}`, bull ? "rgba(34,197,94,0.92)" : "rgba(239,68,68,0.92)", bull ? INK : "#fff");
        });
      }

      // 4) EQH / EQL
      if (layers.equal) {
        smc.equals.forEach((eq) => {
          const x1 = xOf(eq.time, right);
          const x2 = Math.min(x1 + barPx * 6, right);
          const y = yOf(eq.price, H);
          ctx.strokeStyle = eq.kind === "EQH" ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)";
          ctx.lineWidth = 1;
          ctx.setLineDash([1, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "500 9px system-ui, sans-serif";
          ctx.fillStyle = eq.kind === "EQH" ? "rgba(239,68,68,0.8)" : "rgba(34,197,94,0.8)";
          ctx.textBaseline = eq.kind === "EQH" ? "bottom" : "top";
          ctx.textAlign = "left";
          ctx.fillText(eq.kind, x1, eq.kind === "EQH" ? y - 2 : y + 2);
        });
      }

      // 5) Liquidez — até 2 acima e 2 abaixo (não varridas) + VARRIDAS RECENTES marcadas
      //    (stop hunt: o nível foi tomado — possível reversão; antes o sweep era invisível).
      if (layers.liquidity) {
        const above = smc.liquidity.filter((l) => !l.swept && l.price > smc.price).sort((a, b) => a.price - b.price).slice(0, 2);
        const below = smc.liquidity.filter((l) => !l.swept && l.price < smc.price).sort((a, b) => b.price - a.price).slice(0, 2);
        [...above, ...below].forEach((l) => {
          dashed(l.price, "rgba(245,158,11,0.7)");
          queueTag(l.price, `Liq ${kfmt(l.price)}`, AMBER, INK);
        });
        smc.liquidity.filter((l) => l.sweptRecently).slice(0, 2).forEach((l) => {
          dashed(l.price, "rgba(244,63,94,0.5)", [2, 3]);
          queueTag(l.price, `✕ ${t.smart.sweptTag} ${kfmt(l.price)}`, "rgba(244,63,94,0.92)", "#fff");
        });
      }

      // 5b) Labels HH/HL/LH/LL nos pivôs de swing (estrutura legível à la LuxAlgo)
      if (layers.swings) {
        ctx.font = "600 9px system-ui, sans-serif";
        ctx.textAlign = "center";
        smc.swings.slice(-8).forEach((sp) => {
          const x = xRaw(sp.time);
          if (x == null || x < 0 || x > right) return;
          const y = yOf(sp.price, H);
          const bull = sp.kind === "HH" || sp.kind === "HL";
          ctx.fillStyle = bull ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)";
          ctx.textBaseline = sp.isHigh ? "bottom" : "top";
          ctx.fillText(sp.kind, x, sp.isHigh ? y - 4 : y + 4);
        });
      }

      // 6) Etiquetas à direita, descolididas
      tags.sort((a, b) => a.y - b.y);
      const GAP = 15;
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
  }, [smc, candles, layers, t]);

  return (
    <div ref={wrapRef} className={`relative w-full ${expanded ? "h-[78vh]" : "h-[380px]"}`}>
      {/* Expandir / recolher o gráfico (mais espaço p/ as camadas SMC) */}
      <button
        onClick={() => setExpanded((e) => !e)}
        title={expanded ? (isEn ? "Collapse chart" : "Recolher gráfico") : (isEn ? "Expand chart" : "Expandir gráfico")}
        aria-label={expanded ? (isEn ? "Collapse chart" : "Recolher gráfico") : (isEn ? "Expand chart" : "Expandir gráfico")}
        className="absolute right-2 top-2 z-20 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground"
      >
        {expanded ? "⤡" : "⤢"}
      </button>
      <canvas ref={heatRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 0 }} />
      <div ref={containerRef} className="absolute inset-0 h-full w-full" style={{ zIndex: 1 }} />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 2 }} />
      {layers.liquidations && (
        <>
          <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
            {t.smart.heatmapTitle}
          </div>
          {/* Legenda: cor = LADO (longs vermelho / shorts verde), brilho = intensidade. (Igual ao cockpit.) */}
          <div className="pointer-events-none absolute bottom-8 left-2 z-10 flex items-center gap-3 rounded bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {t.smart.heatLongs}
              <span className="h-2 w-12 rounded" style={{ background: HEAT_GRADIENT_LONG }} />
            </span>
            <span className="flex items-center gap-1">
              {t.smart.heatShorts}
              <span className="h-2 w-12 rounded" style={{ background: HEAT_GRADIENT_SHORT }} />
            </span>
            <span className="opacity-70">
              {t.smart.heatWeak}→{t.smart.heatStrong}
            </span>
          </div>
          <div
            ref={heatTipRef}
            className="pointer-events-none absolute z-20 rounded bg-background/95 px-2 py-1 text-[10px] text-foreground shadow-lg ring-1 ring-border"
            style={{ display: "none" }}
          />
        </>
      )}
    </div>
  );
}
