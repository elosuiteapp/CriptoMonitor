import { useEffect, useState } from "react";

import { useT } from "../lib/i18n";
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
  const { t } = useT();
  const tri = (busd: number | null) =>
    busd == null ? "—" : `${t.macroGlobal.triPrefix}${(busd / 1000).toFixed(2)}${t.macroGlobal.triSuffix}`;
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
  const verdict = score >= 1 ? { t: t.macroGlobal.riskOn, c: "text-emerald-500" } : score <= -1 ? { t: t.macroGlobal.riskOff, c: "text-rose-500" } : { t: t.macroGlobal.neutral, c: "text-muted-foreground" };

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {t.macroGlobal.title}
          <InfoTip text={t.macroGlobal.tip} />
        </h3>
        <span className={`shrink-0 text-xs font-semibold ${verdict.c}`}>{verdict.t}</span>
      </div>

      {/* Destaque: net liquidity do Fed */}
      <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t.macroGlobal.fedNetLiq}</span>
          <div className="num text-2xl font-bold leading-none text-foreground">{tri(row.net_liquidity_busd)}</div>
        </div>
        {row.nl_chg_30d_pct != null && (
          <span className={`text-xs font-semibold ${nlUp ? "text-emerald-500" : "text-rose-500"}`}>
            {nlUp ? "↑" : "↓"} {row.nl_chg_30d_pct >= 0 ? "+" : ""}
            {row.nl_chg_30d_pct.toFixed(2)}% 30d · {t.macroGlobal.tide} {nlUp ? t.macroGlobal.tideRising : t.macroGlobal.tideFalling}
          </span>
        )}
      </div>

      {/* Grid de métricas */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Cell label={t.macroGlobal.conditions} value={row.nfci != null ? row.nfci.toFixed(2) : "—"} sub={nfciLoose ? t.macroGlobal.condLoose : t.macroGlobal.condTight} tone={nfciLoose ? "up" : "down"} />
        <Cell label={t.macroGlobal.hySpread} value={row.hy_spread != null ? `${row.hy_spread.toFixed(2)}%` : "—"} sub={hyTight ? t.macroGlobal.hyTight : t.macroGlobal.hyWide} tone={hyTight ? "up" : "down"} />
        <Cell label={t.macroGlobal.realYield} value={row.real_yield_10y != null ? `${row.real_yield_10y.toFixed(2)}%` : "—"} sub={t.macroGlobal.costOfMoney} tone="neutral" />
        <Cell label={t.macroGlobal.curve} value={row.yield_curve != null ? `${row.yield_curve >= 0 ? "+" : ""}${row.yield_curve.toFixed(2)}` : "—"} sub={inverted ? t.macroGlobal.curveInverted : t.macroGlobal.curveNormal} tone={inverted ? "down" : "neutral"} />
        <Cell label="M2" value={row.m2 != null ? `${t.macroGlobal.triPrefix}${(row.m2 / 1000).toFixed(1)}${t.macroGlobal.triSuffix}` : "—"} sub={t.macroGlobal.m2sub} tone="neutral" />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        {t.macroGlobal.footer}
      </p>
    </div>
  );
}
