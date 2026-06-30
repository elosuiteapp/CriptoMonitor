import { FOREX_PAIRS, pairCarry, type Carry } from "../../lib/forex";
import InfoTip from "../InfoTip";

/** Ranking de Carry Trade — pares ordenados pelo diferencial de juros (quanto rende
 *  carregar comprado). Estratégia clássica do FX: comprar moeda de juro alto contra
 *  juro baixo. Estático (taxas básicas mudam raro). Isolado; sem rede. */
export default function ForexCarryRanking({ onPick }: { onPick?: (pair: string) => void }) {
  const ranked = FOREX_PAIRS.map((p) => ({ sym: p.symbol, carry: pairCarry(p.symbol) }))
    .filter((x): x is { sym: string; carry: Carry } => x.carry != null)
    .sort((a, b) => b.carry.diff - a.carry.diff);
  if (ranked.length === 0) return null;
  const max = Math.max(0.5, ...ranked.map((r) => Math.abs(r.carry.diff)));

  const Row = ({ sym, carry }: { sym: string; carry: Carry }) => {
    const pos = carry.diff >= 0;
    const w = (Math.abs(carry.diff) / max) * 50;
    return (
      <button
        key={sym}
        onClick={() => onPick?.(sym)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/50"
        title="Abrir o par"
      >
        <span className="w-16 shrink-0 text-xs font-semibold text-foreground">{sym}</span>
        <div className="relative h-2.5 flex-1 rounded-full bg-muted/40">
          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
          <div className={`absolute top-0 h-full rounded-full ${pos ? "bg-emerald-500/80" : "bg-rose-500/80"}`} style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />
        </div>
        <span className={`num w-20 shrink-0 text-right text-xs font-semibold ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {carry.diff >= 0 ? "+" : ""}{carry.diff.toFixed(2)}% a.a.
        </span>
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        Carry trade · ranking de juros
        <InfoTip text="Carry é o juro que você ganha (ou paga) por carregar o par. Verde = comprar o par RENDE juros (moeda comprada paga mais que a vendida); vermelho = paga juros. Estratégia clássica: comprar moeda de juro alto contra moeda de juro baixo." />
      </h3>
      <div className="space-y-0.5">
        {ranked.map((r) => (
          <Row key={r.sym} sym={r.sym} carry={r.carry} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Diferencial de juros do par (a.a.). <span className="text-emerald-600 dark:text-emerald-400">Verde</span> = comprar RENDE juros (carry positivo) · <span className="text-rose-600 dark:text-rose-400">vermelho</span> = paga (favorece vender). Estratégia clássica: comprar juro alto × vender juro baixo. Taxas básicas aprox.</p>
    </div>
  );
}
