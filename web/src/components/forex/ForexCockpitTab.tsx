import { useEffect, useState } from "react";

import { usePersistentState } from "../../hooks/usePersistentState";
import { FOREX_PAIRS, fetchForexChart, fetchForexOverview, forexSessions, pairCarry, pairDecimals, type ForexCandle, type ForexQuote } from "../../lib/forex";
import type { ChartType, Timeframe } from "../../lib/marketData";
import ChartTypeSelector from "../ChartTypeSelector";
import InfoTip from "../InfoTip";
import { PillRow, TogglePill } from "../TogglePill";
import ForexChart from "./ForexChart";
import ForexCotCard from "./ForexCotCard";
import ForexNewsBlock from "./ForexNewsBlock";
import ForexRange52w from "./ForexRange52w";
import ForexStrengthMeter from "./ForexStrengthMeter";

const toneCls = (v: number | null | undefined) => (v == null ? "text-muted-foreground" : v >= 0 ? "text-emerald-500" : "text-rose-500");
const fmtPx = (v: number | null | undefined, dec: number) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

const GROUPS: { id: string; label: string }[] = [
  { id: "major", label: "Principais" },
  { id: "brl", label: "Real (BRL)" },
  { id: "cross", label: "Cruzamentos" },
  { id: "exotic", label: "Exóticos" },
  { id: "index", label: "Índice" },
];

/** Grupos sempre visíveis no painel colapsado — principais + índice do dólar. */
const COLLAPSED_GROUPS = ["major", "index"];

/** Cockpit do módulo Forex — painel de moedas, par selecionado, sessões e gráfico. */
export default function ForexCockpitTab({ pair, onPair }: { pair: string; onPair: (s: string) => void }) {
  const [tf, setTf] = usePersistentState<Timeframe>("cm.fx-tf", "1d");
  const [chartType, setChartType] = usePersistentState<ChartType>("cm.fx-charttype", "candles");
  const [panelOpen, setPanelOpen] = usePersistentState<boolean>("cm.fx-panel-open", false);
  const [showEma, setShowEma] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);

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
  const carry = pairCarry(pair);
  const qOf = (sym: string) => overview.find((q) => q.pair === sym);

  // Painel colapsável: mostra só principais + DXY (e o grupo do par ativo, p/ ele
  // nunca sumir); "ver todos" expande Real/Cruzamentos/Exóticos.
  const activeGroup = meta?.group;
  const visibleGroups = panelOpen ? GROUPS : GROUPS.filter((g) => COLLAPSED_GROUPS.includes(g.id) || g.id === activeGroup);
  const hiddenCount = panelOpen ? 0 : FOREX_PAIRS.filter((p) => !COLLAPSED_GROUPS.includes(p.group) && p.group !== activeGroup).length;

  return (
    <div className="space-y-4">
      {/* Painel de moedas — acompanha todos os pares; clique troca o par ativo */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Painel de moedas
            <InfoTip text="Cotação e variação no dia de todos os pares, agrupados (principais, real, cruzamentos, exóticos e o índice do dólar DXY). Clique em qualquer par para abri-lo no gráfico." />
          </div>
          {hiddenCount > 0 || panelOpen ? (
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {panelOpen ? "ver menos" : `ver todos (${hiddenCount})`}
            </button>
          ) : null}
        </div>
        {visibleGroups.map((g) => {
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

      {/* Força das moedas (Currency Strength) — qual moeda está forte/fraca agora */}
      <ForexStrengthMeter quotes={overview} />

      {/* Faixa de 52 semanas do par — esticado vs descontado */}
      <ForexRange52w pair={pair} />

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

        {/* Carry / diferencial de juros — motor central do FX */}
        {carry && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 pt-3 text-xs">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Carry (juros)
              <InfoTip text="Diferença de juros entre as duas moedas do par. Positivo = carregar o par comprado RENDE juros; negativo = paga juros. É um vento a favor (ou contra) de manter a posição." />
            </span>
            <span className={`num font-bold ${carry.diff >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{carry.diff >= 0 ? "+" : ""}{carry.diff.toFixed(2)}% a.a.</span>
            <span className="text-muted-foreground">
              {carry.base} {carry.baseRate.toFixed(2)}% − {carry.quote} {carry.quoteRate.toFixed(2)}% ·{" "}
              {carry.diff >= 0 ? `comprar ${pair} RENDE juros (carry positivo)` : `comprar ${pair} PAGA juros (carry negativo — favorece vender)`}
            </span>
            <span className="text-[10px] text-muted-foreground/70" title="Taxas básicas aproximadas; atualizar quando os bancos centrais mexerem.">· taxas aprox.</span>
          </div>
        )}

        {/* Controles + gráfico */}
        <div className="mt-3 space-y-2">
          <ChartTypeSelector chartType={chartType} onChartType={setChartType} timeframe={tf} onTimeframe={setTf} />
          <PillRow label="Indicadores:">
            <TogglePill label="Médias (EMA 9/21/50)" active={showEma} onToggle={() => setShowEma((v) => !v)} color="bg-amber-500" desc="Médias móveis exponenciais de 9, 21 e 50 — tendência e suportes/resistências dinâmicos." />
            <TogglePill label="Bollinger" active={showBollinger} onToggle={() => setShowBollinger((v) => !v)} color="bg-sky-500" desc="Bandas de Bollinger (20 ± 2σ) — volatilidade e reversão à média." />
            <TogglePill label="Perfil de preço (POC)" active={showVolumeProfile} onToggle={() => setShowVolumeProfile((v) => !v)} color="bg-fuchsia-500" desc="POC + área de valor (VAH/VAL) por TEMPO no preço — FX não tem volume real, então usamos tempo-no-preço (TPO)." />
            <TogglePill label="RSI (14)" active={showRsi} onToggle={() => setShowRsi((v) => !v)} color="bg-violet-500" desc="Índice de Força Relativa (14): acima de 70 = sobrecompra, abaixo de 30 = sobrevenda. Momento e exaustão." />
            <TogglePill label="MACD" active={showMacd} onToggle={() => setShowMacd((v) => !v)} color="bg-blue-500" desc="MACD (12/26/9): cruzamentos e histograma — força e virada de tendência." />
          </PillRow>
          {chartLoading ? (
            <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
          ) : candles.length < 2 ? (
            <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">Sem dados para {pair}.</div>
          ) : (
            <ForexChart candles={candles} chartType={chartType} decimals={dec} showEma={showEma} showBollinger={showBollinger} showVolumeProfile={showVolumeProfile} showRsi={showRsi} showMacd={showMacd} />
          )}
        </div>
      </div>

      {/* Posicionamento COT/CFTC — institucional × hedge funds × varejo (smart vs dumb money) */}
      <ForexCotCard pair={pair} />

      <ForexNewsBlock />
    </div>
  );
}
