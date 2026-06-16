import { useEffect, useRef, useState } from "react";

import { fmtPrice } from "../lib/format";
import type { GammaData } from "../lib/types";

interface Pt {
  strike: number;
  gex: number;
}

const fmtK = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(s % 1000 === 0 ? 0 : 1)}k` : `${s}`);

/** Perfil de gamma por strike em LINHA (estilo SpotGamma "gamma profile").
 *  Eixo X = strike (preço); área verde = GEX positivo (calls → resistência),
 *  vermelha = GEX negativo (puts → suporte). Linhas verticais marcam Put Wall,
 *  Call Wall, Spot, Ponto Zero (flip) e Max Pain. As faixas de fundo mostram
 *  onde os dealers ficam comprados (acima do Ponto Zero, preço "gruda") ou
 *  vendidos (abaixo, movimentos amplificam) em gamma — região para onde o preço
 *  tende a ser puxado. */
export default function GammaProfileLine({ gamma }: { gamma: GammaData }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(900);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.round(cw));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const profile = gamma.profile_jsonb;
  const spot = gamma.spot_price ?? null;
  const zeroGamma = gamma.zero_gamma_level;
  const maxPain = gamma.max_pain;

  const all: Pt[] = profile
    ? Object.entries(profile)
        .map(([s, g]) => ({ strike: Number(s), gex: Number(g) }))
        .filter((p) => Number.isFinite(p.strike) && Number.isFinite(p.gex))
        .sort((a, b) => a.strike - b.strike)
    : [];

  // Paredes derivadas do perfil (mesma regra do coletor: maior/menor GEX líquido).
  const callWall = all.length ? all.reduce((m, p) => (p.gex > m.gex ? p : m)).strike : null;
  const putWall = all.length ? all.reduce((m, p) => (p.gex < m.gex ? p : m)).strike : null;

  if (all.length < 2 || spot == null) {
    return (
      <div className="grid h-[300px] place-items-center text-xs text-muted-foreground">
        Sem perfil de opções suficiente para desenhar a curva.
      </div>
    );
  }

  // Janela de foco em torno do spot, presa ao alcance real dos strikes.
  const markerVals = [spot, zeroGamma, maxPain, putWall, callWall].filter(
    (v): v is number => v != null,
  );
  const dataLo = all[0].strike;
  const dataHi = all[all.length - 1].strike;
  const domLo = Math.max(dataLo, Math.min(spot * 0.55, ...markerVals));
  const domHi = Math.min(dataHi, Math.max(spot * 1.45, ...markerVals));
  const pts = all.filter((p) => p.strike >= domLo && p.strike <= domHi);
  const maxAbs = Math.max(1, ...pts.map((p) => Math.abs(p.gex)));

  // Geometria
  const H = 340;
  const padT = 32;
  const padB = 28;
  const padL = 12;
  const padR = 12;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = H - padT - padB;
  const span = domHi - domLo || 1;
  const xFor = (k: number) => padL + (plotW * (k - domLo)) / span;
  const yFor = (g: number) => padT + plotH * (1 - (g + maxAbs) / (2 * maxAbs));
  const zeroY = yFor(0);
  const zeroFrac = Math.min(0.999, Math.max(0.001, (zeroY - padT) / plotH));

  const coords = pts.map((p) => `${xFor(p.strike).toFixed(1)},${yFor(p.gex).toFixed(1)}`);
  const lineD = `M ${coords.join(" L ")}`;
  const areaD = `M ${xFor(pts[0].strike).toFixed(1)},${zeroY.toFixed(1)} L ${coords.join(
    " L ",
  )} L ${xFor(pts[pts.length - 1].strike).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // Faixa de fundo: à direita do Ponto Zero = dealers comprados (gamma +); à esquerda = vendidos.
  const flipInside = zeroGamma != null && zeroGamma >= domLo && zeroGamma <= domHi;
  const flipX = flipInside ? xFor(zeroGamma!) : null;

  type Lvl = { v: number; name: string; color: string; dash: boolean };
  const levels: Lvl[] = (
    [
      { v: putWall, name: "Put Wall", color: "#ef4444", dash: false },
      { v: callWall, name: "Call Wall", color: "#22c55e", dash: false },
      { v: spot, name: "Spot", color: "#f8fafc", dash: false },
      { v: zeroGamma, name: "Ponto Zero", color: "#a855f7", dash: true },
      { v: maxPain, name: "Max Pain", color: "#eab308", dash: true },
    ] as { v: number | null; name: string; color: string; dash: boolean }[]
  ).filter((l): l is Lvl => l.v != null && l.v >= domLo && l.v <= domHi);

  // Rótulos no topo escalonados em 3 linhas (evita sobreposição entre níveis próximos).
  const byX = [...levels].sort((a, b) => xFor(a.v) - xFor(b.v));
  const labelRow = new Map<string, number>();
  byX.forEach((l, i) => labelRow.set(l.name, i % 3));

  const ticks = Array.from({ length: 5 }, (_, i) => domLo + (span * i) / 4);

  return (
    <div>
      <div ref={wrapRef} className="w-full">
        <svg width={w} height={H} role="img" aria-label="Perfil de gamma por strike em linha">
          <defs>
            <linearGradient id="gexProfileGrad" x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#22c55e" stopOpacity="0.38" />
              <stop offset={zeroFrac} stopColor="#22c55e" stopOpacity="0.04" />
              <stop offset={zeroFrac} stopColor="#ef4444" stopOpacity="0.04" />
              <stop offset="1" stopColor="#ef4444" stopOpacity="0.38" />
            </linearGradient>
          </defs>

          {/* Faixas de regime (dealers comprados/vendidos em gamma) */}
          {flipX != null ? (
            <>
              <rect x={padL} y={padT} width={Math.max(0, flipX - padL)} height={plotH} fill="rgba(239,68,68,0.05)" />
              <rect x={flipX} y={padT} width={Math.max(0, w - padR - flipX)} height={plotH} fill="rgba(34,197,94,0.05)" />
            </>
          ) : (
            <rect
              x={padL}
              y={padT}
              width={plotW}
              height={plotH}
              fill={gamma.regime === "positive" ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)"}
            />
          )}

          {/* Linha de base (GEX = 0) */}
          <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="rgba(148,163,184,0.35)" strokeWidth="1" strokeDasharray="3 3" />

          {/* Curva do perfil */}
          <path d={areaD} fill="url(#gexProfileGrad)" stroke="none" />
          <path d={lineD} fill="none" stroke="#e2e8f0" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />

          {/* Linhas verticais dos níveis + rótulos escalonados */}
          {levels.map((l) => {
            const x = xFor(l.v);
            const row = labelRow.get(l.name) ?? 0;
            const ly = 9 + row * 8;
            const lx = Math.min(w - 34, Math.max(34, x));
            return (
              <g key={l.name}>
                <line x1={x} y1={padT} x2={x} y2={H - padB} stroke={l.color} strokeWidth={l.dash ? 1 : 1.75} strokeDasharray={l.dash ? "4 3" : undefined} opacity={l.dash ? 0.85 : 1} />
                <text x={lx} y={ly} fontSize="9" fontWeight="600" fill={l.color} textAnchor="middle">
                  {l.name}
                </text>
              </g>
            );
          })}

          {/* Ticks do eixo X (strike) */}
          {ticks.map((t, i) => (
            <text key={i} x={xFor(t)} y={H - 9} fontSize="9" fill="#64748b" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}>
              {fmtK(t)}
            </text>
          ))}
        </svg>
      </div>

      {/* Legenda dos níveis com valor */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {levels.map((l) => (
          <span key={l.name} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded" style={{ background: l.color }} />
            {l.name}: <span className="num text-foreground">{fmtPrice(l.v)}</span>
          </span>
        ))}
      </div>

      {/* Como ler — onde os dealers estão e para onde o preço é puxado */}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        À <span className="text-emerald-600 dark:text-emerald-400">direita do Ponto Zero</span> os dealers ficam{" "}
        <span className="text-emerald-600 dark:text-emerald-400">comprados em gamma</span> (vendem altas/compram quedas → preço tende a grudar);
        à <span className="text-rose-600 dark:text-rose-400">esquerda</span> ficam{" "}
        <span className="text-rose-600 dark:text-rose-400">vendidos</span> (movimentos amplificam). O preço costuma ser puxado para as
        paredes (Put/Call) e para o Max Pain.
      </p>
    </div>
  );
}
