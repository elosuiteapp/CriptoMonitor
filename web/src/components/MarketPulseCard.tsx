// Rotação do mercado cripto: dominância do BTC + market cap total (tabela `macro`, que o
// coletor JÁ grava — o dado existia e só alimentava um painel Pro). Compara agora vs ~7 dias
// atrás e traduz: dominância subindo = defensivo/BTC no comando; caindo com mercado subindo =
// apetite por altcoins (rotação risk-on). Card LIVRE (fonte própria, custo zero).
import { useEffect, useState } from "react";

import { getLocale } from "../hooks/useLocale";
import { supabase } from "../lib/supabase";
import InfoTip from "./InfoTip";

const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

interface Row {
  btc_dominance: number | null;
  total_mcap: number | null;
  ts: string;
}

const fmtT = (v: number) => {
  const loc = getLocale() === "en" ? "en-US" : "pt-BR";
  if (v >= 1e12) return `$${(v / 1e12).toLocaleString(loc, { maximumFractionDigits: 2 })} T`;
  if (v >= 1e9) return `$${(v / 1e9).toLocaleString(loc, { maximumFractionDigits: 0 })} B`;
  return `$${Math.round(v).toLocaleString(loc)}`;
};

export default function MarketPulseCard() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from("macro")
      .select("btc_dominance, total_mcap, ts")
      .order("ts", { ascending: false })
      .limit(400) // ~7 dias na cadência de 30 min
      .then(({ data }) => {
        if (active) setRows(((data as Row[]) ?? []).filter((r) => r.btc_dominance != null));
      });
    return () => {
      active = false;
    };
  }, []);

  if (rows && rows.length < 2) return null;

  let body: JSX.Element | null = null;
  if (rows) {
    const now = rows[0];
    const target = Date.parse(now.ts) - 7 * 86400000;
    let back = rows[rows.length - 1];
    for (const r of rows) if (Math.abs(Date.parse(r.ts) - target) < Math.abs(Date.parse(back.ts) - target)) back = r;
    const dom = now.btc_dominance ?? 0;
    const domD = dom - (back.btc_dominance ?? dom);
    const mc = now.total_mcap ?? null;
    const mcD = mc != null && back.total_mcap ? ((mc - back.total_mcap) / back.total_mcap) * 100 : null;
    const spanDays = Math.max(1, Math.round((Date.parse(now.ts) - Date.parse(back.ts)) / 86400000));

    const reading =
      domD >= 0.4
        ? tl("Dominância do BTC subindo — mercado defensivo: o capital está preferindo o Bitcoin às altcoins.", "BTC dominance rising — defensive market: capital is favoring Bitcoin over altcoins.")
        : domD <= -0.4 && (mcD ?? 0) > 0
          ? tl("Dominância caindo com o mercado subindo — apetite por altcoins (rotação risk-on).", "Dominance falling while the market rises — appetite for altcoins (risk-on rotation).")
          : domD <= -0.4
            ? tl("BTC perdendo dominância em mercado fraco — realização ampla, sem líder claro.", "BTC losing dominance in a weak market — broad de-risking, no clear leader.")
            : tl("Rotação estável — sem migração relevante entre BTC e altcoins na semana.", "Stable rotation — no meaningful BTC↔altcoin migration this week.");

    // Sparkline da dominância (ordem cronológica).
    const series = [...rows].reverse().map((r) => r.btc_dominance ?? dom);
    const mn = Math.min(...series);
    const mx = Math.max(...series);
    const w = 120;
    const h = 28;
    const pts = series
      .map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / Math.max(0.01, mx - mn)) * (h - 4)).toFixed(1)}`)
      .join(" ");

    body = (
      <>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tl("Dominância BTC", "BTC dominance")}</div>
            <div className="num text-xl font-bold text-foreground">{dom.toFixed(1)}%</div>
            <div className={`num text-xs font-semibold ${domD >= 0.05 ? "text-amber-500" : domD <= -0.05 ? "text-emerald-500" : "text-muted-foreground"}`}>
              {domD >= 0 ? "+" : ""}
              {domD.toFixed(1)} pp · {spanDays}d
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tl("Mercado cripto total", "Total crypto market")}</div>
            <div className="num text-xl font-bold text-foreground">{mc != null ? fmtT(mc) : "—"}</div>
            {mcD != null && (
              <div className={`num text-xs font-semibold ${mcD >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                {mcD >= 0 ? "+" : ""}
                {mcD.toFixed(1)}% · {spanDays}d
              </div>
            )}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tl("dominância · 7d", "dominance · 7d")}</div>
            <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-7 w-full max-w-[140px]" preserveAspectRatio="none">
              <polyline points={pts} fill="none" stroke={domD >= 0 ? "#f59e0b" : "#10b981"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <p className="mt-2 text-xs text-foreground">{reading}</p>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {tl("Rotação do mercado (BTC × altcoins)", "Market rotation (BTC × altcoins)")}
        <InfoTip
          text={tl(
            "Dominância = fatia do BTC no valor total do mercado cripto. Subindo = capital defensivo indo pro BTC; caindo com o mercado subindo = dinheiro rotacionando pras altcoins (perfil risk-on). Fonte: coleta própria (CoinGecko), a cada ~30 min.",
            "Dominance = BTC's share of total crypto market value. Rising = defensive capital moving into BTC; falling while the market rises = money rotating into altcoins (risk-on). Source: own collection (CoinGecko), every ~30 min.",
          )}
        />
      </h3>
      {body ?? <div className="mt-3 h-16 animate-pulse rounded-lg bg-muted/40" />}
    </div>
  );
}
