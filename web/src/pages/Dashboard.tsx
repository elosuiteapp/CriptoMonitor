import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AIAnalysisButton from "../components/AIAnalysisButton";
import AssetSelector from "../components/AssetSelector";
import Chart, { type ActiveLayers } from "../components/Chart";
import ChartTypeSelector from "../components/ChartTypeSelector";
import CvdSubchart from "../components/CvdSubchart";
import Disclaimer from "../components/Disclaimer";
import FundingStrip from "../components/FundingStrip";
import GammaPanel from "../components/GammaPanel";
import LayerToggles from "../components/LayerToggles";
import LiquidationsStrip from "../components/LiquidationsStrip";
import LockedCard from "../components/LockedCard";
import LockedTab from "../components/LockedTab";
import MacroTab from "../components/MacroTab";
import MetricCard from "../components/MetricCard";
import NewsBlock from "../components/NewsBlock";
import OIDeltaCard from "../components/OIDeltaCard";
import PriceHeader from "../components/PriceHeader";
import ReportsTab from "../components/ReportsTab";
import SmartMoneyTab from "../components/SmartMoneyTab";
import TabBar, { type TabId } from "../components/TabBar";
import VolatilityPanel from "../components/VolatilityPanel";
import { useAuth } from "../hooks/useAuth";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useOpenInterest } from "../hooks/useOpenInterest";
import { useOrderbookWalls } from "../hooks/useOrderbookWalls";
import { usePlan } from "../hooks/usePlan";
import { useSeries } from "../hooks/useSeries";
import { useSnapshot } from "../hooks/useSnapshot";
import {
  fmtPct,
  fmtUsd,
  readCvd,
  readInstitutionalBias,
  readFng,
  readFunding,
  readLiquidations,
  readLongShort,
  readTvl,
  type Reading,
} from "../lib/format";
import type { ChartType, Timeframe } from "../lib/marketData";
import { GLOSSARY } from "../lib/glossary";

