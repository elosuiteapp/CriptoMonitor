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
  const { isEn } = useT();
  const votes = a.weight != null;
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className={`w-5 shrink-0 text-center text-sm ${dirText(a.dir)}`} aria-hidden>
        {a.available ? dirGlyph(a.dir) : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{a.label}</span>
          {votes ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground" title={isEn ? "weight in the bias" : "peso no viés"}>
              {isEn ? "weight" : "peso"} {Math.round((a.weight ?? 0) * 100)}%
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{a.group}</span>
          )}
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

// Zona nomeada do viés (-100..+100) → 0 forte baixa … 4 forte alta.
function biasZoneIdx(bias: number): number {
  const a = Math.abs(bias);
  if (a < 12) return 2;
  if (bias < 0) return a >= 60 ? 0 : 1;
  return a >= 60 ? 4 : 3;
}

/** Escala de zonas nomeadas com o marcador na posição do viés (gauge legível). */
function ZoneScale({ bias }: { bias: number }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const zones = [tt("forte baixa", "strong down"), tt("baixa", "down"), tt("neutro", "neutral"), tt("alta", "up"), tt("forte alta", "strong up")];
  const active = biasZoneIdx(bias);
  const pos = ((Math.max(-100, Math.min(100, bias)) + 100) / 200) * 100;
  return (
    <div className="w-56 max-w-full">
      <div className="relative h-1.5 rounded-full" style={{ background: "linear-gradient(to right,#f43f5e,#f43f5e99,#64748b,#10b98199,#10b981)" }}>
        <div className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-foreground shadow" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wide">
        {zones.map((z, i) => (
          <span key={z} className={i === active ? "font-bold text-foreground" : "text-muted-foreground/50"}>{z}</span>
        ))}
      </div>
    </div>
  );
}

/** Cabo de guerra das forças: cada segmento = peso × força (contribuição real ao
 *  viés). Baixistas puxam pra esquerda (vermelho), altistas pra direita (verde);
 *  o lado que estica mais "vence" — é o viés visualizado pela contribuição. */
function TugOfWar({ axes }: { axes: AxisSignal[] }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const wsum = axes.filter((a) => a.weight != null && a.available).reduce((s, a) => s + (a.weight ?? 0), 0);
  const voting = axes.filter((a) => a.weight != null && a.available && a.dir !== 0);
  if (!voting.length || wsum <= 0) return null;
  const contrib = voting.map((a) => ({ a, c: a.dir * a.strength * (a.weight ?? 0) }));
  const bull = contrib.filter((x) => x.c > 0).sort((x, y) => y.c - x.c);
  const bear = contrib.filter((x) => x.c < 0).sort((x, y) => x.c - y.c);
  const pct = (c: number) => (Math.abs(c) / wsum) * 100;
  const seg = (x: { a: AxisSignal; c: number }, side: "bull" | "bear") => (
    <div
      key={x.a.key}
      title={`${x.a.label}: ${x.c >= 0 ? "+" : "−"}${pct(x.c).toFixed(0)}% ${tt("do viés", "of bias")}`}
      style={{ width: `${pct(x.c)}%` }}
      className={`h-full ${side === "bull" ? "border-r border-background/40 bg-emerald-500/80 last:border-r-0" : "border-l border-background/40 bg-rose-500/80 first:border-l-0"}`}
    />
  );
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide">
        <span className="font-semibold text-rose-500">◀ {tt("baixa", "down")}</span>
        <span className="text-muted-foreground">{tt("cabo de guerra (peso × força)", "tug-of-war (weight × strength)")}</span>
        <span className="font-semibold text-emerald-500">{tt("alta", "up")} ▶</span>
      </div>
      <div className="flex h-7 overflow-hidden rounded-lg border border-border bg-muted/40">
        <div className="flex w-1/2 flex-row-reverse">{bear.map((x) => seg(x, "bear"))}</div>
        <div className="w-px shrink-0 bg-foreground/50" />
        <div className="flex w-1/2">{bull.map((x) => seg(x, "bull"))}</div>
      </div>
    </div>
  );
}

