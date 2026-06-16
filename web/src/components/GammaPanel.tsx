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
import { GLOSSARY } from "../lib/glossary";
import type { GammaData } from "../lib/types";
import GammaLevelsChart from "./GammaLevelsChart";
import GammaOiProfile from "./GammaOiProfile";
import InfoTip from "./InfoTip";
import GammaProfileLine from "./GammaProfileLine";
import OptionsFlowChart from "./OptionsFlowChart";

type ProfileView = "bars" | "line" | "oi" | "levels";

const VIEW_LABEL: Record<ProfileView, string> = { bars: "GEX (barras)", line: "GEX (linha)", oi: "OI", levels: "Níveis" };
const VIEW_TITLE: Record<ProfileView, string> = {
  bars: "Perfil de gamma por strike",
  line: "Perfil de gamma (linha)",
  oi: "Open interest por strike",
  levels: "Níveis de gamma no tempo",
};

interface Props {
  gamma: GammaData | null;
  asset: string;
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

function GammaCard({ title, label, level, value, info }: { title: string; label: string; level: "green" | "yellow" | "red" | "neutral"; value: string; info?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[level]}`} />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
        {info && <span className="ml-auto">{<InfoTip text={info} />}</span>}
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground num">{value}</div>
      <div className="mt-1 text-xs leading-snug text-muted-foreground">{label}</div>
    </div>
  );
}

export default function GammaPanel({ gamma, asset }: Props) {
  const [view, setView] = useState<ProfileView>("bars");

  if (!gamma) {
    return (
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-6 text-sm text-muted-foreground">
        Módulo Gamma indisponível — aguardando coleta de opções.
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
  const fmtStrike = (s: number) => (s >= 1000 ? `${(s / 1000).toFixed(0)}k` : `${s}`);

  return (
    <div className="space-y-4">
      {asset === "SOL" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs leading-snug text-amber-200/80">
          <span className="font-semibold text-amber-300">⚠ Liquidez reduzida.</span> As opções de SOL vêm da Bybit
          (mercado bem menor que o de BTC/ETH na Deribit). Os níveis — Zero Gamma, Max Pain, Put/Call Wall — são{" "}
          <span className="font-medium text-amber-200">menos confiáveis</span> e devem ser lidos como referência, não como muro firme.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard
          title="Regime de gamma"
          level={regime.level}
          value={gamma.regime === "positive" ? "Positivo" : gamma.regime === "negative" ? "Negativo" : "—"}
          label={regime.label}
          info="Sinal do gama líquido dos dealers no spot. Positivo: dealers compram fraqueza/vendem força (amortecem, mercado mais calmo). Negativo: amplificam os movimentos (mais volátil)."
        />
        <GammaCard
          title="Zero Gamma (flip)"
          level={gamma.zero_gamma_level != null ? "yellow" : "neutral"}
          value={fmtPrice(gamma.zero_gamma_level)}
          label={gamma.zero_gamma_level != null ? "Nível onde o regime de volatilidade vira" : "Sem cruzamento na grade — regime estável"}
          info="Preço onde o gama líquido dos dealers cruza de positivo para negativo — a fronteira entre regime calmo (acima) e volátil (abaixo)."
        />
        <GammaCard
          title="Max Pain"
          level="neutral"
          value={fmtPrice(gamma.max_pain)}
          label={gamma.max_pain_expiry ? `Ímã do vencimento de ${new Date(gamma.max_pain_expiry).toLocaleDateString("pt-BR")}` : "Vencimento mais próximo"}
          info="Preço onde o maior volume de opções expira sem valor (compradores perdem mais). Perto do vencimento o preço tende a gravitar para cá."
        />
      </div>

      {/* Sentimento de opções (Deribit) — Put/Call, IV e skew */}
      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard
          title="Put/Call (OI)"
          level={pc.level}
          value={gamma.put_call_ratio != null ? gamma.put_call_ratio.toFixed(2) : "—"}
          label={pc.label}
          info="Razão entre o open interest de puts e calls. >1 = mais puts (proteção/viés de baixa); <1 = mais calls (viés de alta)."
        />
        <GammaCard
          title="Volatilidade implícita"
          level={iv.level}
          value={gamma.avg_iv != null ? `${gamma.avg_iv.toFixed(1)}%` : "—"}
          label={iv.label}
          info="IV média das opções — a oscilação futura que o mercado precifica nos prêmios. Alta = mais medo/expectativa de movimento."
        />
        <GammaCard
          title="Skew (puts − calls)"
          level={skew.level}
          value={gamma.iv_skew != null ? fmtPct(gamma.iv_skew, 1) : "—"}
          label={skew.label}
          info="Diferença de IV entre puts e calls. Positivo = puts mais caras (demanda por proteção/medo); negativo = calls mais caras (apetite por alta)."
        />
      </div>

      {/* Perfil de gamma por strike — Barras ou Linha (estilo SpotGamma) */}
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{VIEW_TITLE[view]}</span>
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              {(["bars", "line", "oi", "levels"] as ProfileView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <span>GEX líquido no spot: <span className="num">{fmtUsd(gamma.net_gex_spot)}</span></span>
        </div>

        {view === "levels" ? (
          <GammaLevelsChart asset={asset} />
        ) : view === "oi" ? (
          <GammaOiProfile asset={asset} spot={gamma.spot_price ?? null} maxPain={gamma.max_pain ?? null} />
        ) : view === "line" ? (
          <GammaProfileLine gamma={gamma} />
        ) : bars.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem dados de perfil.</div>
        ) : (
          <div className="space-y-0.5">
            {bars.map((b) => {
              const pct = (Math.abs(b.gex) / maxAbs) * 50; // metade da largura
              const positive = b.gex >= 0;
              const isSpot = spot != null && Math.abs(b.strike - spot) < spot * 0.0025;
              return (
                <div key={b.strike} className="flex items-center gap-2 text-[10px]">
                  <div className="flex h-3 flex-1 items-center justify-end">
                    {!positive && <div className="h-2 rounded-l bg-rose-500/80" style={{ width: `${pct}%` }} />}
                  </div>
                  <div className={`w-16 text-center num ${isSpot ? "font-bold text-primary" : "text-muted-foreground"}`}>
                    {fmtStrike(b.strike)}
                  </div>
                  <div className="flex h-3 flex-1 items-center">
                    {positive && <div className="h-2 rounded-r bg-emerald-500/80" style={{ width: `${pct}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "bars" && (
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>◀ Puts (suporte)</span>
            <span>Calls (resistência) ▶</span>
          </div>
        )}
      </div>

      {/* Fluxo de opções (proxy HIRO) — só BTC/ETH (fonte options_flow é Deribit) */}
      {asset !== "SOL" && (
        <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Fluxo de opções (proxy HIRO) — delta-fluxo do hedge dos dealers, acumulado · 5 min</span>
            <InfoTip text={GLOSSARY.optionsFlow} />
          </div>
          <OptionsFlowChart asset={asset} />
        </div>
      )}
    </div>
  );
}
