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

  const regime = readGammaRegime(gamma.regime);
  const pc = readPutCall(gamma.put_call_ratio);
  const iv = readIvLevel(gamma.avg_iv);
  const skew = readSkew(gamma.iv_skew);
  const bars = profileBars(gamma);
  const maxAbs = Math.max(1, ...bars.map((b) => Math.abs(b.gex)));
  const spot = gamma.spot_price ?? null;

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

      {/* Histograma do perfil por strike: puts à esquerda, calls à direita */}
      <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
          <span>Perfil de gamma por strike</span>
          <span>GEX líquido no spot: {fmtUsd(gamma.net_gex_spot)}</span>
        </div>
        <div className="space-y-0.5">
          {bars.length === 0 && <div className="text-xs text-slate-500">Sem dados de perfil.</div>}
          {bars.map((b) => {
            const pct = (Math.abs(b.gex) / maxAbs) * 50; // metade da largura
            const positive = b.gex >= 0;
            const isSpot = spot != null && Math.abs(b.strike - spot) < (spot * 0.0025);
            return (
              <div key={b.strike} className="flex items-center gap-2 text-[10px]">
                <div className="flex h-3 flex-1 items-center justify-end">
                  {!positive && <div className="h-2 rounded-l bg-signal-red/80" style={{ width: `${pct}%` }} />}
                </div>
                <div className={`w-16 text-center tabular-nums ${isSpot ? "font-bold text-accent" : "text-slate-500"}`}>
                  {b.strike >= 1000 ? `${(b.strike / 1000).toFixed(0)}k` : b.strike}
                </div>
                <div className="flex h-3 flex-1 items-center">
                  {positive && <div className="h-2 rounded-r bg-signal-green/80" style={{ width: `${pct}%` }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-600">
          <span>◀ Puts (suporte)</span>
          <span>Calls (resistência) ▶</span>
        </div>
      </div>
    </div>
  );
}
