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
import LockedCard from "../components/LockedCard";
import MetricCard from "../components/MetricCard";
import NewsBlock from "../components/NewsBlock";
import OIDeltaCard from "../components/OIDeltaCard";
import PriceHeader from "../components/PriceHeader";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { useSeries } from "../hooks/useSeries";
import { useSnapshot } from "../hooks/useSnapshot";
import {
  fmtPct,
  fmtUsd,
  readCvd,
  readDivergence,
  readFng,
  readFunding,
  readLiquidations,
  readLongShort,
  readTvl,
  type Reading,
} from "../lib/format";
import type { ChartType, Timeframe } from "../lib/marketData";

const OPTION_ASSETS = ["BTC", "ETH"];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { plan, loading: planLoading } = usePlan(user?.id);

  const allowed = plan?.assets ?? ["BTC"];
  const [asset, setAsset] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [layers, setLayers] = useState<ActiveLayers>({
    gex: true,
    zeroGamma: true,
    maxPain: false,
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
  const advanced = plan?.advanced_metrics ?? false;
  const canUseLayers = plan?.chart_layers ?? false;
  const isOptionAsset = OPTION_ASSETS.includes(asset);

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
          <button onClick={() => signOut()} className="text-xs text-slate-500 hover:text-slate-300">
            Sair
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        <PriceHeader asset={asset} payload={payload} updatedAt={updatedAt} />

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
          />
          <LayerToggles layers={layers} onToggle={toggleLayer} locked={!canUseLayers} />
          {canUseLayers && layers.cvd && <CvdSubchart data={series.cvd} />}
          {canUseLayers && layers.funding && <FundingStrip data={series.funding} />}
        </section>

        {/* Painel Gamma (BTC/ETH, Pro+) */}
        {isOptionAsset && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Módulo Gamma (estilo SpotGamma)</h2>
            {advanced ? (
              <GammaPanel gamma={payload?.gamma ?? null} />
            ) : (
              <LockedCard title="Módulo Gamma — regime, Zero Gamma e Max Pain" />
            )}
          </section>
        )}

        {/* Cards de métricas — inventário §8.6.3 */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Fluxo, liquidez e sentimento</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Sentimento — disponível em todos os planos */}
            <MetricCard title="Fear & Greed" reading={fng} source="Alternative.me" timestamp={updatedAt} />

            {advanced ? (
              <>
                <MetricCard title="Funding (CEX agregado)" reading={readFunding(d?.funding_rate)} source="Coinalyze" timestamp={updatedAt} />
                <MetricCard title="Funding onchain" reading={readFunding(onchain?.funding_rate)} source="Hyperliquid" timestamp={updatedAt} />
                <MetricCard title="CVD do varejo" reading={readCvd(payload?.price?.binance?.cvd ?? d?.cvd)} source="Binance" timestamp={updatedAt} />
                <MetricCard title="Long / Short" reading={readLongShort(d?.long_short_ratio)} source="Coinalyze" timestamp={updatedAt} />
                <MetricCard title="Liquidações" reading={readLiquidations(d?.liq_long_usd, d?.liq_short_usd)} source="Coinalyze" timestamp={updatedAt} />
                <OIDeltaCard asset={asset} timestamp={updatedAt} />
                <MetricCard
                  title="Divergência Spot × Perps"
                  reading={readDivergence(
                    payload?.spot_perps_divergence,
                    payload?.price?.coinbase?.volume_spot,
                    payload?.price?.binance?.volume_perps,
                  )}
                  source="Coinbase × Binance"
                  timestamp={updatedAt}
                />
                {defi && (
                  <MetricCard title="Saúde DeFi (TVL)" reading={readTvl(defi.tvl_usd, defi.stablecoin_flow_24h)} source="DefiLlama" timestamp={updatedAt} />
                )}
                {dex && (
                  <MetricCard
                    title="Liquidez DEX"
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
                    title="Macro do mercado"
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
                <LockedCard title="Funding & GEX" />
                <LockedCard title="CVD do varejo" />
                <LockedCard title="Long / Short ratio" />
                <LockedCard title="Liquidações — alvos de liquidez" />
                <LockedCard title="Divergência Spot × Perps" />
                <LockedCard title="Macro do mercado" />
              </>
            )}
          </div>
        </section>

        {/* Bloco de notícias — §8.6.4 (todos os planos) */}
        <NewsBlock asset={asset} plan={plan} />
      </main>

      <Disclaimer />
    </div>
  );
}
