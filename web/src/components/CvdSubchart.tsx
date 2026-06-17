import type { SeriesPoint } from "../hooks/useSeries";
import { fmtUsd } from "../lib/format";

/** Sub-gráfico de CVD (delta de volume agressor) — PRD §8.4.
 *  `title` distingue a fonte: CVD do varejo (Binance) × institucional (Coinbase).
 *  Cada barra é um snapshot independente (saldo dos ~1000 trades do ciclo); como
 *  isso é ruidoso, sobrepomos uma média móvel (mesmo estilo da linha do CVD da
 *  Binance) para revelar a tendência do fluxo agressor. */
export default function CvdSubchart({ data, title = "CVD do varejo" }: { data: SeriesPoint[]; title?: string }) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-card dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {title} — aguardando coleta
      </div>
    );
  }
  const maxAbs = Math.max(1, ...data.map((p) => Math.abs(p.value)));
  const W = 100;
  const H = 40;
  const n = data.length;
  const bw = W / n;
  const last = data[n - 1].value;

  // Média móvel simples dos deltas (janela ~1/12 da série, entre 5 e 30 pontos) —
  // suaviza o ruído dos snapshots e mostra a tendência do fluxo institucional.
  const win = Math.min(30, Math.max(5, Math.round(n / 12)));
  const ma = data.map((_, i) => {
    const start = Math.max(0, i - win + 1);
    let s = 0;
    for (let j = start; j <= i; j++) s += data[j].value;
    return s / (i - start + 1);
  });
  const lastMa = ma[n - 1];
  // Linha na MESMA escala das barras (zero no meio do pane): preserva a leitura
  // "acima de zero = comprando / abaixo = vendendo".
  const yVal = (v: number) => H / 2 - (v / maxAbs) * (H / 2);
  const maPts = ma.map((v, i) => `${(i * bw + bw / 2).toFixed(2)},${yVal(v).toFixed(2)}`).join(" ");
  const maCls = lastMa >= 0 ? "stroke-emerald-500 dark:stroke-emerald-400" : "stroke-rose-500 dark:stroke-rose-400";

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className={`num ${last >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            Δ {fmtUsd(last)}
          </span>
          <span className={`num ${lastMa >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            MM {fmtUsd(lastMa)}
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-12 w-full">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        {/* histograma de delta por ciclo (secundário, esmaecido) */}
        {data.map((p, i) => {
          const h = (Math.abs(p.value) / maxAbs) * (H / 2);
          const y = p.value >= 0 ? H / 2 - h : H / 2;
          return (
            <rect
              key={i}
              x={i * bw}
              y={y}
              width={Math.max(0.5, bw - 0.3)}
              height={h}
              className={p.value >= 0 ? "fill-emerald-500/30 dark:fill-emerald-400/30" : "fill-rose-500/30 dark:fill-rose-400/30"}
            />
          );
        })}
        {/* média móvel do fluxo (linha principal) */}
        <polyline points={maPts} fill="none" className={maCls} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
