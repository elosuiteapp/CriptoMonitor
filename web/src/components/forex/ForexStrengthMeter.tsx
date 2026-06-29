import { computeCurrencyStrength, type ForexQuote } from "../../lib/forex";

const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", BRL: "🇧🇷" };

/** Medidor de Força das Moedas (Currency Strength) — padrão do FX. Mostra cada moeda
 *  da mais FORTE à mais FRACA pela média do movimento dela contra as outras (24h).
 *  Regra clássica: comprar a forte × vender a fraca. Isolado; só usa preço (grátis). */
export default function ForexStrengthMeter({ quotes }: { quotes: ForexQuote[] }) {
  const strength = computeCurrencyStrength(quotes);
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
        <h3 className="text-sm font-semibold text-foreground">Força das moedas · 24h</h3>
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
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Força = média do movimento da moeda contra todas as outras (24h). Verde = forte · vermelho = fraca. Tendência: comprar a forte × vender a fraca.</p>
    </div>
  );
}
