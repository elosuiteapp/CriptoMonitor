import { useEffect, useRef, useState } from "react";

import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";

interface Row {
  ts: string;
  spot_price: number | null;
  zero_gamma_level: number | null;
  call_wall: number | null;
  put_wall: number | null;
  max_pain: number | null;
  net_gex_spot: number | null;
  regime: string | null;
}

type Key = "spot_price" | "zero_gamma_level" | "max_pain" | "call_wall" | "put_wall";
interface Serie {
  key: Key;
  name: string;
  color: string;
  width: number;
  dash: boolean;
  core: boolean; // core = define o zoom (miolo); paredes (core:false) grudam na borda
}

// Uma unica linha de Spot. O zoom segue o miolo (Spot/Zero Gamma/Max Pain) para nunca
// achatar; Call/Put Wall, quando ficam fora da janela, grudam na borda com rotulo + seta.
const SERIES: Serie[] = [
  { key: "spot_price", name: "Spot", color: "#f8fafc", width: 2.4, dash: false, core: true },
  { key: "zero_gamma_level", name: "Zero Gamma", color: "#a855f7", width: 1.6, dash: true, core: true },
  { key: "max_pain", name: "Max Pain", color: "#eab308", width: 1.6, dash: true, core: true },
  { key: "call_wall", name: "Call Wall", color: "#22c55e", width: 1.6, dash: false, core: false },
  { key: "put_wall", name: "Put Wall", color: "#ef4444", width: 1.6, dash: false, core: false },
];

