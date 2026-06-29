import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3FiiDetail, fetchB3FiisAll, fetchB3FundamentalsAll, fetchB3Overview, fetchB3Proventos, isFii, type B3Candle, type B3FiiDetail, type B3FiiFunds, type B3Funds, type B3Overview, type B3ProventosData } from "../../lib/b3";
import type { ChartType, Timeframe } from "../../lib/marketData";
import ChartTypeSelector from "../ChartTypeSelector";
import { PillRow, TogglePill } from "../TogglePill";
import B3Chart from "./B3Chart";
import B3IndicatorPanels from "./B3IndicatorPanels";
import B3FearGreedPanel from "./B3FearGreedPanel";
import B3FiiSegmentCompare from "./B3FiiSegmentCompare";
import B3NewsBlock from "./B3NewsBlock";
import B3Screener from "./B3Screener";
import B3SectorCompare from "./B3SectorCompare";
import B3SectorRotation from "./B3SectorRotation";
import { Cell, fmtAssetPrice, fmtBig, fmtBRL, fmtMult, fmtNum, fmtPct, fmtPctRaw, fmtVol, RangeBar, selicAA, toneCls } from "./B3Shared";

/** Cockpit Principal da B3: macro BR + ativo + gráfico + fundamentos completos + screener. */
export default function B3CockpitTab({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [ov, setOv] = useState<B3Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<B3Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [funds, setFunds] = useState<B3Funds>({});
  const [fiis, setFiis] = useState<B3FiiFunds>({});
  const [proventos, setProventos] = useState<B3ProventosData>({ past: [], upcoming: [] });
  const [fiiDetail, setFiiDetail] = useState<B3FiiDetail | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [showEma, setShowEma] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showLongTrend, setShowLongTrend] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);

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

  // Proventos do FII (rendimento por cota) — p/ rendimento projetado e último pagamento.
  useEffect(() => {
    if (!isFii(asset)) {
      setProventos({ past: [], upcoming: [] });
      return;
    }
    let alive = true;
    fetchB3Proventos(asset, "fii").then((p) => alive && setProventos(p));
    return () => {
      alive = false;
    };
  }, [asset]);

  // Detalhe por FII (VP/Cota, patrimônio, nº de cotas…) — 1 request on-demand ao selecionar.
  useEffect(() => {
    if (!isFii(asset)) {
      setFiiDetail(null);
      return;
    }
    let alive = true;
    setFiiDetail(null);
    fetchB3FiiDetail(asset).then((d) => alive && setFiiDetail(d));
    return () => {
      alive = false;
    };
  }, [asset]);

  const selQuote = useMemo(() => ov?.quotes.find((q) => q.symbol === asset) ?? null, [ov, asset]);
  const fund = funds[asset] ?? null;
  const fiiFund = fiis[asset] ?? null;
  const assetIsFii = isFii(asset);
  const ibov = ov?.quotes.find((q) => q.symbol === "IBOV");
  const dollar = ov?.quotes.find((q) => q.symbol === "USD/BRL");

  // Contexto de renda do FII: DY vs CDI (renda fixa que concorre), rendimento projetado
  // (último × 12 / preço) e desempenho vs IFIX (benchmark dos FIIs).
  const fiiCtx = useMemo(() => {
    if (!assetIsFii) return null;
    const price = fiiFund?.price ?? selQuote?.price ?? null;
    const last = proventos.past.length ? proventos.past[proventos.past.length - 1] : null;
    const fwdDy = last && price && price > 0 ? ((last.amount * 12) / price) * 100 : null;
    const dy = fiiFund?.dy ?? null;
    const cdi = ov?.macro.cdi ?? null;
    const dyVsCdi = dy != null && cdi != null ? dy - cdi : null;
    const ifixChg = ov?.ifix?.changePct ?? null;
    const fiiChg = selQuote?.changePct ?? null;
    const vsIfix = fiiChg != null && ifixChg != null ? fiiChg - ifixChg : null;
    return { last, fwdDy, dy, cdi, dyVsCdi, ifixChg, fiiChg, vsIfix };
  }, [assetIsFii, fiiFund, selQuote, proventos, ov]);

  // Deságio/ágio vs valor patrimonial — leitura mais concreta do P/VP (em R$ e %).
  // Preço abaixo do VP/Cota = comprando R$1 de patrimônio por menos de R$1 (deságio).
  const fiiAgio = useMemo(() => {
    if (!assetIsFii || !fiiDetail?.vpCota) return null;
    const price = fiiFund?.price ?? selQuote?.price ?? null;
    if (!price || price <= 0) return null;
    return { price, deltaPct: (price / fiiDetail.vpCota - 1) * 100, deltaBRL: price - fiiDetail.vpCota };
  }, [assetIsFii, fiiDetail, fiiFund, selQuote]);

  // Payout do FII = rendimento distribuído ÷ FFO (ambos por cota, 12m). >100% = distribui
  // mais do que gera de caixa (usando reserva/ganho de capital) — sinal de sustentabilidade.
  const fiiPayout = useMemo(() => {
    const ffo = fiiDetail?.ffoCota;
    const div = fiiDetail?.divCota;
    return ffo && div && ffo > 0 ? (div / ffo) * 100 : null;
  }, [fiiDetail]);

  if (loading) return <div className="h-24 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!ov) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Dados da B3 indisponíveis no momento.</div>;

  return (
    <div className="space-y-4">
      {/* Macro BR + índice/dólar */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Macro BR & mercado</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <Cell label="IBOV" value={fmtNum(ibov?.price ?? null, 0)} sub={fmtPct(ibov?.changePct ?? null)} tone={ibov?.changePct} />
          <Cell label="Dólar (USD/BRL)" value={fmtNum(dollar?.price ?? null)} sub={fmtPct(dollar?.changePct ?? null)} tone={dollar?.changePct} />
          <Cell label="Selic (a.a.)" value={selicAA(ov.macro.selic) != null ? `${selicAA(ov.macro.selic)!.toFixed(2)}%` : "—"} sub="taxa básica" />
          <Cell label="CDI (a.a.)" value={ov.macro.cdi != null ? `${ov.macro.cdi.toFixed(2)}%` : "—"} sub="renda fixa / FII" />
          <Cell label="IPCA (mês)" value={ov.macro.ipca != null ? `${ov.macro.ipca.toFixed(2)}%` : "—"} sub="inflação" />
          <Cell label="IBC-Br (mês)" value={ov.macro.ibc_br != null ? `${ov.macro.ibc_br.momPct >= 0 ? "+" : ""}${ov.macro.ibc_br.momPct.toFixed(2)}%` : "—"} sub="atividade" tone={ov.macro.ibc_br?.momPct ?? null} />
          <Cell label="Desemprego" value={ov.macro.unemployment != null ? `${ov.macro.unemployment.toFixed(1)}%` : "—"} sub="PNAD" />
        </div>
      </div>

      {/* Termômetro de Medo & Ganância Brasil (índice próprio) */}
      {ov.fng && <B3FearGreedPanel fng={ov.fng} />}

      {/* Commodities que movem o IBOV — petróleo/metais lá fora antecipam PETR4/VALE3 */}
      {ov.commodities && ov.commodities.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Commodities que movem o IBOV</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ov.commodities.map((c) => (
              <Cell
                key={c.symbol}
                label={c.symbol}
                value={fmtNum(c.price)}
                tone={c.changePct}
                sub={<><span className={toneCls(c.changePct)}>{fmtPct(c.changePct)}</span> · move {c.impacts}</>}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Petróleo e metais lá fora antecipam a abertura de PETR4, VALE3 e siderúrgicas. Cobre serve de proxy de metais (minério de ferro não tem feed grátis). Fonte: Yahoo Finance.</p>
        </div>
      )}

      {/* Rotação setorial — para onde o capital girou nos últimos 30 dias */}
      <B3SectorRotation quotes={ov.quotes} onAsset={onAsset} />

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
              <TogglePill label="Volume" active={showVolume} onToggle={() => setShowVolume((v) => !v)} color="bg-sky-400" desc={asset === "IBOV" ? "Volume negociado por período (via BOVA11, o ETF que segue o Ibovespa)." : "Volume negociado por período (barras na base do gráfico)."} />
            )}
            <TogglePill label="Bollinger" active={showBollinger} onToggle={() => setShowBollinger((v) => !v)} color="bg-sky-500" desc="Bandas de Bollinger (média 20 ± 2 desvios) — volatilidade e reversão à média. Aperto das bandas = baixa volatilidade." />
            <TogglePill label="MM200 + 52 sem" active={showLongTrend} onToggle={() => setShowLongTrend((v) => !v)} color="bg-orange-500" desc="Média móvel de 200 períodos (tendência primária) + linhas de máxima e mínima das últimas 52 semanas." />
            <TogglePill label="Volume Profile" active={showVolumeProfile} onToggle={() => setShowVolumeProfile((v) => !v)} color="bg-fuchsia-500" desc="Perfil de volume da janela visível: POC (preço com mais volume) + topo (VAH) e base (VAL) da área de valor — suportes/resistências por volume negociado." />
            <TogglePill label="RSI" active={showRsi} onToggle={() => setShowRsi((v) => !v)} color="bg-violet-500" desc="Índice de Força Relativa (14) — sobrecompra acima de 70, sobrevenda abaixo de 30. Subgráfico abaixo." />
            <TogglePill label="MACD" active={showMacd} onToggle={() => setShowMacd((v) => !v)} color="bg-blue-500" desc="Convergência/divergência de médias (12/26/9) — tendência e momento. Subgráfico abaixo." />
          </PillRow>
          {chartLoading ? (
            <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
          ) : candles.length < 2 ? (
            <div className="grid h-[360px] place-items-center text-sm text-muted-foreground">Sem candles para {asset}.</div>
          ) : (
            <>
              <B3Chart candles={candles} chartType={chartType} showEma={showEma} showVolume={showVolume} showBollinger={showBollinger} showLongTrend={showLongTrend} showVolumeProfile={showVolumeProfile} />
              <B3IndicatorPanels candles={candles} showRsi={showRsi} showMacd={showMacd} />
            </>
          )}
        </div>
      </div>

      {/* Faixa de 52 semanas — posição do preço atual no range do ano (ações, índice e FIIs) */}
      {selQuote?.price != null && selQuote.fl52 != null && selQuote.fh52 != null && selQuote.fh52 > selQuote.fl52 && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Faixa de 52 semanas · {asset}</h3>
          <RangeBar low={selQuote.fl52} high={selQuote.fh52} current={selQuote.price} fmt={(n) => fmtAssetPrice(asset, n)} />
          <p className="mt-2 text-[11px] text-muted-foreground">Onde o preço de hoje está entre a mínima e a máxima dos últimos 12 meses. Perto da máxima = momento forte/esticado; perto da mínima = descontado/pressionado. Fonte: Yahoo Finance.</p>
        </div>
      )}

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
            {fiiFund.precoM2 != null && <Cell label="Preço do m²" value={fmtBRL(fiiFund.precoM2)} sub="dos imóveis" />}
            {fiiFund.aluguelM2 != null && <Cell label="Aluguel do m²" value={fmtBRL(fiiFund.aluguelM2)} sub="por mês" />}
            <Cell label="Valor de mercado" value={fmtBig(fiiFund.valorMercado)} />
            <Cell label="Liquidez (dia)" value={fmtBig(fiiFund.liquidez)} sub="negociação média" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fonte: Fundamentus. FII paga proventos mensais — ver aba Dividendos. Verde = DY≥9% / P/VP&lt;1. Preço/aluguel do m² só em FII de tijolo.</p>
        </div>
      )}

      {/* Renda & contexto do FII — DY vs CDI, rendimento projetado e vs IFIX */}
      {assetIsFii && fiiCtx && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Renda &amp; contexto · {asset}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cell
              label="DY vs CDI"
              value={<span className={fiiCtx.dyVsCdi != null ? toneCls(fiiCtx.dyVsCdi) : "text-foreground"}>{fiiCtx.dyVsCdi != null ? `${fiiCtx.dyVsCdi >= 0 ? "+" : ""}${fiiCtx.dyVsCdi.toFixed(1)} pp` : "—"}</span>}
              sub={fiiCtx.dy != null && fiiCtx.cdi != null ? `DY ${fiiCtx.dy.toFixed(1)}% × CDI ${fiiCtx.cdi.toFixed(1)}%` : "renda fixa"}
            />
            <Cell
              label="Rendimento projetado"
              value={fiiCtx.fwdDy != null ? `${fiiCtx.fwdDy.toFixed(1)}%` : "—"}
              sub="último × 12 / preço"
            />
            <Cell
              label="Último rendimento"
              value={fmtBRL(fiiCtx.last?.amount ?? null)}
              sub={fiiCtx.last?.date ? `data-com ${new Date(fiiCtx.last.date * 1000).toLocaleDateString("pt-BR")}` : "por cota"}
            />
            <Cell
              label="vs IFIX (dia)"
              value={<span className={fiiCtx.vsIfix != null ? toneCls(fiiCtx.vsIfix) : "text-foreground"}>{fiiCtx.vsIfix != null ? `${fiiCtx.vsIfix >= 0 ? "+" : ""}${fiiCtx.vsIfix.toFixed(2)} pp` : "—"}</span>}
              sub={fiiCtx.ifixChg != null ? `IFIX ${fmtPct(fiiCtx.ifixChg)}` : "índice de FIIs"}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            DY vs CDI = prêmio do FII sobre a renda fixa (verde = paga mais que o CDI). IFIX é o índice dos FIIs. Educacional — não é recomendação.
          </p>
        </div>
      )}

      {/* Detalhe do fundo (por FII) — VP/Cota, deságio/ágio, patrimônio, nº de cotas, payout */}
      {assetIsFii && fiiDetail && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Detalhe do fundo · {asset}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Cell label="VP/Cota" value={fmtBRL(fiiDetail.vpCota)} sub="patrimônio por cota" />
            <Cell
              label="Deságio / ágio"
              value={fiiAgio ? <span className={toneCls(-fiiAgio.deltaPct)}>{`${fiiAgio.deltaPct >= 0 ? "+" : ""}${fiiAgio.deltaPct.toFixed(1)}%`}</span> : "—"}
              sub={fiiAgio ? `${fiiAgio.deltaBRL >= 0 ? "+" : "−"}${fmtBRL(Math.abs(fiiAgio.deltaBRL))} vs VP` : "preço vs VP"}
            />
            <Cell label="Patrimônio líq." value={fmtBig(fiiDetail.patrimLiq)} sub="porte do fundo" />
            <Cell label="Nº de cotas" value={fmtVol(fiiDetail.numCotas)} />
            <Cell label="FFO/Cota" value={fmtBRL(fiiDetail.ffoCota)} sub="caixa por cota" />
            <Cell label="Dividendo/cota" value={fmtBRL(fiiDetail.divCota)} sub="rend. 12m / cota" />
            {fiiPayout != null && (
              <Cell
                label="Payout (rend/FFO)"
                value={<span className={fiiPayout <= 105 ? "text-emerald-500" : fiiPayout <= 120 ? "text-amber-500" : "text-rose-500"}>{`${fiiPayout.toFixed(0)}%`}</span>}
                sub={fiiPayout <= 105 ? "coberto pela geração" : "acima do FFO (reserva)"}
              />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Deságio (verde) = preço abaixo do valor patrimonial por cota — comprando R$1 de patrimônio por menos de R$1. Payout = rendimento distribuído ÷ FFO (geração de caixa): acima de 100% o fundo distribui mais do que gera (usando reserva/ganho de capital — checar a sustentabilidade). Fonte: Fundamentus (detalhe por fundo).
          </p>
        </div>
      )}

      {/* Comparação com o segmento (mediana) — só p/ FIIs */}
      {assetIsFii && <B3FiiSegmentCompare asset={asset} fiis={fiis} />}

      {/* Fundamentos completos da ação */}
      {!assetIsFii && fund && (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <h3 className="mb-2 text-sm font-semibold text-foreground">Fundamentos · {asset}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Cell label="P/L" value={fund.pl != null ? fund.pl.toFixed(1) : "—"} sub="preço / lucro" />
            <Cell label="P/VP" value={fmtMult(fund.pvp)} sub="preço / patrimônio" />
            <Cell label="P/Receita" value={fmtMult(fund.psr)} sub="preço / vendas (PSR)" />
            <Cell label="Dividend Yield" value={<span className={fund.dy != null && fund.dy >= 6 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(fund.dy)}</span>} sub="proventos 12m" />
            <Cell label="ROE" value={<span className={fund.roe != null && fund.roe >= 15 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(fund.roe)}</span>} sub="retorno s/ patrimônio" />
            <Cell label="ROIC" value={fmtPctRaw(fund.roic)} sub="retorno s/ capital" />
            <Cell label="Margem bruta" value={fmtPctRaw(fund.mrgBruta)} sub="receita − custos" />
            <Cell label="Margem EBIT" value={fmtPctRaw(fund.mrgEbit)} sub="operacional" />
            <Cell label="Margem líquida" value={fmtPctRaw(fund.mrgLiq)} sub="lucro / receita" />
            <Cell label="P/EBIT" value={fmtMult(fund.pEbit)} sub="preço / operacional" />
            <Cell label="EV/EBIT" value={fmtMult(fund.evEbit)} sub="firma / operacional" />
            <Cell label="EV/EBITDA" value={fmtMult(fund.evEbitda)} sub="valor da firma" />
            <Cell label="Dív.Líq/PL" value={fund.divLiqPatrim != null ? fund.divLiqPatrim.toFixed(2) : "—"} sub="endividamento" tone={fund.divLiqPatrim != null ? -fund.divLiqPatrim : null} />
            <Cell label="Cresc. Rec. (5a)" value={<span className={toneCls(fund.crescRec5a)}>{fmtPctRaw(fund.crescRec5a)}</span>} sub="receita 5 anos" />
            <Cell label="Liq. corrente" value={fund.liqCorr != null ? fund.liqCorr.toFixed(2) : "—"} sub="caixa / dívida CP" />
            <Cell label="Patrimônio líq." value={fmtBig(fund.patrimLiq)} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Fonte: Fundamentus. Verde = DY≥6% / ROE≥15% / crescimento positivo.</p>
        </div>
      )}

      {/* Comparação com os pares do setor (mediana) — só p/ ações */}
      {!assetIsFii && fund && <B3SectorCompare asset={asset} funds={funds} />}

      {/* Screener — Ações × FIIs, fundamentos, filtro e ordenação */}
      <B3Screener quotes={ov.quotes} funds={funds} fiis={fiis} asset={asset} onAsset={onAsset} />

      <B3NewsBlock />

      <p className="text-[11px] text-muted-foreground">Fonte: Yahoo Finance + Banco Central (BCB) · fundamentos via Fundamentus.</p>
    </div>
  );
}
