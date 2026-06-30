import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import InfoTip from "./InfoTip";

interface FmpMacro {
  yieldCurve: { date: string; m1: number | null; m3: number | null; m6: number | null; y1: number | null; y2: number | null; y3: number | null; y5: number | null; y7: number | null; y10: number | null } | null;
  spread2s10s: number | null;
  indicators: { cpiYoY: number | null; cpiDate: string; unemployment: number | null; fedFunds: number | null; gdp: number | null };
  commodities?: { gold: { price: number | null; changePct: number | null }; oil: { price: number | null; changePct: number | null } };
}

// Cache simples (módulo) — dado diário, evita refetch a cada troca de aba.
let _cache: { t: number; data: FmpMacro | null } | null = null;

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "up" | "down" | "neutral" }) {
  const tc = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      <div className={`text-[11px] ${tc}`}>{sub}</div>
    </div>
  );
}

/** Macro EUA via FMP — curva de juros do Tesouro + inflação/desemprego/Fed/PIB.
 *  Dado market-wide (o dólar/Fed move tudo) → aba Macro de qualquer módulo. */
export default function MacroUsPanel() {
  const [data, setData] = useState<FmpMacro | null>(_cache?.data ?? null);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    if (_cache && Date.now() - _cache.t < 600_000) {
      setData(_cache.data);
      setLoading(false);
      return;
    }
    let alive = true;
    supabase.functions.invoke("fmp-macro").then(({ data: d, error }) => {
      if (!alive) return;
      const fm = error || !d ? null : (d as FmpMacro);
      _cache = { t: Date.now(), data: fm };
      setData(fm);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="h-40 animate-pulse rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60" />;
  if (!data?.yieldCurve) return null;

  const yc = data.yieldCurve;
  const tenors: { lbl: string; v: number | null }[] = [
    { lbl: "1M", v: yc.m1 }, { lbl: "3M", v: yc.m3 }, { lbl: "6M", v: yc.m6 },
    { lbl: "1A", v: yc.y1 }, { lbl: "2A", v: yc.y2 }, { lbl: "3A", v: yc.y3 },
    { lbl: "5A", v: yc.y5 }, { lbl: "7A", v: yc.y7 }, { lbl: "10A", v: yc.y10 },
  ];
  const vals = tenors.map((t) => t.v).filter((v): v is number => v != null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const rng = hi - lo || 1;
  const W = 100, H = 28;
  const pts = tenors.map((t, i) => (t.v == null ? null : `${((i / (tenors.length - 1)) * W).toFixed(1)},${(H - ((t.v - lo) / rng) * (H - 4) - 2).toFixed(1)}`)).filter(Boolean).join(" ");
  const sp = data.spread2s10s;
  const ind = data.indicators;

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Macro EUA · Tesouro & indicadores
          <InfoTip text="Saúde da economia dos EUA, que move dólar, bolsa e cripto. Curva de juros = juros pagos por prazo (1 mês a 10 anos); quando a de 2 anos fica MAIOR que a de 10 (curva invertida) costuma anteceder recessão. Embaixo: inflação (CPI), desemprego, juro do Fed e PIB." />
        </h3>
        {sp != null && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sp < 0 ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
            curva 2s10s {sp >= 0 ? "+" : ""}{sp.toFixed(2)} — {sp < 0 ? "invertida (alerta de recessão)" : "normal"}
          </span>
        )}
      </div>

      {/* Curva de juros */}
      <div className="rounded-xl border border-border/70 bg-background/40 p-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Curva de juros do Tesouro EUA</span>
          <span className="num normal-case">{yc.date}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mb-1 h-10 w-full">
          <polyline points={pts} fill="none" className="stroke-primary" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-9">
          {tenors.map((t) => (
            <div key={t.lbl} className="text-center">
              <div className="text-[10px] text-muted-foreground">{t.lbl}</div>
              <div className="num text-[11px] font-semibold text-foreground">{t.v == null ? "—" : t.v.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Indicadores macro */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cell label="Inflação (CPI a/a)" value={pct(ind.cpiYoY)} sub={ind.cpiYoY != null ? (ind.cpiYoY > 3 ? "acima da meta" : ind.cpiYoY < 2 ? "abaixo da meta" : "perto da meta") : ind.cpiDate} tone={ind.cpiYoY != null && ind.cpiYoY > 3 ? "down" : "neutral"} />
        <Cell label="Desemprego" value={pct(ind.unemployment)} sub={ind.unemployment != null ? (ind.unemployment < 4 ? "mercado apertado" : ind.unemployment > 5 ? "afrouxando" : "saudável") : ""} />
        <Cell label="Fed Funds" value={pct(ind.fedFunds)} sub="juro básico EUA" />
        <Cell label="PIB EUA" value={ind.gdp != null ? `US$ ${(ind.gdp / 1000).toFixed(2)} tri` : "—"} sub="anualizado" />
      </div>
      {/* Commodities — risco/inflação e moedas-commodity */}
      {data.commodities && (data.commodities.gold.price != null || data.commodities.oil.price != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border/70 bg-background/40 p-2.5 text-xs">
          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
            Commodities
            <InfoTip text="Ouro = proteção/medo (sobe no risk-off; ligado a AUD). Petróleo = inflação e moedas-commodity (CAD, NOK). Movem também as ações de mineração/petróleo da B3." />
          </span>
          {data.commodities.gold.price != null && (
            <span>🥇 Ouro <span className="num font-semibold text-foreground">US$ {data.commodities.gold.price.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span> <span className={`num ${(data.commodities.gold.changePct ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{pct(data.commodities.gold.changePct)}</span></span>
          )}
          {data.commodities.oil.price != null && (
            <span>🛢️ Petróleo (Brent) <span className="num font-semibold text-foreground">US$ {data.commodities.oil.price.toFixed(2)}</span> <span className={`num ${(data.commodities.oil.changePct ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{pct(data.commodities.oil.changePct)}</span></span>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">Juros e inflação dos EUA movem o dólar, a bolsa e o cripto. Curva invertida (2A &gt; 10A) costuma anteceder recessão. Fonte: FMP.</p>
    </div>
  );
}