const fmtK = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(s % 1000 < 50 ? 0 : 1)}k` : `${Math.round(s)}`);
const fmtAxis = (ts: string, spanMs: number) => {
  const d = new Date(ts);
  const loc = getLocale() === "en" ? "en-US" : "pt-BR";
  return spanMs > 2 * 864e5
    ? d.toLocaleDateString(loc, { day: "2-digit", month: "2-digit" })
    : d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
};

/** Média móvel causal (janela `win`) preservando nulos. */
function smooth(vals: (number | null)[], win: number): (number | null)[] {
  return vals.map((v, i) => {
    if (v == null) return null;
    let sum = 0;
    let c = 0;
    for (let j = Math.max(0, i - win + 1); j <= i; j++) {
      const x = vals[j];
      if (x != null) {
        sum += x;
        c++;
      }
    }
    return c ? sum / c : v;
  });
}

/** Níveis de gamma ao longo do tempo (estilo SpotGamma key levels): UM painel, uma
 *  linha de Spot. Zoom adaptativo no miolo; paredes distantes viram marcas na borda. */
export default function GammaLevelsChart({ asset }: { asset: string }) {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("gamma_levels_history", { p_asset: asset, p_days: days });
      if (!cancelled) setRows((data as Row[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset, days]);

  const data = (() => {
    if (!rows) return null;
    const byTs = new Map<number, Row>();
    for (const r of rows) byTs.set(Math.floor(new Date(r.ts).getTime() / 1000), r);
    return [...byTs.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  })();

  const H = 300;
  const padT = 16;
  const padB = 24;
  const padL = 40;
  const padR = 96;

  // Histórico parcial: a coleta é recente, então a janela escolhida ainda pode não estar cheia.
  const histDays =
    data && data.length >= 2
      ? (new Date(data[data.length - 1].ts).getTime() - new Date(data[0].ts).getTime()) / 86_400_000
      : 0;
  const partial = histDays > 0 && histDays < days * 0.9;
  const partialLabel = histDays >= 1 ? `${Math.round(histDays)}d` : `${Math.max(1, Math.round(histDays * 24))}h`;

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        {partial ? (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400/80">
            {t.gammaChart.partialHist.replace("{label}", partialLabel).replace("{days}", String(days))}
          </span>
        ) : (
          <span />
        )}
        <div className="flex gap-1 rounded-md bg-muted p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                days === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data == null || data.length < 2 ? (
        <div className="grid h-[300px] place-items-center text-xs text-muted-foreground">
          {t.gammaChart.accumulating.replace("{days}", String(days))}
        </div>
      ) : (
        (() => {
          const plotW = Math.max(1, w - padL - padR);
          const plotH = H - padT - padB;
          const tMin = new Date(data[0].ts).getTime();
          const tMax = new Date(data[data.length - 1].ts).getTime();
          const spanMs = tMax - tMin;
          const xFor = (ts: string) => padL + (plotW * (new Date(ts).getTime() - tMin)) / (tMax - tMin || 1);

          // Janela de preço = miolo (Spot/Zero Gamma/Max Pain) + folga → nunca achata.
          const coreVals: number[] = [];
          for (const r of data)
            for (const s of SERIES) if (s.core && r[s.key] != null) coreVals.push(Number(r[s.key]));
          const lo = coreVals.length ? Math.min(...coreVals) : 0;
          const hi = coreVals.length ? Math.max(...coreVals) : 1;
          const pad = (hi - lo) * 0.28 || hi * 0.006;
          const yMin = lo - pad;
          const yMax = hi + pad;
          const clamp = (v: number) => Math.min(yMax, Math.max(yMin, v));
          const yFor = (price: number) => padT + plotH * (1 - (price - yMin) / (yMax - yMin || 1));

          // Grade de preço (5 níveis) e ticks de tempo
          const gridYs = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
          const nT = Math.min(5, data.length);
          const tickIdx = Array.from({ length: nT }, (_, i) => Math.round((i * (data.length - 1)) / (nT - 1 || 1)));

          // Rótulos à direita (valor real + seta se grudado na borda), escalonados
          const labels = SERIES.map((s) => {
            let v: number | null = null;
            for (let i = data.length - 1; i >= 0; i--)
              if (data[i][s.key] != null) {
                v = Number(data[i][s.key]);
                break;
              }
            if (v == null) return null;
            const out = v < yMin ? "down" : v > yMax ? "up" : null;
            return { ...s, value: v, y: yFor(clamp(v)), out };
          }).filter((l): l is NonNullable<typeof l> => l != null);
          labels.sort((a, b) => a.y - b.y);
          const gap = 13;
          for (let i = 1; i < labels.length; i++)
            if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;

          // Bandas de regime ao fundo: agrupa pontos consecutivos de mesmo regime usando as
          // bordas das células (meio-do-caminho entre pontos), sem buracos. Verde = gama
          // positivo (dealers amortecem, calmo); vermelho = negativo (amplificam, volátil).
          const xAt = data.map((r) => xFor(r.ts));
          const cellL = (i: number) => (i === 0 ? padL : (xAt[i - 1] + xAt[i]) / 2);
          const cellR = (i: number) => (i === data.length - 1 ? w - padR : (xAt[i] + xAt[i + 1]) / 2);
          const bands: { x0: number; x1: number; regime: string }[] = [];
          data.forEach((r, i) => {
            const reg = r.regime ?? "";
            const last = bands[bands.length - 1];
            if (last && last.regime === reg) last.x1 = cellR(i);
            else bands.push({ x0: cellL(i), x1: cellR(i), regime: reg });
          });
          const bandFill = (reg: string) =>
            reg === "positive" ? "rgba(34,197,94,0.07)" : reg === "negative" ? "rgba(239,68,68,0.08)" : "transparent";

          return (
            <svg width={w} height={H} role="img" aria-label="Níveis de gamma ao longo do tempo">
              {bands.map((b, i) => (
                <g key={`band-${i}`}>
                  <rect x={b.x0} y={padT} width={Math.max(0, b.x1 - b.x0)} height={plotH} fill={bandFill(b.regime)} />
                  {i > 0 && (
                    <line x1={b.x0} y1={padT} x2={b.x0} y2={padT + plotH} stroke="rgba(148,163,184,0.18)" strokeWidth="1" strokeDasharray="2 3" />
                  )}
                </g>
              ))}

              {gridYs.map((p, i) => (
                <g key={i}>
                  <line x1={padL} y1={yFor(p)} x2={w - padR} y2={yFor(p)} stroke="rgba(148,163,184,0.1)" strokeWidth="1" />
                  <text x={padL - 5} y={yFor(p) + 3} fontSize="9" fill="#64748b" textAnchor="end">
                    {fmtK(p)}
                  </text>
                </g>
              ))}

              {tickIdx.map((idx, i) => (
                <text
                  key={i}
                  x={xFor(data[idx].ts)}
                  y={H - 7}
                  fontSize="9"
                  fill="#64748b"
                  textAnchor={i === 0 ? "start" : i === tickIdx.length - 1 ? "end" : "middle"}
                >
                  {fmtAxis(data[idx].ts, spanMs)}
                </text>
              ))}

              {SERIES.map((s) => {
                const raw = data.map((r) => (r[s.key] != null ? Number(r[s.key]) : null));
                const sm = smooth(raw, 5);
                const pts: string[] = [];
                data.forEach((r, i) => {
                  const v = sm[i];
                  if (v != null) pts.push(`${xFor(r.ts).toFixed(1)},${yFor(clamp(v)).toFixed(1)}`);
                });
                if (pts.length < 2) return null;
                return (
                  <path
                    key={s.key}
                    d={`M ${pts.join(" L ")}`}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeDasharray={s.dash ? "5 3" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={s.core ? 1 : 0.85}
                  />
                );
              })}

              {labels.map((l) => (
                <g key={l.key}>
                  <line x1={w - padR} y1={l.y} x2={w - padR + 5} y2={l.y} stroke={l.color} strokeWidth="2" />
                  <text x={w - padR + 8} y={l.y + 3} fontSize="9" fontWeight="600" fill={l.color}>
                    {l.name} {fmtK(l.value)}
                    {l.out === "up" ? " ↑" : l.out === "down" ? " ↓" : ""}
                  </text>
                </g>
              ))}
            </svg>
          );
        })()
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3 rounded" style={{ background: "rgba(34,197,94,0.25)" }} />
          {t.gammaChart.regimePos}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-3 rounded" style={{ background: "rgba(239,68,68,0.3)" }} />
          {t.gammaChart.regimeNeg}
        </span>
        <span className="text-muted-foreground">{t.gammaChart.legendNote}</span>
      </div>
    </div>
  );
}