const OPTION_ASSETS = ["BTC", "ETH", "SOL"]; // gamma: BTC/ETH (Deribit) + SOL (Bybit via relay)
const VOL_ASSETS = ["BTC", "ETH", "SOL"]; // Volatility: BTC/ETH (Deribit, c/ DVOL) + SOL (Bybit, s/ DVOL)

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { plan, loading: planLoading } = usePlan(user?.id);
  const { isAdmin } = useIsAdmin(user?.id);

  const allowed = plan?.assets ?? ["BTC"];
  const [asset, setAsset] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [tab, setTab] = useState<TabId>("cockpit");
  const [layers, setLayers] = useState<ActiveLayers>({
    gex: true,
    zeroGamma: true,
    maxPain: false,
    volumeProfile: false,
    orderbookWalls: false,
    funding: false,
    cvd: false,
    liquidations: false,
  });

  // Garante que o ativo selecionado pertence ao plano
  useEffect(() => {
    if (plan && !plan.assets.includes(asset)) setAsset(plan.assets[0] ?? "BTC");
  }, [plan, asset]);

  const { payload, updatedAt } = useSnapshot(asset, plan);
  const series = useSeries(asset, plan);
  const walls = useOrderbookWalls(asset, plan);
  const oiSeries = useOpenInterest(asset, plan);
  const advanced = plan?.advanced_metrics ?? false;
  const isExpert = plan?.slug === "expert";
  const canSmart = plan?.smart_money ?? false;
  const canUseLayers = plan?.chart_layers ?? false;
  const isOptionAsset = OPTION_ASSETS.includes(asset);
  const isVolAsset = VOL_ASSETS.includes(asset);

  const toggleLayer = (key: keyof ActiveLayers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const fng = useMemo<Reading>(() => readFng(payload?.sentiment?.fng_value), [payload]);

  if (planLoading || !plan) {
    return <div className="grid h-full place-items-center text-slate-500">Carregando plano…</div>;
  }

  const d = payload?.derivatives;
  const macro = payload?.macro;
  const dex = payload?.dex_liquidity;
  const onchain = payload?.onchain_perps;
  const defi = payload?.defi_health;

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-ink-600 bg-ink-900/80 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <span className="font-bold text-white">Crypto Monitor</span>
          <AssetSelector current={asset} allowed={allowed} onChange={setAsset} />
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-ink-500 px-2.5 py-1 text-xs text-slate-400">
            Plano {plan.name}
          </span>
          <AIAnalysisButton asset={asset} dailyLimit={plan.ai_daily_limit} />
          <Link to="/alerts" className="text-xs text-slate-400 hover:text-slate-200">
            Alertas
          </Link>
          {isAdmin && (
            <Link to="/admin" className="text-xs font-semibold text-accent hover:text-accent/80">
              Admin
            </Link>
          )}
          <button onClick={() => signOut()} className="text-xs text-slate-500 hover:text-slate-300">
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        <PriceHeader asset={asset} payload={payload} updatedAt={updatedAt} />

        <TabBar tab={tab} onTab={setTab} advanced={advanced} canSmart={canSmart} />

        {tab === "macro" &&
          (advanced ? (
            <MacroTab asset={asset} />
          ) : (
            <LockedTab title="Macro & Correlações" plan="Pro" />
          ))}
        {tab === "smart" &&
          (canSmart ? (
            <SmartMoneyTab asset={asset} />
          ) : (
            <LockedTab title="Smart Money & On-chain" plan="Expert" />
          ))}
        {tab === "reports" && <ReportsTab asset={asset} plan={plan} isExpert={isExpert} />}

        {tab === "cockpit" && (
          <>
        {/* Gráfico com camadas */}
        <section className="space-y-3 rounded-2xl border border-ink-600 bg-ink-800/40 p-4">
          <ChartTypeSelector
            chartType={chartType}
            onChartType={setChartType}
            timeframe={timeframe}
            onTimeframe={setTimeframe}
          />
          <Chart
            asset={asset}
            timeframe={timeframe}
            chartType={chartType}
            gamma={payload?.gamma ?? null}
            layers={layers}
            canUseLayers={canUseLayers}
            walls={walls}
            oiSeries={oiSeries}
          />
          <LayerToggles layers={layers} onToggle={toggleLayer} locked={!canUseLayers} />
          {canUseLayers && layers.cvd && (
            <>
              <CvdSubchart data={series.cvd} title="CVD do varejo (Binance + OKX)" />
              <CvdSubchart data={series.cvdInst} title="CVD institucional (Coinbase)" />
            </>
          )}
          {canUseLayers && layers.funding && <FundingStrip data={series.funding} />}
          {canUseLayers && layers.liquidations && <LiquidationsStrip data={series.liquidations} />}
        </section>

        {/* Painel Gamma (BTC/ETH, Pro+) */}
        {isOptionAsset && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Módulo Gamma (estilo SpotGamma)</h2>
            {advanced ? (
              <GammaPanel gamma={payload?.gamma ?? null} asset={asset} />
            ) : (
              <LockedCard title="Módulo Gamma — regime, Zero Gamma e Max Pain" />
            )}
          </section>
        )}

        {/* Painel de Volatilidade — BTC/ETH (Deribit, com DVOL) e SOL (Bybit, sem DVOL) */}
        {isVolAsset && advanced && (
          <section>
            <VolatilityPanel asset={asset} />
          </section>
        )}

        {/* Cards de métricas — separados por audiência: varejo × institucional (§8.6.3) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Fluxo, liquidez e sentimento</h2>

          {/* ── Varejo e alavancagem (perps, fluxo e posicionamento do varejo) ── */}
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>🛒 Varejo e alavancagem</span>
            <span className="h-px flex-1 bg-ink-600" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard title="Fear & Greed" reading={fng} source="Alternative.me" timestamp={updatedAt} info={GLOSSARY.fng} />
            {advanced ? (
              <>
                <MetricCard title="Funding (CEX agregado)" reading={readFunding(d?.funding_rate)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.fundingCex} />
                <MetricCard title="Funding onchain" reading={readFunding(onchain?.funding_rate)} source="Hyperliquid" timestamp={updatedAt} info={GLOSSARY.fundingOnchain} />
                <MetricCard
                  title="CVD do varejo"
                  info={GLOSSARY.cvd}
                  reading={readCvd(
                    payload?.price?.binance?.cvd == null && payload?.price?.okx?.cvd == null
                      ? d?.cvd
                      : (payload?.price?.binance?.cvd ?? 0) + (payload?.price?.okx?.cvd ?? 0),
                  )}
                  source="Binance + OKX"
                  timestamp={updatedAt}
                />
                <MetricCard title="Long / Short" reading={readLongShort(d?.long_short_ratio)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.longShort} />
                <MetricCard title="Liquidações" reading={readLiquidations(d?.liq_long_usd, d?.liq_short_usd)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.liquidations} />
                <OIDeltaCard asset={asset} timestamp={updatedAt} />
              </>
            ) : (
              <>
                <LockedCard title="Funding & GEX" />
                <LockedCard title="CVD do varejo" />
                <LockedCard title="Long / Short ratio" />
                <LockedCard title="Liquidações — alvos de liquidez" />
              </>
            )}
          </div>

          {/* ── Institucional e estrutural (spot/smart money, capital estrutural) ── */}
          <div className="mb-2 mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent">
            <span>🏦 Institucional e estrutural</span>
            <span className="h-px flex-1 bg-accent/30" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {advanced ? (
              <>
                <MetricCard
                  institutional
                  title="Viés Institucional × Varejo"
                  info={GLOSSARY.institutionalBias}
                  reading={readInstitutionalBias(
                    payload?.coinbase_premium,
                    payload?.price?.coinbase?.volume_spot,
                    [payload?.price?.binance?.volume_spot, payload?.price?.okx?.volume_spot]
                      .filter((v): v is number => v != null)
                      .reduce((a, b) => a + b, 0) || null,
                    payload?.price?.coinbase?.cvd,
                    payload?.price?.binance?.cvd,
                  )}
                  source="Prêmio + Participação + CVD (Coinbase × Binance+OKX)"
                  timestamp={updatedAt}
                />
                {defi && (
                  <MetricCard institutional title="Saúde DeFi (TVL)" reading={readTvl(defi.tvl_usd, defi.stablecoin_flow_24h)} source="DefiLlama" timestamp={updatedAt} info={GLOSSARY.tvl} />
                )}
                {dex && (
                  <MetricCard
                    institutional
                    title="Liquidez DEX"
                    info={GLOSSARY.dexLiquidity}
                    reading={{
                      label: `${dex.pair}: ${fmtUsd(dex.liquidity_usd)} de liquidez`,
                      detail: `Volume 24h ${fmtUsd(dex.volume_24h)}`,
                      level: "neutral",
                    }}
                    source="DexScreener"
                    timestamp={updatedAt}
                  />
                )}
                {macro && (
                  <MetricCard
                    institutional
                    title="Macro do mercado"
                    info={GLOSSARY.macroMarket}
                    reading={{
                      label: `Dominância BTC ${fmtPct(macro.btc_dominance, 1)} · mcap ${fmtUsd(macro.total_mcap)}`,
                      detail: `Dominância BTC ${fmtPct(macro.btc_dominance, 2)} · Market cap total ${fmtUsd(macro.total_mcap)}`,
                      level: "neutral",
                    }}
                    source="CoinGecko"
                    timestamp={updatedAt}
                  />
                )}
              </>
            ) : (
              <>
                <LockedCard institutional title="Viés Institucional × Varejo" />
                <LockedCard institutional title="Macro do mercado" />
              </>
            )}
          </div>
        </section>

        {/* Bloco de notícias — §8.6.4 (todos os planos) */}
        <NewsBlock asset={asset} plan={plan} />
          </>
        )}
      </main>

      <Disclaimer />
    </div>
  );
}
