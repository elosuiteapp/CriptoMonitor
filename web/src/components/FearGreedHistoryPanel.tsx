import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import { fetchKlines } from "../lib/marketData";
import InfoTip from "./InfoTip";

// Medo & Ganância (Alternative.me) — série histórica + overlay do preço do BTC.
// O índice sozinho é só um número; junto do preço mostra que extremos de medo
// costumam marcar fundos e de ganância, topos. Dado grátis (CORS aberto).
interface FngPoint {
  ts: number;
  value: number;
}

// Faixa de sentimento → cor e rótulo (mesma escala da Alternative.me).
function fngTone(v: number) {
  if (v >= 75) return { hex: "#10b981", area: "fill-emerald-500/10", text: "text-emerald-500", pt: "Ganância extrema", en: "Extreme greed" };
  if (v >= 55) return { hex: "#84cc16", area: "fill-lime-500/10", text: "text-lime-500", pt: "Ganância", en: "Greed" };
  if (v >= 45) return { hex: "#94a3b8", area: "fill-slate-400/10", text: "text-slate-400", pt: "Neutro", en: "Neutral" };
  if (v >= 25) return { hex: "#f97316", area: "fill-orange-500/10", text: "text-orange-500", pt: "Medo", en: "Fear" };
  return { hex: "#f43f5e", area: "fill-rose-500/10", text: "text-rose-500", pt: "Medo extremo", en: "Extreme fear" };
}

// Bandas de fundo (medo → ganância), em valor 0..100.
const ZONES: [number, number, string][] = [
  [0, 25, "fill-rose-500/[0.07]"],
  [25, 45, "fill-orange-500/[0.06]"],
  [45, 55, "fill-slate-500/[0.05]"],
  [55, 75, "fill-lime-500/[0.06]"],
  [75, 100, "fill-emerald-500/[0.07]"],
];

