import { useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase";

interface Row {
  ts: string;
  spot_price: number | null;
  zero_gamma_level: number | null;
  call_wall: number | null;
  put_wall: number | null;
  max_pain: number | null;
}

type Key = "spot_price" | "zero_gamma_level" | "max_pain" | "call_wall" | "put_wall";

const SERIES: { key: Key; name: string; color: string; width: number; dash: boolean; core: boolean }[] = [
  { key: "spot_price", name: "Spot", color: "#f8fafc", width: 2.25, dash: false, core: true },
  { key: "zero_gamma_level", name: "Zero Gamma", color: "#a855f7", width: 1.5, dash: true, core: true },
  { key: "max_pain", name: "Max Pain", color: "#eab308", width: 1.5, dash: true, core: true },
  { key: "call_wall", name: "Call Wall", color: "#22c55e", width: 2, dash: false, core: false },
  { key: "put_wall", name: "Put Wall", color: "#ef4444", width: 2, dash: false, core: false },
];

const fmtK = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(s % 1000 < 50 ? 0 : 1)}k` : `${Math.round(s)}`);
const hhmm = (ts: string) => new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Média móvel causal (janela `win`) preservando nulos. */
function smooth(vals: (number | null)[], win: number): (number | null)[] {
  return vals.map((v, i) => {
    if (v == null) return null;
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - win + 1); j <= i; j++) {
      const x = vals[j];
      if (x != null) {
        s += x;
        c++;
      }
    }
    return c ? s / c : v;
  });
}

/** Níveis de gamma ao longo do tempo (PRD3, estilo SpotGamma key levels).
 *  SVG com zoom adaptativo no miolo (Spot/Zero Gamma/Max Pain): paredes distantes
 *  são fixadas na borda com o valor real, sem achatar o cluster relevante.
 *  Linhas suavizadas por média móvel. */
export default function GammaLevelsChart({ asset }: { asset: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);
  const [rows, setRows] = useState<Row[] | null>(null);

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
      const { data } = await supabase
        .from("gamma_profile")
        .select("ts, spot_price, zero_gamma_level, call_wall, put_wall, max_pain")
        .eq("asset", asset)
        .order("ts", { ascending: true })
        .limit(500);
      if (!cancelled) setRows((data as Row[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const content = (() => {
    if (!rows) return null;
    // Dedupe por timestamp (segundos), mantendo a última leitura.
    const byTs = new Map<number, Row>();
    for (const r of rows) byTs.set(Math.floor(new Date(r.ts).getTime() / 1000), r);
    const data = [...byTs.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    if (data.length < 2) return "empty";
    return data;
  })();

  const H = 300;
  const padT = 14;
  const padB = 24;
  const padL = 8;
  const padR = 74;

  return (
    <div>
      <div ref={wrapRef} className="relative w-full">
        {content === "empty" || content == null ? (
          <div className="grid h-[300px] place-items-center text-xs text-slate-500">
            Acumulando histórico de níveis (a cada 5 min).
          </div>
        ) : (
          (() => {
            const data = content as Row[];
            const plotW = Math.max(1, w - padL - padR);
            const plotH = H - padT - padB;

            const tMin = new Date(data[0].ts).getTime();
            const tMax = new Date(data[data.length - 1].ts).getTime();
            const xFor = (ts: string) => padL + (plotW * (new Date(ts).getTime() - tMin)) / (tMax - tMin || 1);

            // Janela de preço: foco no miolo (séries core); paredes a <10% entram, senão grudam na borda.
            const coreVals: number[] = [];
            for (const r of data)
              for (const s of SERIES) if (s.core && r[s.key] != null) coreVals.push(Number(r[s.key]));
            let lo = coreVals.length ? Math.min(...coreVals) : 0;
            let hi = coreVals.length ? Math.max(...coreVals) : 1;
            const mid = (lo + hi) / 2 || 1;
            const last = data[data.length - 1];
            for (const s of SERIES) {
              if (s.core || last[s.key] == null) continue;
              const v = Number(last[s.key]);
              if (Math.abs(v - mid) / mid <= 0.1) {
                lo = Math.min(lo, v);
                hi = Math.max(hi, v);
              }
            }
            const pad = (hi - lo) * 0.14 || mid * 0.01;
            const winMin = lo - pad;
            const winMax = hi + pad;
            const clamp = (v: number) => Math.min(winMax, Math.max(winMin, v));
            const yFor = (price: number) => padT + plotH * (1 - (price - winMin) / (winMax - winMin || 1));

            // Rótulos à direita (valor real do último ponto), escalonados p/ não colidir.
            const labels = SERIES.map((s) => {
              let v: number | null = null;
              for (let i = data.length - 1; i >= 0; i--) {
                if (data[i][s.key] != null) {
                  v = Number(data[i][s.key]);
                  break;
                }
              }
              if (v == null) return null;
              const out = v < winMin ? "down" : v > winMax ? "up" : null;
              return { ...s, value: v, y: yFor(clamp(v)), out };
            }).filter((l): l is NonNullable<typeof l> => l != null);
            labels.sort((a, b) => a.y - b.y);
            const gap = 13;
            for (let i = 1; i < labels.length; i++)
              if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
            for (let i = labels.length - 1; i > 0; i--)
              if (labels[i].y > H - padB) labels[i].y = Math.min(labels[i].y, H - padB);

            const gridYs = [winMax, mid, winMin];
            const tickIdx = [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];

            return (
              <svg width={w} height={H} role="img" aria-label="Níveis de gamma ao longo do tempo">
                {/* Grade + rótulos de preço (esquerda) */}
                {gridYs.map((p, i) => (
                  <g key={i}>
                    <line x1={padL} y1={yFor(p)} x2={w - padR} y2={yFor(p)} stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
                    <text x={padL + 2} y={yFor(p) - 2} fontSize="8.5" fill="#475569">
                      {fmtK(p)}
                    </text>
                  </g>
                ))}

                {/* Eixo do tempo */}
                {tickIdx.map((idx, i) => (
                  <text
                    key={i}
                    x={xFor(data[idx].ts)}
                    y={H - 8}
                    fontSize="9"
                    fill="#64748b"
                    textAnchor={i === 0 ? "start" : i === tickIdx.length - 1 ? "end" : "middle"}
                  >
                    {hhmm(data[idx].ts)}
                  </text>
                ))}

                {/* Linhas suavizadas */}
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
                      opacity={s.core ? 1 : 0.95}
                    />
                  );
                })}

                {/* Rótulos com valor real à direita */}
                {labels.map((l) => (
                  <g key={l.key}>
                    <line x1={w - padR} y1={l.y} x2={w - padR + 5} y2={l.y} stroke={l.color} strokeWidth="2" />
                    <text x={w - padR + 8} y={l.y + 3} fontSize="9" fontWeight="600" fill={l.color}>
                      {l.name} {l.out === "up" ? "↑" : l.out === "down" ? "↓" : ""}
                      {fmtK(l.value)}
                    </text>
                  </g>
                ))}
              </svg>
            );
          })()
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        <span className="text-slate-600">· ↑/↓ = parede fora da janela de zoom (valor real ao lado)</span>
      </div>
    </div>
  );
}
