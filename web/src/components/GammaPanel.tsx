import { useState } from "react";

import {
  fmtPct,
  fmtPrice,
  fmtUsd,
  readGammaRegime,
  readIvLevel,
  readPutCall,
  readSkew,
  LEVEL_DOT,
} from "../lib/format";
import type { GammaData } from "../lib/types";

type ProfileView = "bars" | "line";

interface Props {
  gamma: GammaData | null;
}

interface Bar {
  strike: number;
  gex: number;
}

function profileBars(gamma: GammaData | null): Bar[] {
  const profile = gamma?.profile_jsonb;
  if (!profile) return [];
  const bars = Object.entries(profile)
    .map(([s, g]) => ({ strike: Number(s), gex: Number(g) }))
    .filter((b) => Number.isFinite(b.strike) && Number.isFinite(b.gex));
  // 24 strikes mais relevantes por |GEX|, reordenados por strike (desc = topo)
  bars.sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));
  return bars.slice(0, 24).sort((a, b) => b.strike - a.strike);
}

function GammaCard({ title, label, level, value }: { title: string; label: string; level: "green" | "yellow" | "red" | "neutral"; value: string }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[level]}`} />
        <span className="text-xs uppercase tracking-wide text-slate-500">{title}</span>
      </div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-snug text-slate-400">{label}</div>
    </div>
  );
}

export default function GammaPanel({ gamma }: Props) {
  if (!gamma) {
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-500">
        Módulo Gamma indisponível — aguardando coleta da Deribit.
      </div>
    );
  }

  const [view, setView] = useState<ProfileView>("bars");
  const regime = readGammaRegime(gamma.regime);
  const pc = readPutCall(gamma.put_call_ratio);
  const iv = readIvLevel(gamma.avg_iv);
  const skew = readSkew(gamma.iv_skew);
  const bars = profileBars(gamma);
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.gex)));
  const spot = gamma.spot_price ?? null;

  // Geometria da visão "linha" (perfil vertical: strike no eixo Y, GEX no X)
  const LW = 300;
  const rowH = 14;
  const LH = Math.max(rowH, bars.length * rowH);
  const cx = LW / 2;
  const pts = bars.map((b, i) => ({
    b,
    x: cx + (b.gex / maxAbs) * (cx - 14),
    y: i * rowH + rowH / 2,
  }));
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const polygon = pts.length
    ? `${cx},${pts[0].y.toFixed(1)} ${polyline} ${cx},${pts[pts.length - 1].y.toFixed(1)}`
    : "";
  const labelEvery = Math.max(1, Math.ceil(bars.length / 6));
  const fmtStrike = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(0)}k` : `${s}`);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard title="Regime de gamma" level={regime.level} value={gamma.regime === "positive" ? "Positivo" : gamma.regime === "negative" ? "Negativo" : "—"} label={regime.label} />
        <GammaCard
          title="Zero Gamma (flip)"
          level={gamma.zero_gamma_level != null ? "yellow" : "neutral"}
          value={fmtPrice(gamma.zero_gamma_level)}
          label={gamma.zero_gamma_level != null ? "Nível onde o regime de volatilidade vira" : "Sem cruzamento na grade — regime estável"}
        />
        <GammaCard
          title="Max Pain"
          level="neutral"
          value={fmtPrice(gamma.max_pain)}
          label={gamma.max_pain_expiry ? `Ímã do vencimento de ${new Date(gamma.max_pain_expiry).toLocaleDateString("pt-BR")}` : "Vencimento mais próximo"}
        />
      </div>

      {/* Sentimento de opções (Deribit) — Put/Call, IV e skew */}
      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard
          title="Put/Call (OI)"
          level={pc.level}
          value={gamma.put_call_ratio != null ? gamma.put_call_ratio.toFixed(2) : "—"}
          label={pc.label}
        />
        <GammaCard
          title="Volatilidade implícita"
          level={iv.level}
          value={gamma.avg_iv != null ? `${gamma.avg_iv.toFixed(1)}%` : "—"}
          label={iv.label}
        />
        <GammaCard
          title="Skew (puts − calls)"
          level={skew.level}
          value={gamma.iv_skew != null ? fmtPct(gamma.iv_skew, 1) : "—"}
          label={skew.label}
        />
      </div>

      {/* Perfil de gamma por strike — Barras ou Linha (estilo SpotGamma) */}
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>Perfil de gamma por strike</span>
            <div className="flex gap-1 rounded-md bg-ink-700 p-0.5">
              {(["bars", "line"] as ProfileView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                    view === v ? "bg-accent text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {v === "bars" ? "Barras" : "Linha"}
                </button>
              ))}
            </div>
          </div>
          <span>GEX líquido no spot: {fmtUsd(gamma.net_gex_spot)}</span>
        </div>

        {bars.length === 0 ? (
          <div className="text-xs text-slate-500">Sem dados de perfil.</div>
        ) : view === "bars" ? (
          <div className="space-y-0.5">
            {bars.map((b) => {
              const pct = (Math.abs(b.gex) / maxAbs) * 50; // metade da largura
              const positive = b.gex >= 0;
              const isSpot = spot != null && Math.abs(b.strike - spot) < spot * 0.0025;
              return (
                <div key={b.strike} className="flex items-center gap-2 text-[10px]">
                  <div className="flex h-3 flex-1 items-center justify-end">
                    {!positive && <div className="h-2 rounded-l bg-signal-red/80" style={{ width: `${pct}%` }} />}
                  </div>
                  <div className={`w-16 text-center tabular-nums ${isSpot ? "font-bold text-accent" : "text-slate-500"}`}>
                    {fmtStrike(b.strike)}
                  </div>
                  <div className="flex h-3 flex-1 items-center">
                    {positive && <div className="h-2 rounded-r bg-signal-green/80" style={{ width: `${pct}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <svg viewBox={`0 0 ${LW} ${LH}`} preserveAspectRatio="none" className="w-full" style={{ height: LH }}>
            <line x1={cx} y1={0} x2={cx} y2={LH} stroke="rgba(148,163,184,0.25)" strokeWidth="1" strokeDasharray="3 3" />
            {polygon && <polygon points={polygon} fill="rgba(99,102,241,0.15)" />}
            {polyline && (
              <polyline points={polyline} fill="none" stroke="#6366f1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            )}
            {pts.map((p, i) => (
              <g key={i}>
                {spot != null && Math.abs(p.b.strike - spot) < spot * 0.0025 && (
                  <line x1={0} y1={p.y} x2={LW} y2={p.y} stroke="#6366f1" strokeWidth="0.7" strokeDasharray="2 2" />
                )}
                <circle cx={p.x} cy={p.y} r="2" fill={p.b.gex >= 0 ? "#22c55e" : "#ef4444"} />
                {i % labelEvery === 0 && (
                  <text x="3" y={p.y + 3} fontSize="8" fill="#64748b">
                    {fmtStrike(p.b.strike)}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}

        <div className="mt-2 flex justify-between text-[10px] text-slate-600">
          <span>◀ Puts (suporte)</span>
          <span>Calls (resistência) ▶</span>
        </div>
      </div>
    </div>
  );
}
