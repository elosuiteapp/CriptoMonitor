import { Fragment, useState } from "react";

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
import { useGlossary } from "../lib/glossary";
import { useT } from "../lib/i18n";
import type { GammaData } from "../lib/types";
import GammaLevelsChart from "./GammaLevelsChart";
import GammaOiProfile from "./GammaOiProfile";
import InfoTip from "./InfoTip";
import GammaProfileLine from "./GammaProfileLine";
import OptionsFlowChart from "./OptionsFlowChart";

type ProfileView = "bars" | "line" | "oi" | "levels";

const viewLabel = (v: ProfileView, isEn: boolean): string =>
  ({ bars: isEn ? "GEX (bars)" : "GEX (barras)", line: isEn ? "GEX (line)" : "GEX (linha)", oi: "OI", levels: isEn ? "Levels" : "Níveis" })[v];
const viewTitle = (v: ProfileView, isEn: boolean): string =>
  ({
    bars: isEn ? "Gamma profile by strike" : "Perfil de gamma por strike",
    line: isEn ? "Gamma profile (line)" : "Perfil de gamma (linha)",
    oi: isEn ? "Open interest by strike" : "Open interest por strike",
    levels: isEn ? "Gamma levels over time" : "Níveis de gamma no tempo",
  })[v];

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
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const GLOSSARY = useGlossary();
  const [view, setView] = useState<ProfileView>("bars");

  if (!gamma) {
    return (
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-6 text-sm text-muted-foreground">
        {tt("Módulo Gamma indisponível — aguardando coleta de opções.", "Gamma module unavailable — waiting for options data.")}
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

  // Paredes e totais derivados do perfil (mesma regra do coletor: maior/menor GEX líquido).
  const callWallStrike = bars.length ? bars.reduce((m, b) => (b.gex > m.gex ? b : m), bars[0]).strike : null;
  const putWallStrike = bars.length ? bars.reduce((m, b) => (b.gex < m.gex ? b : m), bars[0]).strike : null;
  const callGex = bars.reduce((s, b) => (b.gex > 0 ? s + b.gex : s), 0);
  const putGex = bars.reduce((s, b) => (b.gex < 0 ? s - b.gex : s), 0);
  const domLabel =
    callGex > 0 && putGex > 0
      ? callGex >= putGex
        ? tt(`calls dominam ${(callGex / putGex).toFixed(1)}:1`, `calls lead ${(callGex / putGex).toFixed(1)}:1`)
        : tt(`puts dominam ${(putGex / callGex).toFixed(1)}:1`, `puts lead ${(putGex / callGex).toFixed(1)}:1`)
      : "";

  return (
    <div className="space-y-4">
      {asset !== "BTC" && asset !== "ETH" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs leading-snug text-amber-200/80">
          <span className="font-semibold text-amber-300">⚠ {tt("Liquidez reduzida.", "Reduced liquidity.")}</span>{" "}
          {tt(`As opções de ${asset} vêm de um mercado menor (`, `${asset} options come from a smaller market (`)}
          {asset === "BNB" ? "Binance" : "Bybit"}
          {tt(", bem menor que o de BTC/ETH na Deribit). Os níveis — Zero Gamma, Max Pain, Put/Call Wall — são ", ", much smaller than BTC/ETH on Deribit). The levels — Zero Gamma, Max Pain, Put/Call Wall — are ")}
          <span className="font-medium text-amber-200">{tt("menos confiáveis", "less reliable")}</span>{" "}
          {tt("e devem ser lidos como referência, não como muro firme.", "and should be read as reference, not a hard wall.")}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard
          title={tt("Regime de gamma", "Gamma regime")}
          level={regime.level}
          value={gamma.regime === "positive" ? tt("Positivo", "Positive") : gamma.regime === "negative" ? tt("Negativo", "Negative") : "—"}
          label={regime.label}
          info={tt(
            "Sinal do gama líquido dos dealers no spot. Positivo: dealers compram fraqueza/vendem força (amortecem, mercado mais calmo). Negativo: amplificam os movimentos (mais volátil).",
            "Sign of dealers' net gamma at spot. Positive: dealers buy weakness/sell strength (dampen, calmer market). Negative: they amplify moves (more volatile).",
          )}
        />
        <GammaCard
          title="Zero Gamma (flip)"
          level={gamma.zero_gamma_level != null ? "yellow" : "neutral"}
          value={fmtPrice(gamma.zero_gamma_level)}
          label={gamma.zero_gamma_level != null ? tt("Nível onde o regime de volatilidade vira", "Level where the volatility regime flips") : tt("Sem cruzamento na grade — regime estável", "No crossing on the grid — stable regime")}
          info={tt(
            "Preço onde o gama líquido dos dealers cruza de positivo para negativo — a fronteira entre regime calmo (acima) e volátil (abaixo).",
            "Price where dealers' net gamma crosses from positive to negative — the boundary between the calm regime (above) and the volatile one (below).",
          )}
        />
        <GammaCard
          title="Max Pain"
          level="neutral"
          value={fmtPrice(gamma.max_pain)}
          label={gamma.max_pain_expiry ? tt(`Ímã do vencimento de ${new Date(gamma.max_pain_expiry).toLocaleDateString("pt-BR")}`, `Magnet for the ${new Date(gamma.max_pain_expiry).toLocaleDateString("en-US")} expiry`) : tt("Vencimento mais próximo", "Nearest expiry")}
          info={tt(
            "Preço onde o maior volume de opções expira sem valor (compradores perdem mais). Perto do vencimento o preço tende a gravitar para cá.",
            "Price where the most options expire worthless (buyers lose the most). Near expiry, price tends to gravitate here.",
          )}
        />
      </div>

      {/* Sentimento de opções (Deribit) — Put/Call, IV e skew */}
      <div className="grid gap-3 sm:grid-cols-3">
        <GammaCard
          title="Put/Call (OI)"
          level={pc.level}
          value={gamma.put_call_ratio != null ? gamma.put_call_ratio.toFixed(2) : "—"}
          label={pc.label}
          info={tt(
            "Razão entre o open interest de puts e calls. >1 = mais puts (proteção/viés de baixa); <1 = mais calls (viés de alta).",
            "Ratio of put to call open interest. >1 = more puts (protection/bearish bias); <1 = more calls (bullish bias).",
          )}
        />
        <GammaCard
          title={tt("Volatilidade implícita", "Implied volatility")}
          level={iv.level}
          value={gamma.avg_iv != null ? `${gamma.avg_iv.toFixed(1)}%` : "—"}
          label={iv.label}
          info={tt(
            "IV média das opções — a oscilação futura que o mercado precifica nos prêmios. Alta = mais medo/expectativa de movimento.",
            "Average options IV — the future swing the market prices into premiums. High = more fear/expectation of movement.",
          )}
        />
        <GammaCard
          title="Skew (puts − calls)"
          level={skew.level}
          value={gamma.iv_skew != null ? fmtPct(gamma.iv_skew, 1) : "—"}
          label={skew.label}
          info={tt(
            "Diferença de IV entre puts e calls. Positivo = puts mais caras (demanda por proteção/medo); negativo = calls mais caras (apetite por alta).",
            "IV difference between puts and calls. Positive = puts richer (demand for protection/fear); negative = calls richer (appetite for upside).",
          )}
        />
      </div>

      {/* Perfil de gamma por strike — Barras ou Linha (estilo SpotGamma) */}
      <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{viewTitle(view, isEn)}</span>
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              {(["bars", "line", "oi", "levels"] as ProfileView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition ${
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {viewLabel(v, isEn)}
                </button>
              ))}
            </div>
          </div>
          <span className="flex items-center gap-1.5">
            {tt("GEX líquido no spot:", "Net GEX at spot:")}
            <span
              className={`num rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                gamma.net_gex_spot == null
                  ? "bg-muted text-muted-foreground"
                  : gamma.net_gex_spot < 0
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              }`}
              title={
                gamma.net_gex_spot == null
                  ? undefined
                  : gamma.net_gex_spot < 0
                    ? tt("Dealers short gamma — movimentos amplificam (mais volátil)", "Dealers short gamma — moves amplify (more volatile)")
                    : tt("Dealers long gamma — preço tende a grudar (mais calmo)", "Dealers long gamma — price tends to pin (calmer)")
              }
            >
              {fmtUsd(gamma.net_gex_spot)}
            </span>
          </span>
        </div>

        {view === "levels" ? (
          <GammaLevelsChart asset={asset} />
        ) : view === "oi" ? (
          <GammaOiProfile asset={asset} spot={gamma.spot_price ?? null} maxPain={gamma.max_pain ?? null} />
        ) : view === "line" ? (
          <GammaProfileLine gamma={gamma} />
        ) : bars.length === 0 ? (
          <div className="text-xs text-muted-foreground">{tt("Sem dados de perfil.", "No profile data.")}</div>
        ) : (
          <div className="space-y-0.5">
            {bars.map((b, i) => {
              const pct = (Math.abs(b.gex) / maxAbs) * 50; // metade da largura
              const positive = b.gex >= 0;
              const isSpot = spot != null && Math.abs(b.strike - spot) < spot * 0.0025;
              const isCallWall = b.strike === callWallStrike && b.gex > 0;
              const isPutWall = b.strike === putWallStrike && b.gex < 0;
              const distPct = spot != null && spot > 0 ? ((b.strike - spot) / spot) * 100 : null;
              // Divisor do preço atual: entre o strike logo acima e o logo abaixo do spot.
              const showSpotLine = spot != null && i > 0 && bars[i - 1].strike >= spot && b.strike < spot;
              return (
                <Fragment key={b.strike}>
                  {showSpotLine && (
                    <div className="flex items-center gap-2 py-0.5" aria-hidden>
                      <div className="h-px flex-1 bg-primary/40" />
                      <span className="num whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                        {tt("preço", "spot")} {fmtPrice(spot)}
                      </span>
                      <div className="h-px flex-1 bg-primary/40" />
                    </div>
                  )}
                  <div
                    className="flex items-center gap-2 text-[10px]"
                    title={`Strike ${fmtStrike(b.strike)} — GEX ${fmtUsd(b.gex)}${
                      distPct != null ? ` · ${distPct >= 0 ? "+" : ""}${distPct.toFixed(1)}% ${tt("do spot", "from spot")}` : ""
                    }${isCallWall ? ` · ${tt("Call Wall", "Call Wall")}` : ""}${isPutWall ? ` · ${tt("Put Wall", "Put Wall")}` : ""}`}
                  >
                    <div className="flex h-3.5 flex-1 items-center justify-end gap-1">
                      {!positive && <span className="num text-rose-600/55 dark:text-rose-400/45">{fmtUsd(Math.abs(b.gex))}</span>}
                      {!positive && (
                        <div className={`h-2 rounded-l ${isPutWall ? "bg-rose-500" : "bg-rose-500/70"}`} style={{ width: `${pct}%` }} />
                      )}
                    </div>
                    <div
                      className={`w-16 text-center num ${
                        isSpot
                          ? "font-bold text-primary"
                          : isCallWall
                            ? "font-semibold text-emerald-600 dark:text-emerald-400"
                            : isPutWall
                              ? "font-semibold text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                      }`}
                    >
                      {fmtStrike(b.strike)}
                    </div>
                    <div className="flex h-3.5 flex-1 items-center gap-1">
                      {positive && (
                        <div className={`h-2 rounded-r ${isCallWall ? "bg-emerald-500" : "bg-emerald-500/70"}`} style={{ width: `${pct}%` }} />
                      )}
                      {positive && <span className="num text-emerald-600/55 dark:text-emerald-400/45">{fmtUsd(b.gex)}</span>}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}

        {view === "bars" && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span>
              ◀ {tt("Puts (suporte)", "Puts (support)")} <span className="num text-rose-600/80 dark:text-rose-400/80">{fmtUsd(putGex)}</span>
              {putWallStrike != null && (
                <>
                  {" · "}
                  {tt("parede", "wall")} <span className="text-foreground">{fmtStrike(putWallStrike)}</span>
                </>
              )}
            </span>
            {domLabel && <span className="text-muted-foreground">{domLabel}</span>}
            <span>
              {callWallStrike != null && (
                <>
                  {tt("parede", "wall")} <span className="text-foreground">{fmtStrike(callWallStrike)}</span>
                  {" · "}
                </>
              )}
              {tt("Calls (resistência)", "Calls (resistance)")} <span className="num text-emerald-600/80 dark:text-emerald-400/80">{fmtUsd(callGex)}</span> ▶
            </span>
          </div>
        )}
      </div>

      {/* Fluxo de opções (proxy HIRO) — BTC/ETH (Deribit) + SOL (Bybit); BNB não tem */}
      {["BTC", "ETH", "SOL"].includes(asset) && (
        <div className="rounded-xl border border-border bg-card dark:bg-card/60 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{tt("Fluxo de opções (proxy HIRO) — delta-fluxo do hedge dos dealers, acumulado · 5 min", "Options flow (HIRO proxy) — dealers' hedge delta-flow, accumulated · 5 min")}</span>
            <InfoTip text={GLOSSARY.optionsFlow} />
          </div>
          <OptionsFlowChart asset={asset} />
        </div>
      )}
    </div>
  );
}
