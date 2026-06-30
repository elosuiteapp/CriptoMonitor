import { useEffect, useState } from "react";

import { computeCurrencyStrength, fetchForexChart, type ForexQuote } from "../../lib/forex";
import InfoTip from "../InfoTip";

const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", BRL: "🇧🇷" };
// Majors contra USD p/ derivar a força de 5 dias (tendência) a partir das velas diárias.
const TREND_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "NZD/USD", "USD/MXN", "USD/BRL"];

/** Medidor de Força das Moedas (Currency Strength) — padrão do FX. Mostra cada moeda
 *  da mais FORTE à mais FRACA pela média do movimento dela contra as outras (24h),
 *  com a TENDÊNCIA de 5 dias ao lado (ganhando/perdendo força na semana).
 *  Regra clássica: comprar a forte × vender a fraca. Isolado; só usa preço (grátis). */
export default function ForexStrengthMeter({ quotes }: { quotes: ForexQuote[] }) {
  const strength = computeCurrencyStrength(quotes);
  // Força de 5 dias: % de variação de cada par nas últimas 5 velas diárias → mesma conta.
  const [trend, setTrend] = useState<Record<string, number>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(TREND_PAIRS.map((p) => fetchForexChart(p, "1d").then((c) => ({ p, c })).catch(() => ({ p, c: [] })))).then((res) => {
      if (!alive) return;
      const synth: ForexQuote[] = [];
      for (const { p, c } of res) {
        if (c.length < 6) continue;
        const last = c[c.length - 1].close;
        const prev = c[c.length - 6].close;
        if (prev > 0) synth.push({ pair: p, price: last, changePct: ((last - prev) / prev) * 100 } as ForexQuote);
      }
      if (synth.length) setTrend(Object.fromEntries(computeCurrencyStrength(synth).map((s) => [s.ccy, s.score])));
    });
    return () => {
      alive = false;
    };
  }, []);
  if (strength.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="text-sm font-semibold text-foreground">Força das moedas (24h)</h3>
        <p className="mt-2 text-sm text-muted-foreground">Carregando cotações…</p>
      </div>
    );
  }
  const max = Math.max(0.1, ...strength.map((s) => Math.abs(s.score)));
  const strongest = strength[0];
  const weakest = strength[strength.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Força das moedas · 24h
          <InfoTip text="Mostra quais moedas estão mais fortes e mais fracas no dia (barra) e a tendência dos últimos 5 dias (↑/↓ 5d). Calcula a média de quanto cada moeda subiu ou caiu contra todas as outras. Dica: comprar a forte e vender a fraca — e mais firme quando o dia e os 5 dias concordam." />
        </h3>
        {strongest && weakest && strongest.ccy !== weakest.ccy && (
          <span className="text-[11px] text-muted-foreground">
            mais forte <span className="font-semibold text-emerald-600 dark:text-emerald-400">{strongest.ccy}</span> · mais fraca <span className="font-semibold text-rose-600 dark:text-rose-400">{weakest.ccy}</span>
          </span>
        )}
      </div>
      <div className="space-y-1">
        {strength.map((s) => {
          const pos = s.score >= 0;
          const w = (Math.abs(s.score) / max) * 50; // metade da barra (centro = 0)
          return (
            <div key={s.ccy} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs font-semibold text-foreground">
                <span className="mr-1" aria-hidden>{FLAG[s.ccy] ?? ""}</span>
                {s.ccy}
              </span>
              <div className="relative h-3 flex-1 rounded-full bg-muted/40">
                <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                <div
                  className={`absolute top-0 h-full rounded-full ${pos ? "bg-emerald-500/80" : "bg-rose-500/80"}`}
                  style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </div>
              <span className={`num w-16 shrink-0 text-right text-xs font-semibold ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {s.score >= 0 ? "+" : ""}{s.score.toFixed(2)}%
              </span>
              {(() => {
                const t = trend[s.ccy];
                if (t == null) return <span className="w-12 shrink-0" aria-hidden />;
                const up = t > 0.12, down = t < -0.12;
                return (
                  <span className={`w-12 shrink-0 text-right text-[11px] font-semibold ${up ? "text-emerald-500" : down ? "text-rose-500" : "text-muted-foreground"}`} title="tendência da força nos últimos 5 dias">
                    {up ? "↑ 5d" : down ? "↓ 5d" : "→ 5d"}
                  </span>
                );
              })()}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Barra = força no dia (24h); ↑/↓ 5d = se a moeda vem ganhando ou perdendo força na semana. Quando os dois concordam, a tendência é mais firme. Comprar a forte × vender a fraca.</p>
    </div>
  );
}
