import { useEffect, useRef } from "react";

import { createChart, type UTCTimestamp } from "lightweight-charts";

import type { B3Candle } from "../../lib/b3";

/** Gráfico de candles da B3 (Lightweight Charts) — preço diário, sem camadas. */
export default function B3Chart({ candles }: { candles: B3Candle[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length < 2) return;
    const dark = document.documentElement.classList.contains("dark");
    const chart = createChart(el, {
      width: el.clientWidth,
      height: 320,
      layout: { background: { color: "transparent" }, textColor: dark ? "#9aa0ae" : "#475569", fontFamily: "Inter, sans-serif" },
      grid: { vertLines: { visible: false }, horzLines: { color: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
      borderVisible: false,
    });
    series.setData(
      [...candles]
        .sort((a, b) => a.time - b.time)
        .map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    chart.timeScale().fitContent();
    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [candles]);

  return <div ref={ref} className="w-full" />;
}
