import { useEffect, useState } from "react";

import { fetchB3Macro, type B3MacroData } from "../../lib/b3";
import { Cell, fmtNum, fmtPct, selicAA, toneCls } from "./B3Shared";

/** Barra de correlação (-1 a +1) com linha central. */
function CorrBar({ name: label, c30, c90 }: { name: string; c30: number | null; c90: number | null }) {
  const v = c30 ?? 0;
  const pct = Math.max(-1, Math.min(1, v)); // -1..1
  const widthPct = Math.abs(pct) * 50; // metade da barra
  const pos = pct >= 0;
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={`num font-semibold ${c30 == null ? "text-muted-foreground" : pos ? "text-emerald-500" : "text-rose-500"}`}>{c30 == null ? "—" : c30.toFixed(2)}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-muted/50">
        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
        <div
          className={`absolute top-0 h-full rounded-full ${pos ? "bg-emerald-500/70" : "bg-rose-500/70"}`}
          style={pos ? { left: "50%", width: `${widthPct}%` } : { right: "50%", width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">90d: {c90 == null ? "—" : c90.toFixed(2)}</div>
    </div>
  );
}

function readMacro(d: B3MacroData): string {
  const sp = d.globals.find((g) => g.symbol === "S&P 500")?.changePct ?? null;
  const dollar = d.globals.find((g) => g.symbol === "Dólar")?.changePct ?? null;
  const vix = d.globals.find((g) => g.symbol === "VIX")?.price ?? null;
  const bits: string[] = [];
  if (sp != null) bits.push(sp >= 0 ? "EUA em alta (risk-on)" : "EUA em baixa (risk-off)");
  if (dollar != null) bits.push(dollar <= 0 ? "dólar cede (favorável ao IBOV)" : "dólar sobe (pressão no IBOV)");
  if (vix != null) bits.push(vix < 18 ? "VIX baixo (calmo)" : vix > 25 ? "VIX alto (estresse)" : "VIX moderado");
  const score = (sp != null ? (sp >= 0 ? 1 : -1) : 0) + (dollar != null ? (dollar <= 0 ? 1 : -1) : 0) + (vix != null ? (vix < 20 ? 1 : -1) : 0);
  const verdict = score >= 2 ? "Pano de fundo favorável" : score <= -2 ? "Pano de fundo adverso" : "Pano de fundo misto";
  return `${verdict} para a B3 — ${bits.join(", ")}.`;
}

/** Macro & Correlações da B3: macro BR + macro global + correlações do IBOV. */
export default function B3MacroTab() {
  const [d, setD] = useState<B3MacroData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchB3Macro().then((r) => {
      if (!alive) return;
      setD(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!d) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Macro indisponível no momento.</div>;

  return (
    <div className="space-y-4">
      {/* Síntese */}
      <div className="rounded-2xl border border-primary/30 bg-card p-4 dark:bg-card/60">
        <p className="text-sm text-foreground">{readMacro(d)}</p>
      </div>

      {/* Macro BR */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Macro Brasil</h3>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Selic (a.a.)" value={selicAA(d.macro.selic) != null ? `${selicAA(d.macro.selic)!.toFixed(2)}%` : "—"} sub="taxa básica" />
          <Cell label="IPCA (mês)" value={d.macro.ipca != null ? `${d.macro.ipca.toFixed(2)}%` : "—"} sub="inflação" />
          <Cell label="Dólar PTAX" value={d.macro.usd_brl != null ? `R$ ${d.macro.usd_brl.toFixed(4)}` : "—"} sub="BCB" />
        </div>
      </div>

      {/* Macro global */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Mercado global</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {d.globals.map((g) => (
            <Cell key={g.symbol} label={g.symbol} value={fmtNum(g.price, g.symbol === "VIX" ? 2 : 0)} sub={<span className={toneCls(g.changePct)}>{fmtPct(g.changePct)}</span>} />
          ))}
        </div>
      </div>

      {/* Correlações do IBOV */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Correlação do IBOV (30 dias)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {d.correlations.map((c) => (
            <CorrBar key={c.ref} name={c.ref} c30={c.c30} c90={c.c90} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Correlação de retornos diários. +1 = anda junto · −1 = anda ao contrário. Fonte: Yahoo Finance + BCB.</p>
      </div>
    </div>
  );
}
