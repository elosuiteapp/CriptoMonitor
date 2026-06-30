import { useEffect, useState } from "react";

import { cotForPair, fetchForexCot, type ForexCot } from "../../lib/forex";
import InfoTip from "../InfoTip";

const fmtSigned = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString("pt-BR")}`;

/** Posicionamento COT/CFTC do par — institucional × hedge funds × varejo (smart vs
 *  dumb money) + COT index (3 anos). Componente compartilhado entre o cockpit e o
 *  Smart Money do Forex. Busca os dados pelo par; não renderiza nada sem COT. */
export default function ForexCotCard({ pair }: { pair: string }) {
  const cotInfo = cotForPair(pair);
  const [cot, setCot] = useState<ForexCot | null>(null);

  useEffect(() => {
    let alive = true;
    setCot(null);
    if (cotInfo) fetchForexCot(cotInfo.currency).then((c) => alive && setCot(c));
    return () => {
      alive = false;
    };
  }, [pair, cotInfo?.currency]);

  if (!cot || !cotInfo) return null;

  const instBias = cot.assetMgrNet * cotInfo.direction; // >0 = favorável ao par
  const retailBias = cot.nonreptNet * cotInfo.direction;
  const diverge = Math.sign(instBias) !== 0 && Math.sign(retailBias) !== 0 && Math.sign(instBias) !== Math.sign(retailBias);
  const insight = diverge
    ? instBias > 0
      ? `Institucional comprado e varejo vendido em ${pair} — smart money acumulando o que o varejo larga (viés de alta).`
      : `Institucional vendido e varejo comprado em ${pair} — smart money distribuindo para o varejo (viés de baixa).`
    : `Institucional e varejo do mesmo lado (${instBias >= 0 ? "favoráveis" : "contra"} ${pair}) — sem divergência clara.`;
  const tiers = [
    { label: "Institucional (asset managers)", net: cot.assetMgrNet, chg: cot.assetMgrNetChg, bias: instBias, fade: false },
    { label: "Hedge funds (alavancados)", net: cot.levMoneyNet, chg: cot.levMoneyNetChg, bias: cot.levMoneyNet * cotInfo.direction, fade: false },
    { label: "Varejo (pequenos especuladores)", net: cot.nonreptNet, chg: cot.nonreptNetChg, bias: retailBias, fade: true },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Posicionamento (COT) · {cotInfo.currency}{cotInfo.proxy ? " (proxy)" : ""}
          <InfoTip text="Como os grandes players estão posicionados nos futuros da moeda (relatório COT da CFTC, semanal). Institucional (asset managers) = dinheiro 'esperto'; Varejo (pequenos) costuma estar errado nos extremos. Quando o institucional e o varejo estão em lados opostos, vale seguir o institucional." />
        </h3>
        <span className="text-[11px] text-muted-foreground">OI {fmtSigned(cot.openInterest).replace("+", "")} · CFTC {cot.reportDate}</span>
      </div>
      {cot.pctl != null && (() => {
        const p = cot.pctl;
        const hot = p >= 85 || p <= 15;
        // Lado real pelo sinal do líquido — o COT index mede a POSIÇÃO NA FAIXA,
        // não o lado: 0% = no piso da faixa (não significa "vendido").
        const side = cot.assetMgrNet >= 0 ? "comprado" : "vendido";
        // Janela em anos (rótulo amigável) — o histórico vai a ~3 anos.
        const span = cot.weeks / 52 >= 1.4 ? `~${Math.round(cot.weeks / 52)} anos` : `${cot.weeks} sem`;
        const zone = p >= 85 ? `${side} no topo da faixa de ${span} (perto da máxima)` : p <= 15 ? `${side} no piso da faixa de ${span} (perto da mínima)` : `${side}, dentro da faixa normal de ${span}`;
        const pairNote = hot ? ((p >= 85 ? 1 : -1) * cotInfo.direction > 0 ? `Esticado a favor de ${pair} — risco de realização/correção.` : `Esticado contra ${pair} — possível exaustão a favor de ${pair}.`) : "";
        return (
          <div className={`mb-3 rounded-xl border p-3 ${hot ? "border-amber-500/40 bg-amber-500/10" : "border-border/70 bg-background/40"}`}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 font-semibold uppercase tracking-wide text-muted-foreground">
                COT index · {span}
                <InfoTip text="Onde o posicionamento líquido do institucional está dentro da sua faixa histórica (até ~3 anos). Perto de 100% = no topo da faixa (extremo comprado); perto de 0% = no piso da faixa (extremo vendido para quem fica líquido vendido, ou long mais enxuto para quem fica comprado). Extremos costumam anteceder reversões — o lado lotado tem menos gente para continuar empurrando." />
              </span>
              <span className={`num font-bold ${hot ? "text-amber-500" : "text-foreground"}`}>{p}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-gradient-to-r from-rose-500/40 via-muted/40 to-emerald-500/40">
              <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background shadow" style={{ left: `${p}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Institucional {zone}.{pairNote ? ` ${pairNote}` : ""}</div>
          </div>
        );
      })()}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiers.map((t) => (
          <div key={t.label} className="rounded-xl border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.label}</div>
            <div className={`num text-lg font-bold ${t.fade ? "text-amber-500" : t.bias >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmtSigned(t.net)}</div>
            <div className="text-[11px] text-muted-foreground">semana {fmtSigned(t.chg)} · {t.net >= 0 ? "comprado" : "vendido"} em {cotInfo.currency}{t.fade ? " (contrário)" : t.bias >= 0 ? ` (favorável a ${pair})` : ` (contra ${pair})`}</div>
          </div>
        ))}
      </div>
      <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${diverge ? "bg-primary/10 text-foreground" : "bg-muted/40 text-muted-foreground"}`}>💡 {insight}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">Futuros de {cotInfo.currency} na CME (vs USD){cotInfo.proxy ? " — proxy p/ o cruzamento" : cotInfo.direction === -1 ? ` — comprado na moeda = vendido em ${pair}` : ""}. Varejo = contrário; institucional = smart money. Semanal (CFTC).</p>
    </div>
  );
}