export default function FearGreedHistoryPanel() {
  const { isEn } = useT();
  const tl = (pt: string, en: string) => (isEn ? en : pt);
  const [fng, setFng] = useState<FngPoint[]>([]);
  const [priceByDate, setPriceByDate] = useState<Record<string, number>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [r, candles] = await Promise.all([
          fetch("https://api.alternative.me/fng/?limit=90&format=json").then((x) => x.json()),
          fetchKlines("BTC", "1d", 100).catch(() => []),
        ]);
        if (!active) return;
        const arr: FngPoint[] = (((r?.data ?? []) as { value: string; timestamp: string }[]) ?? [])
          .map((d) => ({ ts: Number(d.timestamp), value: Number(d.value) }))
          .filter((d) => Number.isFinite(d.ts) && Number.isFinite(d.value))
          .sort((a, b) => a.ts - b.ts);
        const map: Record<string, number> = {};
        for (const c of candles) map[new Date(c.time * 1000).toISOString().slice(0, 10)] = c.close;
        setFng(arr);
        setPriceByDate(map);
        setState(arr.length ? "ready" : "error");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state === "error") return null; // some silenciosamente se a fonte falhar
  if (state === "loading") return <div className="h-44 animate-pulse rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60" />;

  const n = fng.length;
  const W = 300;
  const H = 96;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const fy = (v: number) => H - (v / 100) * H;

  // Preço alinhado às datas do índice (carrega o último conhecido p/ preencher buracos).
  const dateOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
  const priceAligned: (number | null)[] = [];
  let lastP: number | null = null;
  for (const p of fng) {
    const v = priceByDate[dateOf(p.ts)];
    if (v != null) lastP = v;
    priceAligned.push(lastP);
  }
  const prices = priceAligned.filter((v): v is number => v != null);
  const pMin = prices.length ? Math.min(...prices) : 0;
  const pMax = prices.length ? Math.max(...prices) : 1;
  const pad = H * 0.08;
  const py = (p: number) => (pMax > pMin ? H - pad - ((p - pMin) / (pMax - pMin)) * (H - 2 * pad) : H / 2);

  const fngLine = fng.map((p, i) => `${x(i)},${fy(p.value)}`).join(" ");
  const fngArea = `M ${x(0)},${H} L ${fngLine.split(" ").join(" L ")} L ${x(n - 1)},${H} Z`;
  const priceLine = priceAligned.map((p, i) => (p == null ? null : `${x(i)},${py(p)}`)).filter(Boolean).join(" ");

  const cur = fng[n - 1].value;
  const tone = fngTone(cur);
  const ago = (days: number) => (n > days ? cur - fng[n - 1 - days].value : null);
  const d7 = ago(7);
  const d30 = ago(30);
  const markerTop = (1 - cur / 100) * 100;

  // Hover: mapeia a posição do cursor para o índice mais próximo da série.
  const onMove = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };
  const hi = hover != null ? Math.max(0, Math.min(n - 1, hover)) : null;
  const hPt = hi != null ? fng[hi] : null;
  const hPrice = hi != null ? priceAligned[hi] : null;
  const hTone = hPt ? fngTone(hPt.value) : null;
  const hLeft = hi != null && n > 1 ? (hi / (n - 1)) * 100 : 50;
  const hFngTop = hPt ? (1 - hPt.value / 100) * 100 : 0;
  const hPriceTop = hPrice != null ? (py(hPrice) / H) * 100 : null;

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {tl("Medo & Ganância · histórico", "Fear & Greed · history")}
          <InfoTip text={tl("Índice de sentimento do mercado cripto (0 = medo extremo, 100 = ganância extrema), com o preço do BTC sobreposto. Extremos de medo costumam marcar fundos; de ganância, topos.", "Crypto market sentiment index (0 = extreme fear, 100 = extreme greed), with BTC price overlaid. Fear extremes often mark bottoms; greed extremes, tops.")} />
        </h3>
        <div className="flex items-baseline gap-2">
          <span className={`num text-2xl font-bold ${tone.text}`}>{cur}</span>
          <span className={`rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone.text}`}>{tl(tone.pt, tone.en)}</span>
        </div>
      </div>

      <div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">
        {d7 != null && <span>7d <span className={`num ${d7 >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{d7 >= 0 ? "+" : ""}{d7}</span></span>}
        {d30 != null && <span>30d <span className={`num ${d30 >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{d30 >= 0 ? "+" : ""}{d30}</span></span>}
      </div>

      <div
        ref={wrapRef}
        className="relative mt-2 cursor-crosshair"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
          {ZONES.map(([a, b, cls], i) => (
            <rect key={i} x="0" y={fy(b)} width={W} height={fy(a) - fy(b)} className={cls} />
          ))}
          {/* linha do 50 (equilíbrio) */}
          <line x1="0" y1={fy(50)} x2={W} y2={fy(50)} stroke="rgba(148,163,184,0.25)" strokeWidth="0.4" strokeDasharray="2 2" />
          <path d={fngArea} className={tone.area} stroke="none" />
          <polyline points={fngLine} fill="none" stroke={tone.hex} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {priceLine && <polyline points={priceLine} fill="none" stroke="#38bdf8" strokeOpacity="0.8" strokeWidth="1.2" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </svg>
        {/* marcador do valor atual (HTML p/ não distorcer com o preserveAspectRatio) */}
        <span className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ${tone.text}`} style={{ left: "100%", top: `${markerTop}%`, backgroundColor: "currentColor" }} />

        {/* Hover: linha de cruz + pontos + tooltip (data, índice + classificação, preço BTC) */}
        {hi != null && hPt && hTone && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${hLeft}%` }} />
            <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background" style={{ left: `${hLeft}%`, top: `${hFngTop}%`, backgroundColor: hTone.hex }} />
            {hPriceTop != null && <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 ring-2 ring-background" style={{ left: `${hLeft}%`, top: `${hPriceTop}%` }} />}
            <div
              className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover px-2 py-1 shadow-card dark:bg-card"
              style={{ left: `${hLeft}%`, transform: `translateX(${hLeft < 18 ? "0%" : hLeft > 82 ? "-100%" : "-50%"})` }}
            >
              <div className="text-[10px] text-muted-foreground">{new Date(hPt.ts * 1000).toLocaleDateString(isEn ? "en-US" : "pt-BR", { day: "2-digit", month: "short" })}</div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`num font-semibold ${hTone.text}`}>{hPt.value}</span>
                <span className="text-muted-foreground">{tl(hTone.pt, hTone.en)}</span>
              </div>
              {hPrice != null && <div className="num text-[11px] text-foreground">BTC {hPrice.toLocaleString(isEn ? "en-US" : "pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</div>}
            </div>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className={`inline-block h-2 w-3 rounded-sm ${tone.text}`} style={{ backgroundColor: "currentColor" }} />{tl("Medo & Ganância", "Fear & Greed")}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-3 border-t-2 border-dashed border-sky-400/80" />{tl("preço BTC", "BTC price")}</span>
        </span>
        <span>{tl("90 dias · fonte: Alternative.me", "90 days · source: Alternative.me")}</span>
      </div>
    </div>
  );
}
