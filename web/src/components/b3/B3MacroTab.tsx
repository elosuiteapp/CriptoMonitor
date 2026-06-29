import { useEffect, useState } from "react";

import { fetchB3Macro, fetchMacroGlobal, globalTideScore, type B3MacroData, type B3MacroGlobal } from "../../lib/b3";
import { supabase } from "../../lib/supabase";
import { Cell, fmtNum, fmtPct, selicAA, toneCls } from "./B3Shared";

// ── Calendário econômico (helpers duplicados p/ isolar o módulo B3) ───────────
interface EconEvent { title: string; country: string; date: string; impact: string; forecast: string | null; previous: string | null }
const FLAG: Record<string, string> = { USD: "🇺🇸", BRL: "🇧🇷", EUR: "🇪🇺", JPY: "🇯🇵", GBP: "🇬🇧", CNY: "🇨🇳" };
const evDate = (s: string) => {
  const t = new Date(s);
  return Number.isFinite(t.getTime()) ? t.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : s;
};
function countdown(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const days = Math.round((a - today) / 86400000);
  if (days < 0) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}
function Stars({ impact }: { impact: string }) {
  const n = impact === "High" ? 3 : impact === "Medium" ? 2 : 1;
  const color = impact === "High" ? "text-rose-500" : "text-amber-500";
  return (
    <span className="shrink-0 tracking-tighter" title={`Impacto ${impact === "High" ? "alto" : impact === "Medium" ? "médio" : "baixo"}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? color : "text-muted-foreground/30"}>★</span>
      ))}
    </span>
  );
}

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
  const [mg, setMg] = useState<B3MacroGlobal | null>(null);
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchB3Macro(), fetchMacroGlobal()]).then(([r, g]) => {
      if (!alive) return;
      setD(r);
      setMg(g);
      setLoading(false);
    });
    // Calendário: EUA (motor do risco global) + Brasil — eventos que mexem na B3.
    supabase.functions.invoke("econ-calendar", { body: { countries: ["USD", "BRL"] } }).then(({ data }) => {
      if (alive) setEvents(((data as { events?: EconEvent[] })?.events ?? []) as EconEvent[]);
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

      {/* Expectativas (Focus) */}
      {d.focus && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Expectativas do mercado · Focus {d.focus.year}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cell label="IPCA (ano)" value={d.focus.ipca != null ? `${d.focus.ipca.toFixed(2)}%` : "—"} sub="inflação esperada" />
            <Cell label="Selic (fim de ano)" value={d.focus.selic != null ? `${d.focus.selic.toFixed(2)}%` : "—"} sub="expectativa" />
            <Cell label="PIB" value={d.focus.pib != null ? `${d.focus.pib.toFixed(2)}%` : "—"} sub="crescimento" />
            <Cell label="Câmbio (fim de ano)" value={d.focus.cambio != null ? `R$ ${d.focus.cambio.toFixed(2)}` : "—"} sub="dólar esperado" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Mediana das projeções do mercado — Boletim Focus (BCB).</p>
        </div>
      )}

      {/* ADRs — prêmio/desconto */}
      {d.adrs && d.adrs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-1 text-sm font-semibold text-foreground">ADRs · prêmio/desconto vs ação local</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">Termômetro do estrangeiro: ADR em prêmio = demanda lá fora · desconto = saída.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {d.adrs.map((a) => (
              <Cell
                key={a.ticker}
                label={`${a.name} (${a.ticker})`}
                value={<span className={toneCls(a.premiumPct)}>{`${a.premiumPct >= 0 ? "+" : ""}${a.premiumPct.toFixed(2)}%`}</span>}
                sub={a.premiumPct >= 0 ? "prêmio (NYSE)" : "desconto (NYSE)"}
              />
            ))}
          </div>
        </div>
      )}

      {/* Maré global (Fed / EUA — FRED) — pano de fundo risk-on/off da bolsa BR */}
      {mg &&
        (() => {
          const tide = globalTideScore(mg);
          return (
            <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">Maré global · Fed / EUA</h3>
                {tide && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tide.score >= 25 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : tide.score <= -25 ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`}>
                    {tide.label}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Cell label="Liquidez Fed" value={mg.netLiquidityBusd != null ? `$${(mg.netLiquidityBusd / 1000).toFixed(2)} tri` : "—"} sub={mg.nlChg30dPct != null ? <span className={toneCls(mg.nlChg30dPct)}>{`${mg.nlChg30dPct >= 0 ? "+" : ""}${mg.nlChg30dPct.toFixed(1)}% 30d`}</span> : "var. 30d"} />
                <Cell label="Juros real 10y" value={mg.realYield10y != null ? `${mg.realYield10y.toFixed(2)}%` : "—"} sub={mg.realYield10y != null ? (mg.realYield10y > 2 ? "alto (pressiona)" : mg.realYield10y < 1.5 ? "baixo (alivia)" : "moderado") : ""} />
                <Cell label="Spread HY" value={mg.hySpread != null ? `${mg.hySpread.toFixed(2)}%` : "—"} sub={mg.hySpread != null ? (mg.hySpread < 3.5 ? "apertado (calmo)" : mg.hySpread > 5 ? "largo (estresse)" : "moderado") : ""} />
                <Cell label="Cond. fin. (NFCI)" value={mg.nfci != null ? mg.nfci.toFixed(2) : "—"} sub={mg.nfci != null ? (mg.nfci < 0 ? "frouxas (risk-on)" : "apertadas") : ""} />
                <Cell label="Curva 2s10s" value={mg.yieldCurve != null ? `${mg.yieldCurve >= 0 ? "+" : ""}${mg.yieldCurve.toFixed(2)}` : "—"} sub={mg.yieldCurve != null ? (mg.yieldCurve < 0 ? "invertida (alerta)" : "normal") : ""} />
                <Cell label="M2 (EUA)" value={mg.m2 != null ? `$${(mg.m2 / 1000).toFixed(1)} tri` : "—"} sub="oferta de moeda" />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Pano de fundo global (Fed/EUA · FRED) — a bolsa BR é ativo de risco e segue a liquidez e os juros lá fora.</p>
            </div>
          );
        })()}

      {/* Macro global */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Mercado global</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {d.globals.map((g) => (
            <Cell key={g.symbol} label={g.symbol} value={fmtNum(g.price, g.symbol === "VIX" ? 2 : 0)} sub={<span className={toneCls(g.changePct)}>{fmtPct(g.changePct)}</span>} />
          ))}
        </div>
      </div>

      {/* Calendário econômico (EUA + Brasil) */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-foreground">Calendário econômico · EUA + Brasil</h3>
          <span className="text-[11px] text-muted-foreground">eventos que mexem na B3</span>
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">Sem eventos de alto/médio impacto nos próximos dias (ou carregando…).</p>
        ) : (
          <div className="mt-3 space-y-2">
            {events.map((e, i) => {
              const cd = countdown(e.date);
              return (
                <div key={`${e.title}-${e.date}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-sm leading-none" title={e.country} aria-hidden>{FLAG[e.country] ?? "🏳"}</span>
                    <Stars impact={e.impact} />
                    <span className="truncate text-foreground">{e.title}</span>
                    {cd && (
                      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${cd === "hoje" ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "border-border text-muted-foreground"}`}>{cd}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                    {(e.forecast || e.previous) && <span className="num hidden md:inline">ant. {e.previous ?? "—"} · est. {e.forecast ?? "—"}</span>}
                    <span className="num whitespace-nowrap">{evDate(e.date)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">Alto/médio impacto dos EUA (motor do risco global) e do Brasil. ★★★ alto · ★★ médio. Fonte: ForexFactory.</p>
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
