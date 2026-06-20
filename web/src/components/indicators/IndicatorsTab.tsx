import { useEffect, useMemo, useState } from "react";

import { computeMarketRead, type AxisSignal, type LiquidityTarget } from "../../lib/indicators/confluence";
import { fmtPrice } from "../../lib/format";
import { fetchKlines, type Candle } from "../../lib/marketData";
import type { SnapshotPayload } from "../../lib/types";

interface Props {
  asset: string;
  payload: SnapshotPayload | null;
}

const toneText = (tone: "bull" | "bear" | "neutral") =>
  tone === "bull" ? "text-emerald-500" : tone === "bear" ? "text-rose-500" : "text-muted-foreground";

const dirText = (dir: number) => (dir > 0 ? "text-emerald-500" : dir < 0 ? "text-rose-500" : "text-muted-foreground");
const dirGlyph = (dir: number) => (dir > 0 ? "▲" : dir < 0 ? "▼" : "—");

/** Barra de viés -100..+100 com marcador na posição atual. */
function BiasBar({ value }: { value: number }) {
  const pct = ((Math.max(-100, Math.min(100, value)) + 100) / 200) * 100;
  return (
    <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-rose-500/40 via-muted to-emerald-500/40">
      <div className="absolute top-1/2 h-px w-full bg-border" />
      <div
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground shadow"
        style={{ left: `${pct}%` }}
      />
    </div>
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

function TargetRow({ t }: { t: LiquidityTarget }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2 last:border-0">
      <span className={`w-5 shrink-0 text-center ${t.dir === "up" ? "text-emerald-500" : "text-rose-500"}`} aria-hidden>
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

/** Aba "Leitura do Mercado" (Expert) — leitura sintetizada do estado do ativo. */
export default function IndicatorsTab({ asset, payload }: Props) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchKlines(asset, "1d", 365)
      .then((c) => {
        if (alive) setCandles(c);
      })
      .catch(() => {
        if (alive) setCandles([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [asset]);

  const read = useMemo(() => computeMarketRead(candles, payload), [candles, payload]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Leitura do Mercado · {asset}</h2>
        <p className="text-xs text-muted-foreground">
          Tendência, fluxo institucional, posicionamento e liquidez sintetizados em uma leitura só — com as forças por trás
          dela à mostra. Leitura do agora, não previsão.
        </p>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />
      ) : !read.hasData ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">
          Sem dados suficientes para a leitura deste ativo no momento.
        </div>
      ) : (
        <>
          {/* Hero — viés + convicção + regime */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Viés do mercado</span>
                <div className={`text-4xl font-bold leading-none ${toneText(read.regime.tone)}`}>
                  {read.bias > 0 ? "+" : ""}
                  {read.bias}
                </div>
                <p className="mt-2 max-w-md text-sm font-medium text-foreground">{read.regime.label}</p>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Convicção</span>
                <div className="text-2xl font-semibold text-foreground">{read.conviction}%</div>
                <span className="text-[11px] text-muted-foreground">
                  {read.agree} de {read.voting} forças
                </span>
              </div>
            </div>
            <BiasBar value={read.bias} />
            <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Baixa</span>
              <span>Neutro</span>
              <span>Alta</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                Caráter: <span className="font-semibold text-foreground">{read.character}</span>
              </span>
              {read.gammaNote && (
                <span className="rounded-full border border-primary/30 px-2.5 py-1 text-[11px] text-primary" title={read.gammaNote}>
                  {read.gammaNote.split(" — ")[0]}
                </span>
              )}
            </div>
          </div>

          {/* Divergências e riscos */}
          {read.divergences.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-400">⚠ Divergências e riscos</h3>
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
            <h3 className="mb-1 text-sm font-semibold text-foreground">As forças por trás da leitura</h3>
            <div>
              {read.axes.map((a) => (
                <AxisRow key={a.key} a={a} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              O viés é a média ponderada das forças <em>direcionais</em>; o caráter (ADX + gamma) modula como lê-las. A convicção
              é o quanto elas concordam — não a intensidade.
            </p>
          </div>

          {/* Alvos de liquidez */}
          {read.targets.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Alvos de liquidez · pra onde o preço é puxado</h3>
              <div>
                {read.targets.map((t) => (
                  <TargetRow key={t.label} t={t} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ímãs estruturais (paredes de opções, Max Pain, Zero Gamma, POC) ordenados por proximidade do preço atual.
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Leitura sintetizada de dados de fluxo, posicionamento e liquidez. Informação para análise, não constitui
            recomendação de operação.
          </p>
        </>
      )}
    </section>
  );
}
