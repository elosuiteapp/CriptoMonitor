import { useEffect, useState } from "react";

import { usePersistentState } from "../../hooks/usePersistentState";
import { FOREX_PAIRS, fetchForexChart, fetchForexOverview, forexSessions, pairDecimals, type ForexCandle, type ForexQuote } from "../../lib/forex";
import type { ChartType, Timeframe } from "../../lib/marketData";
import ChartTypeSelector from "../ChartTypeSelector";
import { PillRow, TogglePill } from "../TogglePill";
import ForexChart from "./ForexChart";

const toneCls = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v >= 0 ? "text-emerald-500" : "text-rose-500");
const fmtPx = (v: number | null | undefined, dec: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

const GROUPS: { id: string; label: string }[] = [
  { id: "major", label: "Principais" },
  { id: "brl", label: "Real (BRL)" },
  { id: "cross", label: "Cruzamentos" },
  { id: "index", label: "Índice" },
];

/** Módulo FOREX — cockpit de câmbio (pares, sessões, gráfico). Isolado dos demais
 *  módulos: usa só lib/forex + primitivos compartilhados (ChartTypeSelector/TogglePill). */
export default function ForexModule({ pair, onPair }: { pair: string; onPair: (s: string) => void }) {
  const [tf, setTf] = usePersistentState<Timeframe>("cm.fx-tf", "1d");
  const [chartType, setChartType] = usePersistentState<ChartType>("cm.fx-charttype", "candles");
  const [showEma, setShowEma] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);

  const [candles, setCandles] = useState<ForexCandle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [overview, setOverview] = useState<ForexQuote[]>([]);

  useEffect(() => {
    let alive = true;
    setChartLoading(true);
    fetchForexChart(pair, tf).then((c) => {
      if (!alive) return;
      setCandles(c);
      setChartLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair, tf]);

  useEffect(() => {
    let alive = true;
    fetchForexOverview().then((q) => alive && setOverview(q));
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") fetchForexOverview().then((q) => alive && setOverview(q));
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const dec = pairDecimals(pair);
  const quote = overview.find((q) => q.pair === pair);
  const meta = FOREX_PAIRS.find((p) => p.symbol === pair);
  const { sessions, weekend } = forexSessions();
  const qOf = (sym: string) => overview.find((q) => q.pair === sym);

  return (
    <div className="space-y-4">
      {/* Painel de moedas — acompanha todos os pares; clique troca o par ativo */}
      <div className="rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Painel de moedas</div>
        {GROUPS.map((g) => {
          const items = FOREX_PAIRS.filter((p) => p.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="mb-1.5 last:mb-0">
              <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((p) => {
                  const q = qOf(p.symbol);
                  const active = p.symbol === pair;
                  return (
                    <button
                      key={p.symbol}
                      onClick={() => onPair(p.symbol)}
                      title={p.name}
                      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${active ? "border-primary/50 bg-primary/10 text-foreground" : "border-border hover:bg-muted"}`}
                    >
                      <span className="font-semibold text-foreground">{p.symbol}</span>
                      <span className="num text-muted-foreground">{fmtPx(q?.price, pairDecimals(p.symbol))}</span>
                      <span className={`num ${toneCls(q?.changePct)}`}>{fmtPct(q?.changePct)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Par selecionado + sessões */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">{pair}</span>
            {meta && <span className="ml-2 text-xs text-muted-foreground">{meta.name}</span>}
            <div className="num text-3xl font-bold text-foreground">{fmtPx(quote?.price, dec)}</div>
          </div>
          <span className={`text-sm font-semibold ${toneCls(quote?.changePct)}`}>{fmtPct(quote?.changePct)} · dia</span>
        </div>

        {/* Sessões de mercado (FX 24h) */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sessões</span>
          {sessions.map((s) => (
            <span key={s.name} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${s.open ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${s.open ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              {s.name}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground">{weekend ? "· fim de semana (mercado fechado)" : "· horário aproximado (UTC)"}</span>
        </div>

        {/* Controles + gráfico */}
        <div className="mt-3 space-y-2">
          <ChartTypeSelector chartType={chartType} onChartType={setChartType} timeframe={tf} onTimeframe={setTf} />
          <PillRow label="Indicadores:">
            <TogglePill label="Médias (EMA 9/21/50)" active={showEma} onToggle={() => setShowEma((v) => !v)} color="bg-amber-500" desc="Médias móveis exponenciais de 9, 21 e 50 — tendência e suportes/resistências dinâmicos." />
            <TogglePill label="Bollinger" active={showBollinger} onToggle={() => setShowBollinger((v) => !v)} color="bg-sky-500" desc="Bandas de Bollinger (20 ± 2σ) — volatilidade e reversão à média." />
            <TogglePill label="Volume Profile" active={showVolumeProfile} onToggle={() => setShowVolumeProfile((v) => !v)} color="bg-fuchsia-500" desc="Perfil de volume da janela visível: POC + topo (VAH) e base (VAL) da área de valor." />
          </PillRow>
          {chartLoading ? (
            <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
          ) : candles.length < 2 ? (
            <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">Sem dados para {pair}.</div>
          ) : (
            <ForexChart candles={candles} chartType={chartType} decimals={dec} showEma={showEma} showBollinger={showBollinger} showVolumeProfile={showVolumeProfile} />
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Câmbio via Yahoo Finance (atraso). Educacional — não é recomendação. Em breve: Leitura do Mercado (confluência), carry/diferencial de juros, correlações e calendário econômico.
      </p>
    </div>
  );
}
