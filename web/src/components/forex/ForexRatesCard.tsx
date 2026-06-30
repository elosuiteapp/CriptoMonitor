import { useEffect, useState } from "react";

import { fetchForexRates, type ForexRates } from "../../lib/forex";
import InfoTip from "../InfoTip";

/** Juros de 10 anos do governo por moeda + diferencial do par atual — a expectativa REAL de
 *  juros (motor do carry), via FRED. Complementa o carry de taxa básica e o COT. Isolado. */
export default function ForexRatesCard({ pair }: { pair: string }) {
  const [rates, setRates] = useState<ForexRates | null>(null);

  useEffect(() => {
    let alive = true;
    fetchForexRates().then((r) => {
      if (alive) setRates(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!rates) return null;
  const entries = (Object.entries(rates.yields).filter(([, v]) => v != null) as [string, number][]).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = Math.max(0.1, ...entries.map(([, v]) => v));

  let diff: { base: string; quote: string; by: number; qy: number; d: number } | null = null;
  if (pair.includes("/")) {
    const [base, quote] = pair.split("/");
    const by = rates.yields[base], qy = rates.yields[quote];
    if (by != null && qy != null) diff = { base, quote, by, qy, d: by - qy };
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Juros de 10 anos · diferencial
        <InfoTip text="Juro do título de 10 anos do governo de cada moeda. O DIFERENCIAL (moeda comprada − vendida) reflete a expectativa de juros — quem paga mais tende a atrair capital. É o carry 'de mercado' (vivo), além da taxa básica. Fonte: FRED." />
      </h3>

      {diff && (
        <div className="mb-3 rounded-xl border border-border/70 bg-background/40 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{pair} · diferencial (comprada − vendida)</span>
            <span className={`num font-bold ${diff.d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{diff.d >= 0 ? "+" : ""}{diff.d.toFixed(2)} p.p.</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {diff.base} <span className="num text-foreground">{diff.by.toFixed(2)}%</span> · {diff.quote} <span className="num text-foreground">{diff.qy.toFixed(2)}%</span> — juro maior em <strong className="text-foreground">{diff.d >= 0 ? diff.base : diff.quote}</strong> (vento a favor de {diff.d >= 0 ? "comprar" : "vender"} o par).
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {entries.map(([ccy, v]) => {
          const isPair = diff && (ccy === diff.base || ccy === diff.quote);
          return (
            <div key={ccy} className={`flex items-center gap-2 rounded-lg px-1.5 py-0.5 ${isPair ? "bg-muted/40" : ""}`}>
              <span className="w-10 shrink-0 text-xs font-semibold text-foreground">{ccy}</span>
              <div className="relative h-2.5 flex-1 rounded-full bg-muted/40">
                <div className="absolute left-0 top-0 h-full rounded-full bg-sky-500/70" style={{ width: `${(v / max) * 100}%` }} />
              </div>
              <span className="num w-14 shrink-0 text-right text-xs font-semibold text-foreground">{v.toFixed(2)}%</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Juro do título de 10 anos do governo (EUR = bund alemão). Moeda com juro mais alto tende a atrair capital (carry/expectativa de juros). Fonte: FRED · mensal. Educacional.</p>
    </div>
  );
}
