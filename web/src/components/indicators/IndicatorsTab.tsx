import { useEffect, useMemo, useState } from "react";

import { computeMarketRead, timeframeLean, type AxisSignal, type LiquidityTarget, type TfLean } from "../../lib/indicators/confluence";
import { fmtPrice } from "../../lib/format";
import { useOrderbookImbalance } from "../../hooks/useOrderbookImbalance";
import { fetchKlines, type Candle } from "../../lib/marketData";
import { supabase } from "../../lib/supabase";
import type { Plan, SnapshotPayload } from "../../lib/types";

interface Props {
  asset: string;
  payload: SnapshotPayload | null;
  plan: Plan;
}

const toneText = (tone: "bull" | "bear" | "neutral") =>
  tone === "bull" ? "text-emerald-500" : tone === "bear" ? "text-rose-500" : "text-muted-foreground";
const dirText = (dir: number) => (dir > 0 ? "text-emerald-500" : dir < 0 ? "text-rose-500" : "text-muted-foreground");
const dirGlyph = (dir: number) => (dir > 0 ? "▲" : dir < 0 ? "▼" : "—");

/** Gauge semicircular do viés (-100..+100): arcos vermelho/neutro/verde + agulha. */
function BiasGauge({ value, tone }: { value: number; tone: "bull" | "bear" | "neutral" }) {
  const v = Math.max(-100, Math.min(100, value));
  const a = ((90 - v * 0.9) * Math.PI) / 180;
  const cx = 110;
  const cy = 110;
  const r = 78;
  const nx = cx + r * Math.cos(a);
  const ny = cy - r * Math.sin(a);
  const needle = tone === "bull" ? "#10b981" : tone === "bear" ? "#f43f5e" : "#94a3b8";
  return (
    <svg viewBox="0 0 220 124" className="h-28 w-56">
      <path d="M 32 110 A 78 78 0 0 1 71 42.5" fill="none" stroke="#f43f5e" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <path d="M 71 42.5 A 78 78 0 0 1 149 42.5" fill="none" stroke="currentColor" className="text-muted" strokeWidth="10" strokeLinecap="round" />
      <path d="M 149 42.5 A 78 78 0 0 1 188 110" fill="none" stroke="#10b981" strokeOpacity="0.55" strokeWidth="10" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={needle} strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={needle} />
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
  if (current) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="h-px flex-1 bg-primary/40" />
        <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">◀ preço atual {fmtPrice(t.price)}</span>
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
export default function IndicatorsTab({ asset, payload, plan }: Props) {
  const [c1d, setC1d] = useState<Candle[]>([]);
  const [c4h, setC4h] = useState<Candle[]>([]);
  const [c1h, setC1h] = useState<Candle[]>([]);
  const [oiDelta, setOiDelta] = useState<number | null>(null);
  const [macro, setMacro] = useState<{ vixChg: number; dxyChg: number; us10yChg: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [d, h4, h1] = await Promise.all([
        fetchKlines(asset, "1d", 365).catch(() => [] as Candle[]),
        fetchKlines(asset, "4h", 300).catch(() => [] as Candle[]),
        fetchKlines(asset, "1h", 300).catch(() => [] as Candle[]),
      ]);
      // OI-delta 24h (tabela derivatives — convicção do movimento). Opcional.
      let oi: number | null = null;
      try {
        const { data } = await supabase
          .from("derivatives")
          .select("open_interest, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(300);
        const rows = (data ?? []) as Array<{ open_interest: number | null; ts: string }>;
        if (rows.length) {
          const now = Number(rows[0].open_interest);
          const cutoff = Date.now() - 24 * 3600 * 1000;
          const old = rows.find((r) => new Date(r.ts).getTime() <= cutoff);
          const oldOi = old ? Number(old.open_interest) : NaN;
          if (Number.isFinite(now) && Number.isFinite(oldOi) && oldOi > 0) oi = ((now - oldOi) / oldOi) * 100;
        }
      } catch {
        /* OI é opcional */
      }
      // Maré macro (VIX/DXY/juros via macro_assets — risk-on/off). Opcional.
      let macroCtx: { vixChg: number; dxyChg: number; us10yChg: number } | null = null;
      try {
        const { data } = await supabase
          .from("macro_assets")
          .select("symbol, change_7d, ts")
          .in("symbol", ["VIX", "DXY", "US10Y"])
          .order("ts", { ascending: false })
          .limit(30);
        const rows = (data ?? []) as Array<{ symbol: string; change_7d: number | null; ts: string }>;
        if (rows.length) {
          const latestTs = rows[0].ts;
          const at = rows.filter((r) => r.ts === latestTs);
          const g = (s: string) => Number(at.find((r) => r.symbol === s)?.change_7d);
          const vix = g("VIX");
          const dxy = g("DXY");
          const us10y = g("US10Y");
          if ([vix, dxy, us10y].every((v) => Number.isFinite(v))) macroCtx = { vixChg: vix, dxyChg: dxy, us10yChg: us10y };
        }
      } catch {
        /* macro opcional */
      }
      if (!alive) return;
      setC1d(d);
      setC4h(h4);
      setC1h(h1);
      setOiDelta(oi);
      setMacro(macroCtx);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [asset]);

  const imbalance = useOrderbookImbalance(asset, plan);
  const bookImbalance = useMemo(() => {
    const bid = (imbalance.varejo?.bid_wide_usd ?? 0) + (imbalance.institucional?.bid_wide_usd ?? 0);
    const ask = (imbalance.varejo?.ask_wide_usd ?? 0) + (imbalance.institucional?.ask_wide_usd ?? 0);
    return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
  }, [imbalance]);

  const read = useMemo(
    () => computeMarketRead(c1d, payload, c4h, oiDelta, bookImbalance, macro),
    [c1d, payload, c4h, oiDelta, bookImbalance, macro],
  );
  const leans: TfLean[] = useMemo(
    () => [timeframeLean("1D", c1d), timeframeLean("4H", c4h), timeframeLean("1H", c1h)],
    [c1d, c4h, c1h],
  );
  const aligned = leans.every((l) => l.dir > 0) || leans.every((l) => l.dir < 0);
  const sortedTargets = useMemo(() => [...read.targets].sort((a, b) => b.price - a.price), [read.targets]);
  const firstBelow = sortedTargets.findIndex((t) => read.price != null && t.price < read.price);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Leitura do Mercado · {asset}</h2>
        <p className="text-xs text-muted-foreground">
          Tendência, fluxo institucional, opções, posicionamento e liquidez sintetizados em uma leitura só — multi-timeframe,
          com as forças à mostra e o que mudaria a leitura. Leitura do agora, não previsão.
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
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Viés do mercado</span>
                  <p className="mt-1 max-w-xs text-sm font-medium text-foreground">{read.regime.label}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Convicção</span>
                <div className="text-2xl font-semibold text-foreground">{read.conviction}%</div>
                <span className="text-[11px] text-muted-foreground">
                  {read.agree} de {read.voting} forças
                </span>
              </div>
            </div>

            {/* Multi-timeframe */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estrutura</span>
              {leans.map((l) => (
                <span key={l.tf} className="rounded-full border border-border px-2.5 py-1 text-xs">
                  <span className="font-semibold text-foreground">{l.tf}</span> <span className={dirText(l.dir)}>{dirGlyph(l.dir)} {l.label}</span>
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground">{aligned ? "· alinhada nos 3 prazos" : "· prazos divergentes (transição)"}</span>
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

          {/* O que muda a leitura (falsificador) */}
          {read.falsifier && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <h3 className="mb-1 text-sm font-semibold text-primary">🎯 O que muda a leitura</h3>
              <p className="text-sm text-foreground">{read.falsifier}</p>
            </div>
          )}

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

          {/* Mapa de alvos de liquidez (escada de preço) */}
          {sortedTargets.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Mapa de liquidez · pra onde o preço é puxado</h3>
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
                Ímãs estruturais — paredes de opções, Max Pain, Zero Gamma, POC e bolsões de liquidação — ordenados por preço em
                torno do atual.
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Leitura sintetizada de dados de fluxo, opções, posicionamento e liquidez. Informação para análise, não constitui
            recomendação de operação.
          </p>
        </>
      )}
    </section>
  );
}
