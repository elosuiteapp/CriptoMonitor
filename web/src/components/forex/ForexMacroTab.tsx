import { useEffect, useState } from "react";

import { fetchForexChart, fetchForexOverview, forexSessions, pairDecimals, type ForexCandle, type ForexQuote } from "../../lib/forex";

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
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-4">
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
