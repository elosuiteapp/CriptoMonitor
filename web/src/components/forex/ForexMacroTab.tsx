import { useEffect, useState } from "react";

import { fetchForexCalendar, fetchForexChart, fetchForexOverview, forexSessions, pairCurrencies, pairDecimals, type ForexCandle, type ForexEvent, type ForexQuote } from "../../lib/forex";
import MacroGlobalPanel from "../MacroGlobalPanel";
import ForexCorrelationMatrix from "./ForexCorrelationMatrix";

const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", BRL: "🇧🇷", MXN: "🇲🇽" };
const evDate = (s: string) => {
  const t = new Date(s);
  return Number.isFinite(t.getTime()) ? t.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : s;
};
function countdown(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const days = Math.round((a - today) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}
function Stars({ impact }: { impact: string }) {
  const n = impact === "High" ? 3 : impact === "Medium" ? 2 : 1;
  const color = impact === "High" ? "text-rose-500" : "text-amber-500";
  return (
    <span className="shrink-0 tracking-tighter" title={`Impacto ${impact === "High" ? "alto" : impact === "Medium" ? "médio" : "baixo"}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? color : "text-muted-foreground/30"}>★</span>
      ))}
    </span>
  );
}

const toneCls = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v >= 0 ? "text-emerald-500" : "text-rose-500");
const fmtPx = (v: number | null | undefined, dec: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

const REFS = ["DXY", "EUR/USD", "USD/JPY", "GBP/USD", "AUD/USD", "USD/BRL"];

/** Correlação de Pearson dos RETORNOS diários de duas séries, alinhadas por timestamp. */
function correlation(a: ForexCandle[], b: ForexCandle[]): number | null {
  const mb = new Map(b.map((c) => [c.time, c.close]));
  const xa: number[] = [];
  const xb: number[] = [];
  for (const c of a) {
    const v = mb.get(c.time);
    if (v != null) { xa.push(c.close); xb.push(v); }
  }
  if (xa.length < 12) return null;
  const ra: number[] = [], rb: number[] = [];
  for (let i = 1; i < xa.length; i++) { ra.push((xa[i] - xa[i - 1]) / xa[i - 1]); rb.push((xb[i] - xb[i - 1]) / xb[i - 1]); }
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(ra), mbb = mean(rb);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < ra.length; i++) { const da = ra[i] - ma, db = rb[i] - mbb; cov += da * db; va += da * da; vb += db * db; }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

function CorrBar({ name, c }: { name: string; c: number | null }) {
  const v = Math.max(-1, Math.min(1, c ?? 0));
  const w = Math.abs(v) * 50;
  const pos = v >= 0;
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{name}</span>
        <span className={`num font-semibold ${c == null ? "text-muted-foreground" : pos ? "text-emerald-500" : "text-rose-500"}`}>{c == null ? "—" : c.toFixed(2)}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-muted/50">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div className={`absolute top-0 h-full rounded-full ${pos ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
      </div>
    </div>
  );
}

/** Macro & Correlações do Forex — dólar (DXY) + correlações entre pares + sessões. */
export default function ForexMacroTab({ pair }: { pair: string }) {
  const [overview, setOverview] = useState<ForexQuote[]>([]);
  const [corrs, setCorrs] = useState<{ ref: string; c: number | null }[]>([]);
  const [events, setEvents] = useState<ForexEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setEvents([]);
    fetchForexCalendar(pairCurrencies(pair)).then((e) => alive && setEvents(e));
    return () => {
      alive = false;
    };
  }, [pair]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const ov = await fetchForexOverview();
      const refs = REFS.filter((r) => r !== pair);
      const [base, ...others] = await Promise.all([fetchForexChart(pair, "1d"), ...refs.map((r) => fetchForexChart(r, "1d"))]);
      if (!alive) return;
      const baseRecent = base.slice(-90);
      setCorrs(refs.map((r, i) => ({ ref: r, c: correlation(baseRecent, others[i].slice(-90)) })));
      setOverview(ov);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [pair]);

  const { sessions, weekend } = forexSessions();
  const qOf = (s: string) => overview.find((q) => q.pair === s);
  const dxy = qOf("DXY");
  const dollarPairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD"];

  // Barômetro Risk-on / Risk-off: high-beta (AUD/NZD) forte + havens (JPY/CHF) fracos = risco ligado.
  const riskDrivers = [
    { sym: "AUD/USD", label: "AUD" },
    { sym: "NZD/USD", label: "NZD" },
    { sym: "USD/JPY", label: "JPY fraco" },
    { sym: "USD/CHF", label: "CHF fraco" },
  ]
    .map((d) => ({ ...d, chg: qOf(d.sym)?.changePct ?? null }))
    .filter((d) => d.chg != null) as { sym: string; label: string; chg: number }[];
  const riskScore = riskDrivers.length ? riskDrivers.reduce((s, d) => s + d.chg, 0) / riskDrivers.length : null;
  const riskPct = riskScore == null ? 0 : Math.max(-1, Math.min(1, riskScore / 0.6)); // ±0,6%/dia ≈ extremo
  const riskLabel = riskScore == null ? "—" : riskScore > 0.1 ? "Risk-on (risco ligado)" : riskScore < -0.1 ? "Risk-off (risco desligado)" : "Neutro";
  const riskTone = riskScore == null ? "text-muted-foreground" : riskScore > 0.1 ? "text-emerald-500" : riskScore < -0.1 ? "text-rose-500" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Barômetro Risk-on / Risk-off */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Apetite a risco (Risk-on / Risk-off)</h3>
          <span className={`text-sm font-bold ${riskTone}`}>{riskLabel}</span>
        </div>
        <div className="relative h-3 rounded-full bg-gradient-to-r from-rose-500/30 via-muted/40 to-emerald-500/30">
          <div className="absolute top-1/2 h-5 w-1.5 -translate-y-1/2 rounded-full bg-foreground shadow" style={{ left: `calc(${((riskPct + 1) / 2) * 100}% - 3px)` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Risk-off (dólar/iene/franco fortes)</span>
          <span>Risk-on (AUD/NZD fortes)</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {riskDrivers.map((d) => (
            <span key={d.sym} className="rounded-lg border border-border/70 bg-background/40 px-2 py-1 text-[11px]">
              {d.label} <span className={`num ${toneCls(d.chg)}`}>{fmtPct(d.chg)}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Quando o risco está ligado, capital flui p/ moedas de maior beta (AUD, NZD) e sai dos portos-seguros (USD, JPY, CHF). Útil p/ saber o "humor" geral antes de operar qualquer par.</p>
      </div>

      {/* Dólar (DXY) + pares principais */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Dólar (DXY) e principais</h3>
          {dxy && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${(dxy.changePct ?? 0) >= 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
              DXY {fmtPx(dxy.price, 2)} {fmtPct(dxy.changePct)} — dólar {(dxy.changePct ?? 0) >= 0 ? "forte" : "fraco"}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {dollarPairs.map((p) => {
            const q = qOf(p);
            return (
              <div key={p} className="rounded-lg border border-border bg-background/40 px-2 py-1.5">
                <div className="text-[11px] font-semibold text-foreground">{p}</div>
                <div className="num text-sm text-foreground">{fmtPx(q?.price, pairDecimals(p))}</div>
                <div className={`num text-[11px] ${toneCls(q?.changePct)}`}>{fmtPct(q?.changePct)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maré de liquidez macro global (Fed/FRED) — motor do dólar e de todo o câmbio */}
      <MacroGlobalPanel />

      {/* Correlações do par selecionado */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Correlação de {pair} (90 dias)</h3>
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {corrs.map((c) => (
              <CorrBar key={c.ref} name={c.ref} c={c.c} />
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">Correlação de retornos diários. +1 = andam juntos · −1 = ao contrário. Ex.: a maioria dos pares anda contra o DXY.</p>
      </div>

      {/* Matriz de correlação entre os principais pares (heatmap) */}
      <ForexCorrelationMatrix />

      {/* Calendário econômico (moedas do par + dólar) */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Calendário econômico · {pairCurrencies(pair).join(" · ")}</h3>
          <span className="text-[11px] text-muted-foreground">eventos que movem o par</span>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Sem eventos de alto/médio impacto nos próximos dias (ou carregando…).</p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((e, i) => {
              const cd = countdown(e.date);
              return (
                <div key={`${e.title}-${e.date}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-sm leading-none" title={e.country} aria-hidden>{FLAG[e.country] ?? "🏳"}</span>
                    <Stars impact={e.impact} />
                    <span className="truncate text-foreground">{e.title}</span>
                    {cd && (
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${cd === "hoje" ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-border text-muted-foreground"}`}>{cd}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                    {(e.forecast || e.previous) && (
                      <span className="num hidden md:inline">ant. {e.previous ?? "—"} · est. {e.forecast ?? "—"}</span>
                    )}
                    <span className="num whitespace-nowrap">{evDate(e.date)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">Alto/médio impacto das moedas do par (e do dólar). Em dias de FOMC/CPI/NFP o macro costuma dominar o gráfico. ★★★ alto · ★★ médio. Fonte: ForexFactory.</p>
      </div>

      {/* Sessões */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessões de mercado</span>
          {sessions.map((s) => (
            <span key={s.name} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${s.open ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.open ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              {s.name}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground">{weekend ? "· fim de semana (fechado)" : "· UTC · sobreposições = mais volatilidade"}</span>
        </div>
      </div>
    </div>
  );
}
