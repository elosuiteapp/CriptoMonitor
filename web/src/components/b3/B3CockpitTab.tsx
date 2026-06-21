import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3Fundamentals, fetchB3Overview, type B3Candle, type B3Fund, type B3Overview, type B3Quote } from "../../lib/b3";
import type { ChartType, Timeframe } from "../../lib/marketData";
import ChartTypeSelector from "../ChartTypeSelector";
import { PillRow, TogglePill } from "../TogglePill";
import B3Chart from "./B3Chart";
import { B3AssetIcon, Cell, fmtAssetPrice, fmtBRL, fmtBig, fmtNum, fmtPct, fmtVol, selicAA, toneCls } from "./B3Shared";

/** Linha da tabela de desempenho (preço + retorno dia/semana/15d/30d). */
function PerfRow({ q, active, onClick }: { q: B3Quote; active: boolean; onClick: () => void }) {
  const cell = (v: number | null | undefined) => <td className={`num px-3 py-2 text-right ${toneCls(v ?? null)}`}>{fmtPct(v ?? null)}</td>;
  return (
    <tr onClick={onClick} className={`cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted ${active ? "bg-primary/10" : ""}`}>
      <td className="px-3 py-2 font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <B3AssetIcon symbol={q.symbol} kind={q.kind} />
          {q.symbol}
        </span>
      </td>
      <td className="num px-3 py-2 text-right text-foreground">{fmtNum(q.price, q.kind === "index" ? 0 : 2)}</td>
      {cell(q.changePct)}
      {cell(q.w1)}
      {cell(q.d15)}
      {cell(q.d30)}
    </tr>
  );
}

/** Cockpit Principal da B3: macro BR + watchlist + gráfico + fundamentos do ativo. */
export default function B3CockpitTab({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [ov, setOv] = useState<B3Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<B3Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [fund, setFund] = useState<B3Fund | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [showEma, setShowEma] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchB3Overview().then((o) => {
      if (!alive) return;
      setOv(o);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setFund(null);
    fetchB3Fundamentals(asset).then((f) => alive && setFund(f));
    return () => {
      alive = false;
    };
  }, [asset]);

  useEffect(() => {
    let alive = true;
    setChartLoading(true);
    fetchB3Chart(asset, timeframe).then((c) => {
      if (alive) {
        setCandles(c);
        setChartLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [asset, timeframe]);

  const selQuote = useMemo(() => ov?.quotes.find((q) => q.symbol === asset) ?? null, [ov, asset]);
  const ibov = ov?.quotes.find((q) => q.symbol === "IBOV");
  const dollar = ov?.quotes.find((q) => q.symbol === "USD/BRL");

  if (loading) return <div className="h-24 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!ov) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Dados da B3 indisponíveis no momento.</div>;

  return (
    <div className="space-y-4">
      {/* Macro BR + índice/dólar */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Macro BR & mercado</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="IBOV" value={fmtNum(ibov?.price ?? null, 0)} sub={fmtPct(ibov?.changePct ?? null)} tone={ibov?.changePct} />
          <Cell label="Dólar (USD/BRL)" value={fmtNum(dollar?.price ?? null)} sub={fmtPct(dollar?.changePct ?? null)} tone={dollar?.changePct} />
          <Cell label="Selic (a.a.)" value={selicAA(ov.macro.selic) != null ? `${selicAA(ov.macro.selic)!.toFixed(2)}%` : "—"} sub="taxa básica" />
          <Cell label="IPCA (mês)" value={ov.macro.ipca != null ? `${ov.macro.ipca.toFixed(2)}%` : "—"} sub="inflação" />
        </div>
      </div>

      {/* Ativo selecionado */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">{asset}</span>
            {selQuote?.name && selQuote.name !== asset && <span className="ml-2 text-xs text-muted-foreground">{selQuote.name}</span>}
            <div className="num text-3xl font-bold text-foreground">{selQuote ? fmtAssetPrice(asset, selQuote.price) : "—"}</div>
          </div>
          <span className={`text-sm font-semibold ${toneCls(selQuote?.changePct)}`}>
            {fmtPct(selQuote?.changePct ?? null)} · dia{selQuote?.volume ? ` · vol ${fmtVol(selQuote.volume)}` : ""}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          <ChartTypeSelector chartType={chartType} onChartType={setChartType} timeframe={timeframe} onTimeframe={setTimeframe} />
          <PillRow label="Indicadores:">
            <TogglePill label="Médias (EMA 9/21/50)" active={showEma} onToggle={() => setShowEma((v) => !v)} color="bg-amber-500" desc="Médias móveis exponenciais de 9, 21 e 50 períodos — tendência e suportes/resistências dinâmicos." />
            {asset !== "USD/BRL" && (
              <TogglePill label="Volume" active={showVolume} onToggle={() => setShowVolume((v) => !v)} color="bg-sky-400" desc="Volume negociado por período (barras na base do gráfico)." />
            )}
          </PillRow>
          {chartLoading ? (
            <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
          ) : candles.length < 2 ? (
            <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">Sem candles para {asset}.</div>
          ) : (
            <B3Chart candles={candles} chartType={chartType} showEma={showEma} showVolume={showVolume} />
          )}
        </div>
      </div>

      {/* Fundamentos */}
      {fund && (fund.pe != null || fund.marketCap != null) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="P/L" value={fund.pe != null ? fund.pe.toFixed(1) : "—"} sub="preço / lucro" />
          <Cell label="LPA" value={fund.eps != null ? fmtBRL(fund.eps) : "—"} sub="lucro por ação" />
          <Cell label="Valor de mercado" value={fmtBig(fund.marketCap)} />
          {fund.range52 && <Cell label="Faixa 52 sem." value={fund.range52} />}
        </div>
      )}

      {/* Watchlist com desempenho por período */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Ações · desempenho</h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card dark:bg-card/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Ativo</th>
                <th className="px-3 py-2 text-right font-medium">Preço</th>
                <th className="px-3 py-2 text-right font-medium">Dia</th>
                <th className="px-3 py-2 text-right font-medium">Semana</th>
                <th className="px-3 py-2 text-right font-medium">15 dias</th>
                <th className="px-3 py-2 text-right font-medium">30 dias</th>
              </tr>
            </thead>
            <tbody>
              {ov.quotes.map((q) => (
                <PerfRow key={q.symbol} q={q} active={asset === q.symbol} onClick={() => onAsset(q.symbol)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Clique numa linha para abrir o ativo. Retornos por período (dia/semana/15/30 dias corridos).</p>
      </div>

      <p className="text-[11px] text-muted-foreground">Fonte: Yahoo Finance + Banco Central (BCB) · fundamentos via brapi.dev.</p>
    </div>
  );
}