/** Linha de cenário acionável (gatilho de preço de um lado). */
function ScenarioRow({ side, name, price, pct }: { side: "up" | "down"; name: string; price: number; pct: number }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const up = side === "up";
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className={up ? "text-emerald-500" : "text-rose-500"}>{up ? "▲" : "▼"}</span>
      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${up ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
        {up ? tt("Cenário de alta", "Bull case") : tt("Cenário de baixa", "Bear case")}
      </span>
      <span className="min-w-0 flex-1 text-foreground">
        {up ? tt("Romper acima de", "Break above") : tt("Perder", "Lose")} <b>{name}</b>{" "}
        <span className="num text-muted-foreground">{fmtPrice(price)}</span>
      </span>
      <span className={`num shrink-0 text-xs font-semibold ${up ? "text-emerald-500" : "text-rose-500"}`}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </span>
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
            "Tendência, estrutura (price action), fluxo institucional, opções, posicionamento, liquidez e sentimento sintetizados em uma leitura só — multi-timeframe, com as forças à mostra e o que mudaria a leitura. Leitura do agora, não previsão.",
            "Trend, structure (price action), institutional flow, options, positioning, liquidity, and sentiment synthesized into a single read — multi-timeframe, with the forces on display and what would flip it. A read on the now, not a forecast.",
          )}
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60" />
      ) : !read || !read.hasData ? (
        <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-6 text-sm text-muted-foreground dark:bg-card/60">
          {tt("Sem dados suficientes para a leitura deste ativo no momento.", "Not enough data for this asset's read right now.")}
        </div>
      ) : (
        <>
          {/* Hero — gauge + viés + convicção + regime + multi-timeframe */}
          <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
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
                  <p className={`text-base font-bold ${toneText(read.regime.tone)}`}>
                    {[tt("Forte baixa", "Strong down"), tt("Baixa", "Down"), tt("Neutro", "Neutral"), tt("Alta", "Up"), tt("Forte alta", "Strong up")][biasZoneIdx(read.bias)]}
                  </p>
                  <p className="mt-0.5 max-w-xs text-sm font-medium text-foreground">{read.regime.label}</p>
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

            {/* Escala de zonas nomeadas (gauge legível) */}
            <div className="mt-4 border-t border-border/60 pt-3">
              <ZoneScale bias={read.bias} />
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

          {/* O que muda a leitura — falsificador + cenários acionáveis dos 2 lados */}
          {(read.falsifier || read.scenarios.up || read.scenarios.down) && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="mb-1 text-sm font-semibold text-primary">🎯 {tt("O que muda a leitura", "What would flip the read")}</h3>
              {read.falsifier && <p className="text-sm text-foreground">{read.falsifier}</p>}
              {(read.scenarios.up || read.scenarios.down) && (
                <div className="mt-2 divide-y divide-border/60 border-t border-border/60">
                  {read.scenarios.up && <ScenarioRow side="up" name={read.scenarios.up.name} price={read.scenarios.up.price} pct={read.scenarios.up.pct} />}
                  {read.scenarios.down && <ScenarioRow side="down" name={read.scenarios.down.name} price={read.scenarios.down.price} pct={read.scenarios.down.pct} />}
                </div>
              )}
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

          {/* Forças por trás da leitura — cabo de guerra + votantes × contexto */}
          <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
            <h3 className="mb-2 text-sm font-semibold text-foreground">{tt("As forças por trás da leitura", "The forces behind the read")}</h3>
            <TugOfWar axes={read.axes} />
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{tt("Forças que votam", "Voting forces")}</span>
              <span className="text-[11px] text-muted-foreground">{read.agree} {tt("de", "of")} {read.voting} {tt("alinhadas", "aligned")}</span>
            </div>
            <div>{read.axes.filter((a) => a.weight != null).map((a) => <AxisRow key={a.key} a={a} />)}</div>
            {read.axes.some((a) => a.weight == null) && (
              <>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tt("Contexto", "Context")}</span>
                  <span className="text-[11px] text-muted-foreground">{tt("não votam — calibram a leitura e geram divergências", "don't vote — they calibrate the read and trigger divergences")}</span>
                </div>
                <div>{read.axes.filter((a) => a.weight == null).map((a) => <AxisRow key={a.key} a={a} />)}</div>
              </>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {tt(
                "O viés é a média ponderada das forças que votam (peso × força); o contexto não vota, mas calibra a leitura e dispara divergências. A convicção é o quanto as votantes concordam — não a intensidade.",
                "The bias is the weighted average of the voting forces (weight × strength); context doesn't vote, but it calibrates the read and triggers divergences. Conviction is how much the voting forces agree — not their intensity.",
              )}
            </p>
          </div>

          {/* Mapa de alvos de liquidez (escada de preço) */}
          {sortedTargets.length > 0 && (
            <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
              <h3 className="mb-2 text-sm font-semibold text-foreground">{tt("Mapa de liquidez · pra onde o preço é puxado", "Liquidity map · where price is being pulled")}</h3>
              <div>
                {sortedTargets.map((t, i) => (
                  <div key={`${t.label}-${t.price}`}>
                    {i === firstBelow && read.price != null && <TargetRow t={{ ...t, price: read.price }} current />}
                    <TargetRow t={t} />
                  </div>
                ))}
                {firstBelow === -1 && read.price != null && <TargetRow t={{ ...sortedTargets[0], price: read.price }} current />}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {tt(
                  "Ímãs estruturais — paredes de opções, Max Pain, Zero Gamma, POC, bolsões de liquidação e níveis de price action (order block, FVG, topos/fundos iguais) — ordenados por preço em torno do atual.",
                  "Structural magnets — options walls, Max Pain, Zero Gamma, POC, liquidation pockets, and price-action levels (order block, FVG, equal highs/lows) — sorted by price around the current one.",
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
