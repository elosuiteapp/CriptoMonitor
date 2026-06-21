import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3FiisAll, fetchB3FundamentalsAll, fetchB3Overview, isFii, type B3Candle, type B3FiiFunds, type B3Funds, type B3Overview } from "../../lib/b3";
import type { ChartType, Timeframe } from "../../lib/marketData";
import ChartTypeSelector from "../ChartTypeSelector";
import { PillRow, TogglePill } from "../TogglePill";
import B3Chart from "./B3Chart";
import B3Screener from "./B3Screener";
import { Cell, fmtAssetPrice, fmtBig, fmtMult, fmtNum, fmtPct, fmtPctRaw, selicAA, toneCls } from "./B3Shared";

/** Cockpit Principal da B3: macro BR + ativo + gráfico + fundamentos completos + screener. */
export default function B3CockpitTab({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [ov, setOv] = useState<B3Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<B3Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [funds, setFunds] = useState<B3Funds>({});
  const [fiis, setFiis] = useState<B3FiiFunds>({});
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
    fetchB3FundamentalsAll().then((f) => alive && setFunds(f));
    fetchB3FiisAll().then((f) => alive && setFiis(f));
    return () => {
      alive = false;
    };
  }, []);

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
  const fund = funds[asset] ?? null;
  const fiiFund = fiis[asset] ?? null;
  const assetIsFii = isFii(asset);
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
            {fmtPct(selQuote?.changePct ?? null)} · dia
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

      {/* Fundamentos de FII */}
      {assetIsFii && fiiFund && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            Fundamentos · {asset}
            {fiiFund.segmento && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{fiiFund.segmento}</span>}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Cell label="Dividend Yield" value={<span className={fiiFund.dy != null && fiiFund.dy >= 9 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(fiiFund.dy)}</span>} sub="proventos 12m" />
            <Cell label="P/VP" value={<span className={fiiFund.pvp != null && fiiFund.pvp < 1 ? "text-emerald-500" : "text-foreground"}>{fmtMult(fiiFund.pvp)}</span>} sub="preço / patrimônio" />
            <Cell label="FFO Yield" value={fmtPctRaw(fiiFund.ffoYield)} sub="geração de caixa" />
            <Cell label="Cap Rate" value={fmtPctRaw(fiiFund.capRate)} sub="renda / valor" />
            <Cell label="Vacância" value={<span className={fiiFund.vacancia != null && fiiFund.vacancia > 15 ? "text-rose-500" : "text-foreground"}>{fmtPctRaw(fiiFund.vacancia)}</span>} sub="média" />
            <Cell label="Qtd de imóveis" value={fiiFund.qtdImoveis != null ? fmtNum(fiiFund.qtdImoveis, 0) : "—"} />
            <Cell label="Valor de mercado" value={fmtBig(fiiFund.valorMercado)} />
            <Cell label="Liquidez (dia)" value={fmtBig(fiiFund.liquidez)} sub="negociação média" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fonte: Fundamentus. FII paga proventos mensais — ver aba Dividendos. Verde = DY≥9% / P/VP&lt;1.</p>
        </div>
      )}

      {/* Fundamentos completos da ação */}
      {!assetIsFii && fund && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Fundamentos · {asset}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Cell label="P/L" value={fund.pl != null ? fund.pl.toFixed(1) : "—"} sub="preço / lucro" />
            <Cell label="P/VP" value={fmtMult(fund.pvp)} sub="preço / patrimônio" />
            <Cell label="Dividend Yield" value={<span className={fund.dy != null && fund.dy >= 6 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(fund.dy)}</span>} sub="proventos 12m" />
            <Cell label="ROE" value={<span className={fund.roe != null && fund.roe >= 15 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(fund.roe)}</span>} sub="retorno s/ patrimônio" />
            <Cell label="ROIC" value={fmtPctRaw(fund.roic)} sub="retorno s/ capital" />
            <Cell label="Margem líquida" value={fmtPctRaw(fund.mrgLiq)} sub="lucro / receita" />
            <Cell label="Margem EBIT" value={fmtPctRaw(fund.mrgEbit)} sub="operacional" />
            <Cell label="EV/EBITDA" value={fmtMult(fund.evEbitda)} sub="valor da firma" />
            <Cell label="Dív.Líq/PL" value={fund.divLiqPatrim != null ? fund.divLiqPatrim.toFixed(2) : "—"} sub="endividamento" tone={fund.divLiqPatrim != null ? -fund.divLiqPatrim : null} />
            <Cell label="Cresc. Rec. (5a)" value={<span className={toneCls(fund.crescRec5a)}>{fmtPctRaw(fund.crescRec5a)}</span>} sub="receita 5 anos" />
            <Cell label="Liq. corrente" value={fund.liqCorr != null ? fund.liqCorr.toFixed(2) : "—"} sub="caixa / dívida CP" />
            <Cell label="Patrimônio líq." value={fmtBig(fund.patrimLiq)} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fonte: Fundamentus. Verde = DY≥6% / ROE≥15% / crescimento positivo.</p>
        </div>
      )}

      {/* Screener — Ações × FIIs, fundamentos, filtro e ordenação */}
      <B3Screener quotes={ov.quotes} funds={funds} fiis={fiis} asset={asset} onAsset={onAsset} />

      <p className="text-[11px] text-muted-foreground">Fonte: Yahoo Finance + Banco Central (BCB) · fundamentos via Fundamentus.</p>
    </div>
  );
}
