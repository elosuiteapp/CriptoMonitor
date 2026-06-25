import { useMemo } from "react";

import BiasGauge from "../BiasGauge";
import { type AxisSignal, type LiquidityTarget, type MarketRead, type TfLean } from "../../lib/indicators/confluence";
import { fmtPrice } from "../../lib/format";
import { useT } from "../../lib/i18n";

interface Props {
  asset: string;
  // A leitura é computada UMA vez no cockpit (useMarketRead) e injetada aqui, para
  // que esta aba e o badge do header mostrem exatamente os mesmos números.
  read: MarketRead | null;
  leans: TfLean[];
  biasHist: number[];
  loading: boolean;
}

const toneText = (tone: "bull" | "bear" | "neutral") =>
  tone === "bull" ? "text-emerald-500" : tone === "bear" ? "text-rose-500" : "text-muted-foreground";
const dirText = (dir: number) => (dir > 0 ? "text-emerald-500" : dir < 0 ? "text-rose-500" : "text-muted-foreground");
const dirGlyph = (dir: number) => (dir > 0 ? "▲" : dir < 0 ? "▼" : "—");

/** Mini-gráfico da evolução do viés ao longo do tempo (histórico do market_read). */
function BiasSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 112;
  const h = 26;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h / 2 - (Math.max(-100, Math.min(100, v)) / 100) * (h / 2 - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = data[data.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-28" preserveAspectRatio="none">
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} className="stroke-border" strokeWidth="0.5" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#f43f5e"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function AxisRow({ a }: { a: AxisSignal }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className={`w-5 shrink-0 text-center text-sm ${dirText(a.dir)}`} aria-hidden>
        {a.available ? dirGlyph(a.dir) : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{a.label}</span>
          <span className="text-[11px] text-muted-foreground">{a.group}</span>
        </div>
        <p className={`truncate text-xs ${a.available ? "text-muted-foreground" : "italic text-muted-foreground/70"}`}>{a.detail}</p>
      </div>
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${a.dir > 0 ? "bg-emerald-500" : a.dir < 0 ? "bg-rose-500" : "bg-muted-foreground/50"}`}
          style={{ width: `${Math.round((a.available ? a.strength : 0) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function TargetRow({ t, current }: { t: LiquidityTarget; current?: boolean }) {
  const { isEn } = useT();
  if (current) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="h-px flex-1 bg-primary/40" />
        <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">◀ {isEn ? "current price" : "preço atual"} {fmtPrice(t.price)}</span>
        <span className="h-px flex-1 bg-primary/40" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`w-4 shrink-0 text-center ${t.dir === "up" ? "text-emerald-500" : "text-rose-500"}`} aria-hidden>
        {t.dir === "up" ? "▲" : "▼"}
      </span>
      <span className="num w-24 shrink-0 text-sm font-semibold text-foreground">{fmtPrice(t.price)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t.label}</span>
      <span className="num w-14 shrink-0 text-right text-xs text-muted-foreground">
        {t.distPct >= 0 ? "+" : ""}
        {t.distPct.toFixed(1)}%
      </span>
      <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(t.strength * 100)}%` }} />
      </div>
    </div>
  );
}

/** Aba "Leitura do Mercado" (Expert) — leitura sintetizada e multi-timeframe. */
export default function IndicatorsTab({ asset, read, leans, biasHist, loading }: Props) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);

  const aligned = leans.length > 0 && (leans.every((l) => l.dir > 0) || leans.every((l) => l.dir < 0));
  const sortedTargets = useMemo(() => (read ? [...read.targets].sort((a, b) => b.price - a.price) : []), [read]);
  const firstBelow = sortedTargets.findIndex((t) => read?.price != null && t.price < read.price);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{tt("Leitura do Mercado", "Market Read")} · {asset}</h2>
        <p className="text-xs text-muted-foreground">
          {tt(
            "Tendência, fluxo institucional, opções, posicionamento e liquidez sintetizados em uma leitura só — multi-timeframe, com as forças à mostra e o que mudaria a leitura. Leitura do agora, não previsão.",
            "Trend, institutional flow, options, positioning, and liquidity synthesized into a single read — multi-timeframe, with the forces on display and what would flip it. A read on the now, not a forecast.",
          )}
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />
      ) : !read || !read.hasData ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">
          {tt("Sem dados suficientes para a leitura deste ativo no momento.", "Not enough data for this asset's read right now.")}
        </div>
      ) : (
        <>
          {/* Hero — gauge + viés + convicção + regime + multi-timeframe */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <BiasGauge value={read.bias} tone={read.regime.tone} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center">
                    <span className={`text-2xl font-bold ${toneText(read.regime.tone)}`}>
                      {read.bias > 0 ? "+" : ""}
                      {read.bias}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tt("Viés do mercado", "Market bias")}</span>
                  <p className="mt-1 max-w-xs text-sm font-medium text-foreground">{read.regime.label}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tt("Convicção", "Conviction")}</span>
                <div className="text-2xl font-semibold text-foreground">{read.conviction}%</div>
                <span className="text-[11px] text-muted-foreground">
                  {read.agree} {tt("de", "of")} {read.voting} {tt("forças", "signals")}
                </span>
                {biasHist.length >= 2 && (
                  <div className="mt-1.5 flex flex-col items-end">
                    <BiasSparkline data={biasHist} />
                    <span className="text-[10px] text-muted-foreground">{tt("evolução do viés", "bias over time")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Multi-timeframe */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{tt("Estrutura", "Structure")}</span>
              {leans.map((l) => (
                <span key={l.tf} className="rounded-full border border-border px-2.5 py-1 text-xs">
                  <span className="font-semibold text-foreground">{l.tf}</span> <span className={dirText(l.dir)}>{dirGlyph(l.dir)} {l.label}</span>
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground">{aligned ? tt("· alinhada nos 3 prazos", "· aligned across all 3 timeframes") : tt("· prazos divergentes (transição)", "· timeframes diverging (transition)")}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                {tt("Caráter", "Character")}: <span className="font-semibold text-foreground">{read.character}</span>
              </span>
              {read.gammaNote && (
                <span className="rounded-full border border-primary/30 px-2.5 py-1 text-[11px] text-primary" title={read.gammaNote}>
                  {read.gammaNote.split(" — ")[0]}
                </span>
              )}
            </div>
          </div>

          {/* O que muda a leitura (falsificador) */}
          {read.falsifier && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="mb-1 text-sm font-semibold text-primary">🎯 {tt("O que muda a leitura", "What would flip the read")}</h3>
              <p className="text-sm text-foreground">{read.falsifier}</p>
            </div>
          )}

          {/* Divergências e riscos */}
          {read.divergences.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">⚠ {tt("Divergências e riscos", "Divergences and risks")}</h3>
              <ul className="space-y-1.5">
                {read.divergences.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800 dark:text-amber-200">
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Forças por trás da leitura */}
          <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
            <h3 className="mb-1 text-sm font-semibold text-foreground">{tt("As forças por trás da leitura", "The forces behind the read")}</h3>
            <div>
              {read.axes.map((a) => (
                <AxisRow key={a.key} a={a} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {tt(
                "O viés é a média ponderada das forças direcionais; o caráter (ADX + gamma) modula como lê-las. A convicção é o quanto elas concordam — não a intensidade.",
                "The bias is the weighted average of the directional forces; the character (ADX + gamma) modulates how to read them. Conviction is how much they agree — not their intensity.",
              )}
            </p>
          </div>

          {/* Mapa de alvos de liquidez (escada de preço) */}
          {sortedTargets.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
              <h3 className="mb-2 text-sm font-semibold text-foreground">{tt("Mapa de liquidez · pra onde o preço é puxado", "Liquidity map · where price is being pulled")}</h3>
              <div>
                {sortedTargets.map((t, i) => (
                  <div key={t.label}>
                    {i === firstBelow && read.price != null && <TargetRow t={{ ...t, price: read.price }} current />}
                    <TargetRow t={t} />
                  </div>
                ))}
                {firstBelow === -1 && read.price != null && <TargetRow t={{ ...sortedTargets[0], price: read.price }} current />}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {tt(
                  "Ímãs estruturais — paredes de opções, Max Pain, Zero Gamma, POC e bolsões de liquidação — ordenados por preço em torno do atual.",
                  "Structural magnets — options walls, Max Pain, Zero Gamma, POC, and liquidation pockets — sorted by price around the current one.",
                )}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            {tt(
              "Leitura sintetizada de dados de fluxo, opções, posicionamento e liquidez. Informação para análise, não constitui recomendação de operação.",
              "A synthesized read from flow, options, positioning, and liquidity data. Information for analysis, not a trading recommendation.",
            )}
          </p>
        </>
      )}
    </section>
  );
}
