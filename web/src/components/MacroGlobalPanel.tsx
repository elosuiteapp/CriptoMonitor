import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import InfoTip from "./InfoTip";

interface MacroGlobalRow {
  net_liquidity_busd: number | null;
  nl_chg_30d_pct: number | null;
  real_yield_10y: number | null;
  hy_spread: number | null;
  nfci: number | null;
  yield_curve: number | null;
  m2: number | null;
  ts: string;
}

const tri = (busd: number | null) => (busd == null ? "—" : `US$ ${(busd / 1000).toFixed(2)} tri`);
const toneClass = (t: "up" | "down" | "neutral") =>
  t === "up" ? "text-emerald-500" : t === "down" ? "text-rose-500" : "text-muted-foreground";

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      <div className={`text-[11px] ${toneClass(tone)}`}>{sub}</div>
    </div>
  );
}

/** Maré de liquidez macro (FRED) — net liquidity do Fed + condições financeiras.
 *  Market-wide; vive na aba Macro & Correlações (Pro+). */
export default function MacroGlobalPanel() {
  const [row, setRow] = useState<MacroGlobalRow | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("macro_global")
      .select("net_liquidity_busd, nl_chg_30d_pct, real_yield_10y, hy_spread, nfci, yield_curve, m2, ts")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setRow((data as MacroGlobalRow) ?? null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!row) return null;

  const nlUp = (row.nl_chg_30d_pct ?? 0) >= 0;
  const nfciLoose = row.nfci != null && row.nfci < 0;
  const hyTight = (row.hy_spread ?? 4) < 3.5;
  const inverted = row.yield_curve != null && row.yield_curve < 0;
  const score = (nlUp ? 1 : -1) + (nfciLoose ? 1 : -1) + (hyTight ? 1 : -1);
  const verdict = score >= 1 ? { t: "Risk-on · vento a favor", c: "text-emerald-500" } : score <= -1 ? { t: "Risk-off · vento contra", c: "text-rose-500" } : { t: "Neutro", c: "text-muted-foreground" };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          🌊 Liquidez &amp; Macro Global
          <InfoTip text="A 'maré' que move o ciclo: liquidez líquida do Fed (balanço − reverse repo − conta do Tesouro) e condições financeiras. Maré subindo + condições frouxas = vento a favor de ativos de risco." />
        </h3>
        <span className={`shrink-0 text-xs font-semibold ${verdict.c}`}>{verdict.t}</span>
      </div>

      {/* Destaque: net liquidity do Fed */}
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Liquidez líquida do Fed</span>
          <div className="num text-2xl font-bold leading-none text-foreground">{tri(row.net_liquidity_busd)}</div>
        </div>
        {row.nl_chg_30d_pct != null && (
          <span className={`text-xs font-semibold ${nlUp ? "text-emerald-500" : "text-rose-500"}`}>
            {nlUp ? "↑" : "↓"} {row.nl_chg_30d_pct >= 0 ? "+" : ""}
            {row.nl_chg_30d_pct.toFixed(2)}% 30d · maré {nlUp ? "subindo" : "caindo"}
          </span>
        )}
      </div>

      {/* Grid de métricas */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label="Condições (NFCI)" value={row.nfci != null ? row.nfci.toFixed(2) : "—"} sub={nfciLoose ? "frouxas · risk-on" : "apertadas · risk-off"} tone={nfciLoose ? "up" : "down"} />
        <Cell label="HY spread" value={row.hy_spread != null ? `${row.hy_spread.toFixed(2)}%` : "—"} sub={hyTight ? "apertado · apetite" : "abrindo · cautela"} tone={hyTight ? "up" : "down"} />
        <Cell label="Juros reais 10Y" value={row.real_yield_10y != null ? `${row.real_yield_10y.toFixed(2)}%` : "—"} sub="custo do dinheiro" tone="neutral" />
        <Cell label="Curva 2s10s" value={row.yield_curve != null ? `${row.yield_curve >= 0 ? "+" : ""}${row.yield_curve.toFixed(2)}` : "—"} sub={inverted ? "invertida · alerta" : "normal"} tone={inverted ? "down" : "neutral"} />
        <Cell label="M2" value={row.m2 != null ? `US$ ${(row.m2 / 1000).toFixed(1)} tri` : "—"} sub="massa monetária" tone="neutral" />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Fonte: FRED (Fed de St. Louis) · net liquidity = balanço do Fed − reverse repo − conta do Tesouro · atualiza diariamente.
      </p>
    </div>
  );
}
