import { useEffect, useState } from "react";

import { fetchForexChart, type ForexCandle } from "../../lib/forex";
import InfoTip from "../InfoTip";

const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "EUR/JPY", "GBP/JPY"];

/** Correlação de Pearson dos retornos diários de duas séries, alinhadas por tempo. */
function corr(a: ForexCandle[], b: ForexCandle[]): number | null {
  const mb = new Map(b.map((c) => [c.time, c.close]));
  const xa: number[] = [];
  const xb: number[] = [];
  for (const c of a) {
    const v = mb.get(c.time);
    if (v != null) { xa.push(c.close); xb.push(v); }
  }
  if (xa.length < 12) return null;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < xa.length; i++) { ra.push((xa[i] - xa[i - 1]) / xa[i - 1]); rb.push((xb[i] - xb[i - 1]) / xb[i - 1]); }
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(ra), mbb = mean(rb);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < ra.length; i++) { const da = ra[i] - ma, db = rb[i] - mbb; cov += da * db; va += da * da; vb += db * db; }
  if (va === 0 || vb === 0) return null;
  return cov / Math.sqrt(va * vb);
}

function cellCls(c: number | null): string {
  if (c == null) return "bg-muted/30 text-muted-foreground";
  const a = Math.abs(c);
  if (c >= 0) return a > 0.6 ? "bg-emerald-500/70 text-white" : a > 0.3 ? "bg-emerald-500/40 text-foreground" : "bg-emerald-500/15 text-muted-foreground";
  return a > 0.6 ? "bg-rose-500/70 text-white" : a > 0.3 ? "bg-rose-500/40 text-foreground" : "bg-rose-500/15 text-muted-foreground";
}
const abbr = (p: string) => p.replace("/", "");

/** Matriz/heatmap de correlação entre os principais pares (90 dias). Padrão das
 *  plataformas FX (OANDA/Myfxbook). Ajuda a evitar dobrar risco em pares que andam
 *  juntos e a achar hedges (pares que andam ao contrário). Isolado; só preço. */
export default function ForexCorrelationMatrix() {
  const [data, setData] = useState<Record<string, ForexCandle[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all(PAIRS.map((p) => fetchForexChart(p, "1d").then((c) => [p, c.slice(-90)] as const))).then((entries) => {
      if (!alive) return;
      setData(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Matriz de correlação · 90 dias
        <InfoTip text="Mostra quais pares andam juntos e quais andam ao contrário. Verde = sobem e caem juntos (operar os dois no mesmo sentido DOBRA o risco). Vermelho = andam em direções opostas (serve de proteção/hedge)." />
      </h3>
      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-[11px]">
            <thead>
              <tr>
                <th className="p-1" />
                {PAIRS.map((p) => (
                  <th key={p} className="p-1 font-semibold text-muted-foreground">{abbr(p)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAIRS.map((rp) => (
                <tr key={rp}>
                  <td className="whitespace-nowrap p-1 text-right font-semibold text-muted-foreground">{abbr(rp)}</td>
                  {PAIRS.map((cp) => {
                    const c = rp === cp ? 1 : corr(data[rp] ?? [], data[cp] ?? []);
                    return (
                      <td key={cp} className={`num border border-background/40 p-1 ${rp === cp ? "bg-muted text-muted-foreground" : cellCls(c)}`}>
                        {c == null ? "—" : c.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Correlação dos retornos diários. <span className="text-emerald-600 dark:text-emerald-400">Verde +</span> = andam juntos (dobra risco se operar os dois no mesmo sentido) · <span className="text-rose-600 dark:text-rose-400">vermelha −</span> = andam ao contrário (hedge natural).</p>
    </div>
  );
}
