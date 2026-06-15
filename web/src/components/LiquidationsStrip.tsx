import type { LiqPoint } from "../hooks/useSeries";
import { fmtUsd } from "../lib/format";

/** Tira de liquidações realizadas (Coinalyze, bucket de 5 min) — renderizada
 *  abaixo do gráfico principal, no mesmo esquema do CvdSubchart. Barras
 *  divergentes: shorts liquidados ↑ (verde, squeeze de baixa), longs ↓
 *  (vermelho, flush de alta). A cor ganha intensidade conforme a magnitude
 *  (efeito "mapa de calor"). O contexto de preço vem do gráfico logo acima. */
export default function LiquidationsStrip({ data }: { data: LiqPoint[] }) {
  if (!data.length) {
    return (
      <div className="rounded-lg border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs text-slate-500">
        Liquidações (5 min) — aguardando coleta
      </div>
    );
  }

  const maxAbs = Math.max(1, ...data.flatMap((p) => [p.long, p.short]));
  const W = 100;
  const H = 48;
  const mid = H / 2;
  const bw = W / data.length;
  const totLong = data.reduce((a, p) => a + p.long, 0);
  const totShort = data.reduce((a, p) => a + p.short, 0);
  // intensidade: barras maiores ficam mais opacas/vivas (efeito heat)
  const op = (v: number) => (v <= 0 ? 0 : 0.3 + 0.7 * (v / maxAbs));

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>Liquidações (5 min) · últimas ~12h</span>
        <span>
          <span className="text-signal-green">shorts {fmtUsd(totShort)}</span>
          <span className="mx-1 text-slate-600">·</span>
          <span className="text-signal-red">longs {fmtUsd(totLong)}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full">
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(148,163,184,0.2)" strokeWidth="0.3" />
        {data.map((p, i) => {
          const hs = (p.short / maxAbs) * mid;
          const hl = (p.long / maxAbs) * mid;
          const w = Math.max(0.5, bw - 0.3);
          return (
            <g key={i}>
              {p.short > 0 && <rect x={i * bw} y={mid - hs} width={w} height={hs} fill="#22c55e" opacity={op(p.short)} />}
              {p.long > 0 && <rect x={i * bw} y={mid} width={w} height={hl} fill="#ef4444" opacity={op(p.long)} />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 text-[9px] text-slate-600">shorts liquidados ↑ (preço sobe) · longs liquidados ↓ (preço cai)</div>
    </div>
  );
}
