import { useEffect, useState } from "react";

import { fetchForexChart, pairDecimals } from "../../lib/forex";
import InfoTip from "../InfoTip";

/** Faixa de 52 semanas do par — onde o preço está entre a mínima e a máxima do ano.
 *  Leitura rápida do ativo escolhido: perto da máxima = esticado/forte; perto da
 *  mínima = descontado/pressionado. Calculado das velas diárias (sem rede extra). */
export default function ForexRange52w({ pair }: { pair: string }) {
  const [range, setRange] = useState<{ lo: number; hi: number; price: number; atrPct: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    setRange(null);
    fetchForexChart(pair, "1d").then((c) => {
      if (!alive || c.length < 30) return;
      const win = c.slice(-252); // ~52 semanas de pregões
      const hi = Math.max(...win.map((x) => x.high));
      const lo = Math.min(...win.map((x) => x.low));
      const price = win[win.length - 1].close;
      // ATR(14): amplitude verdadeira média dos últimos 14 dias (volatilidade típica).
      const last = c.slice(-15);
      let atrPct: number | null = null;
      if (last.length >= 15) {
        let sum = 0;
        for (let i = 1; i < last.length; i++) {
          const tr = Math.max(last[i].high - last[i].low, Math.abs(last[i].high - last[i - 1].close), Math.abs(last[i].low - last[i - 1].close));
          sum += tr;
        }
        const atr = sum / (last.length - 1);
        if (price > 0) atrPct = (atr / price) * 100;
      }
      if (Number.isFinite(hi) && Number.isFinite(lo) && hi > lo) setRange({ lo, hi, price, atrPct });
    });
    return () => {
      alive = false;
    };
  }, [pair]);

  if (!range) return null;
  const dec = pairDecimals(pair);
  const fx = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const pos = Math.max(0, Math.min(1, (range.price - range.lo) / (range.hi - range.lo)));
  const pct = Math.round(pos * 100);
  const zone = pos >= 0.66 ? { label: "metade superior · esticado/forte", cls: "text-emerald-600 dark:text-emerald-400" } : pos <= 0.33 ? { label: "metade inferior · descontado/pressionado", cls: "text-rose-600 dark:text-rose-400" } : { label: "meio da faixa", cls: "text-muted-foreground" };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Faixa de 52 semanas · {pair}
          <InfoTip text="Onde o preço de hoje está entre a mínima e a máxima dos últimos 12 meses. Perto da máxima (metade de cima) = momento forte, mas pode estar esticado; perto da mínima = descontado/pressionado." />
        </h3>
        <span className={`num text-xs font-semibold ${zone.cls}`}>{pct}% · {zone.label}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rose-500/40 via-muted/40 to-emerald-500/40">
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span className="num">{fx(range.lo)} mín</span>
        <span className="num">{fx(range.hi)} máx</span>
      </div>
      {range.atrPct != null && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wider">Volatilidade (ATR 14d)</span>
          <InfoTip text="Quanto o par costuma andar por dia, em média (Average True Range). Serve de referência pro tamanho de stop e alvo: stops menores que isso são facilmente estourados pelo ruído normal." />
          <span className={`num font-semibold ${range.atrPct >= 0.8 ? "text-amber-500" : "text-foreground"}`}>~{range.atrPct.toFixed(2)}% ao dia</span>
          <span>· ~{fx((range.atrPct / 100) * range.price)} de oscilação típica</span>
        </div>
      )}
    </div>
  );
}
