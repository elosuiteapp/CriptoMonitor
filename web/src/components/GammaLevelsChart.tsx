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
interface Serie {
  key: Key;
  name: string;
  color: string;
  width: number;
  dash: boolean;
}

const S: Record<string, Serie> = {
  spot: { key: "spot_price", name: "Spot", color: "#f8fafc", width: 2.25, dash: false },
  zero: { key: "zero_gamma_level", name: "Zero Gamma", color: "#a855f7", width: 1.6, dash: true },
  pain: { key: "max_pain", name: "Max Pain", color: "#eab308", width: 1.6, dash: true },
  call: { key: "call_wall", name: "Call Wall", color: "#22c55e", width: 1.9, dash: false },
  put: { key: "put_wall", name: "Put Wall", color: "#ef4444", width: 1.9, dash: false },
};

const fmtK = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(s % 1000 < 50 ? 0 : 1)}k` : `${Math.round(s)}`);
// Eixo de tempo adaptativo: data (DD/MM) em janelas longas, hora (HH:MM) em curtas.
const fmtAxis = (ts: string, spanMs: number) => {
  const d = new Date(ts);
  return spanMs > 2 * 864e5
    ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

/** Um painel: linhas suaves (média móvel) auto-escaladas ao próprio grupo. */
function LevelPanel({
  data,
  series,
  w,
  height,
  title,
  showTime,
}: {
  data: Row[];
  series: Serie[];
  w: number;
  height: number;
  title: string;
  showTime: boolean;
}) {
  const padT = 14;
  const padB = showTime ? 22 : 8;
  const padL = 8;
  const padR = 86;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = height - padT - padB;

  const tMin = new Date(data[0].ts).getTime();
  const tMax = new Date(data[data.length - 1].ts).getTime();
  const xFor = (ts: string) => padL + (plotW * (new Date(ts).getTime() - tMin)) / (tMax - tMin || 1);

  const vals: number[] = [];
  for (const r of data) for (const s of series) if (r[s.key] != null) vals.push(Number(r[s.key]));
  if (vals.length < 2) {
    return <div className="grid h-[120px] place-items-center text-[11px] text-slate-600">Sem dados.</div>;
  }
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.1 || hi * 0.005;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const yFor = (price: number) => padT + plotH * (1 - (price - yMin) / (yMax - yMin || 1));

  // Rótulos à direita (último valor real), escalonados p/ não colidir.
  const labels = series
    .map((s) => {
      let v: number | null = null;
      for (let i = data.length - 1; i >= 0; i--)
        if (data[i][s.key] != null) {
          v = Number(data[i][s.key]);
          break;
        }
      return v == null ? null : { ...s, value: v, y: yFor(v) };
    })
    .filter((l): l is NonNullable<typeof l> => l != null)
    .sort((a, b) => a.y - b.y);
  const gap = 12;
  for (let i = 1; i < labels.length; i++)
    if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;

  const gridYs = [yMax - pad / 2, (yMin + yMax) / 2, yMin + pad / 2];
  const spanMs = tMax - tMin;
  const nTicks = Math.min(5, data.length);
  const tickIdx = Array.from({ length: nTicks }, (_, i) => Math.round((i * (data.length - 1)) / (nTicks - 1 || 1)));

  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">{title}</div>
      <svg width={w} height={height} role="img" aria-label={title}>
        {gridYs.map((p, i) => (
          <g key={i}>
            <line x1={padL} y1={yFor(p)} x2={w - padR} y2={yFor(p)} stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            <text x={padL + 2} y={yFor(p) - 2} fontSize="8.5" fill="#475569">
              {fmtK(p)}
            </text>
          </g>
        ))}

        {showTime &&
          tickIdx.map((idx, i) => (
            <text
              key={i}
              x={xFor(data[idx].ts)}
              y={height - 7}
              fontSize="9"
              fill="#64748b"
              textAnchor={i === 0 ? "start" : i === tickIdx.length - 1 ? "end" : "middle"}
            >
              {fmtAxis(data[idx].ts, spanMs)}
            </text>
          ))}

        {series.map((s) => {
          const raw = data.map((r) => (r[s.key] != null ? Number(r[s.key]) : null));
          const sm = smooth(raw, 5);
          const pts: string[] = [];
          data.forEach((r, i) => {
            const v = sm[i];
            if (v != null) pts.push(`${xFor(r.ts).toFixed(1)},${yFor(v).toFixed(1)}`);
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
            />
          );
        })}

        {labels.map((l) => (
          <g key={l.key}>
            <line x1={w - padR} y1={l.y} x2={w - padR + 5} y2={l.y} stroke={l.color} strokeWidth="2" />
            <text x={w - padR + 8} y={l.y + 3} fontSize="9" fontWeight="600" fill={l.color}>
              {l.name} {fmtK(l.value)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Níveis de gamma ao longo do tempo (PRD3, estilo SpotGamma key levels).
 *  Dois painéis empilhados — cada um na sua escala — para que TODOS os níveis
 *  apareçam como linhas suaves (média móvel) sem achatar nem grudar na borda:
 *  Spot×Paredes (Call/Put Wall) e o miolo (Spot×Zero Gamma×Max Pain). */
export default function GammaLevelsChart({ asset }: { asset: string }) {
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
      // Histórico reamostrado (RPC adaptativa) na janela selecionada.
      const { data } = await supabase.rpc("gamma_levels_history", { p_asset: asset, p_days: days });
      if (!cancelled) setRows((data as Row[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [asset, days]);

  // Dedupe por timestamp (segundos), mantendo a última leitura.
  const data = (() => {
    if (!rows) return null;
    const byTs = new Map<number, Row>();
    for (const r of rows) byTs.set(Math.floor(new Date(r.ts).getTime() / 1000), r);
    return [...byTs.values()].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  })();

  return (
    <div ref={wrapRef} className="w-full">
      <div className="mb-2 flex justify-end">
        <div className="flex gap-1 rounded-md bg-ink-700 p-0.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                days === d ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data == null || data.length < 2 ? (
        <div className="grid h-[300px] place-items-center text-xs text-slate-500">
          Acumulando histórico de níveis (a cada 5 min) — janela de {days} dias.
        </div>
      ) : (
        <div className="space-y-2">
          <LevelPanel data={data} series={[S.call, S.spot, S.put]} w={w} height={150} title="Preço × Paredes (Call / Put Wall)" showTime={false} />
          <LevelPanel data={data} series={[S.spot, S.zero, S.pain]} w={w} height={158} title="Spot × Zero Gamma × Max Pain (zoom no miolo)" showTime={true} />
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        {[S.spot, S.zero, S.pain, S.call, S.put].map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
