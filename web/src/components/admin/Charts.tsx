// Gráficos minimalistas, sem dependências (SVG/flex). Suficientes para o painel.

export function LineChart({
  values,
  height = 72,
  stroke = "#6366f1",
  id = "g",
}: {
  values: number[];
  height?: number;
  stroke?: string;
  id?: string;
}) {
  if (!values.length) return <div style={{ height }} className="grid place-items-center text-xs text-slate-600">sem dados</div>;
  const w = 320;
  const h = height;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - ((v - min) / range) * (h - 10) - 5] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#lg-${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function BarChart({ values, height = 72, color = "#6366f1" }: { values: number[]; height?: number; color?: string }) {
  if (!values.length) return <div style={{ height }} className="grid place-items-center text-xs text-slate-600">sem dados</div>;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all"
          style={{ height: `${Math.max((v / max) * 100, v > 0 ? 3 : 0)}%`, background: color }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

/** Barra horizontal proporcional (distribuição de planos, uso por modelo). */
export function HBar({ value, max, color = "#6366f1" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-700">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
