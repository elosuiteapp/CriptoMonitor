import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AIAnalysisButton from "../components/AIAnalysisButton";
import AlertsDrawer from "../components/AlertsDrawer";
import AssetSelector from "../components/AssetSelector";
import Chart, { type ActiveLayers } from "../components/Chart";
import ChartTypeSelector from "../components/ChartTypeSelector";
import CvdSubchart from "../components/CvdSubchart";
import Disclaimer from "../components/Disclaimer";
import MarketPlaceholder from "../components/MarketPlaceholder";
import FundingStrip from "../components/FundingStrip";
import GammaPanel from "../components/GammaPanel";
import LayerToggles from "../components/LayerToggles";
import LiquidationsStrip from "../components/LiquidationsStrip";
import LockedCard from "../components/LockedCard";
import LockedTab from "../components/LockedTab";
import MacroTab from "../components/MacroTab";
import MetricCard from "../components/MetricCard";
import ModuleSwitcher from "../components/ModuleSwitcher";
import NewsBlock from "../components/NewsBlock";
import OIDeltaCard from "../components/OIDeltaCard";
import NotificationsBell from "../components/NotificationsBell";
import PriceHeader from "../components/PriceHeader";
import ReportsTab from "../components/ReportsTab";
import SmartMoneyTab from "../components/SmartMoneyTab";
import TabBar, { type TabId } from "../components/TabBar";
import ThemeToggle from "../components/ui/ThemeToggle";
import UserMenu from "../components/UserMenu";
import VolatilityPanel from "../components/VolatilityPanel";
import VolumeDeltaSubchart from "../components/VolumeDeltaSubchart";
import { useAuth } from "../hooks/useAuth";
import { useCvd } from "../hooks/useCvd";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useModule } from "../hooks/useModule";
import { useOpenInterest } from "../hooks/useOpenInterest";
import { useOrderbookWalls } from "../hooks/useOrderbookWalls";
import { usePlan } from "../hooks/usePlan";
import { useSeries } from "../hooks/useSeries";
import { useSnapshot } from "../hooks/useSnapshot";
import {
  fmtPct,
  fmtUsd,
  readCvd,
  readEtfFlow,
  readInstitutionalBias,
  readFng,
  readFunding,
  readLiquidations,
  readLongShort,
  readOptionsPositioning,
  readSqueezeRisk,
  readTvl,
  type Reading,
} from "../lib/format";
import type { ChartType, Timeframe } from "../lib/marketData";
import { GLOSSARY } from "../lib/glossary";

const OPTION_ASSETS = ["BTC", "ETH", "SOL", "BNB"]; // gamma: BTC/ETH (Deribit) + SOL (Bybit) + BNB (Binance), via relay
const VOL_ASSETS = ["BTC", "ETH", "SOL"]; // Volatility: BTC/ETH (Deribit, c/ DVOL) + SOL (Bybit, s/ DVOL)

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { plan, loading: planLoading } = usePlan(user?.id);
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const { module: market, setModule: setMarket } = useModule();

  const allowed = plan?.assets ?? ["BTC"];
  const [asset, setAsset] = useState("BTC");
  const [timeframe, setTimeframe] = useState<Timeframe>("4h");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const [tab, setTab] = useState<TabId>("cockpit");
  const [alertsOpen, setAlertsOpen] = useState(false);
  // Preço ao vivo emitido pelo gráfico (WS) — o topo espelha o gráfico em tempo real.
  const [livePrice, setLivePrice] = useState<number | null>(null);
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

  // Ao trocar de ativo, zera o preço ao vivo (cai no snapshot até o gráfico emitir
  // o preço do novo ativo) — evita mostrar por um instante o preço do ativo anterior.
  useEffect(() => {
    setLivePrice(null);
  }, [asset]);

  // Mercados ainda não liberados (B3, Forex) são preview só de admin. Se um não-admin
  // tiver um deles salvo no localStorage, volta para Crypto quando o papel resolver.
  useEffect(() => {
    if (market !== "crypto" && !adminLoading && !isAdmin) setMarket("crypto");
  }, [market, adminLoading, isAdmin]);

  const { payload, updatedAt } = useSnapshot(asset, plan);
  const series = useSeries(asset, plan);
  const walls = useOrderbookWalls(asset, plan);
  const oiSeries = useOpenInterest(asset, plan);
  // Volume Delta / CVD por candle (klines da Binance) — só quando a camada CVD liga.
  const cvdSeries = useCvd(asset, timeframe, (plan?.chart_layers ?? false) && layers.cvd);
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
    return <div className="grid h-full place-items-center text-muted-foreground">Carregando plano…</div>;
  }

  const d = payload?.derivatives;
  // Preço de referência do ativo aberto (mesma ordem do PriceHeader) — usado pelo
  // painel de alertas para pré-preencher e oferecer atalhos relativos ao preço.
  const spot = payload?.price?.binance?.price ?? payload?.price?.coinbase?.price ?? payload?.gamma?.spot_price ?? null;
  const macro = payload?.macro;
  const dex = payload?.dex_liquidity;
  const onchain = payload?.onchain_perps;
  const defi = payload?.defi_health;

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {user && <UserMenu user={user} planName={plan.name} onSignOut={signOut} />}
          <span className="font-bold text-foreground">OrbeView</span>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <ModuleSwitcher current={market} onChange={setMarket} isAdmin={isAdmin} />
          {market === "crypto" && (
            <AssetSelector current={asset} allowed={allowed} onChange={setAsset} />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/newsletter"
            className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors duration-200 hover:border-primary/60 hover:bg-primary/10"
          >
            <span aria-hidden>📰</span>
            Newsletter
          </Link>
          <AIAnalysisButton asset={asset} dailyLimit={plan.ai_daily_limit} />
          {user && <NotificationsBell user={user} />}
          <button
            onClick={() => setAlertsOpen(true)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Alertas
          </button>
          {isAdmin && (
            <Link to="/admin" className="text-xs font-semibold text-primary transition-colors hover:text-primary/80">
              Admin
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        {market !== "crypto" ? (
          <MarketPlaceholder module={market} onBack={() => setMarket("crypto")} />
        ) : (
          <>
        <PriceHeader asset={asset} payload={payload} updatedAt={updatedAt} livePrice={livePrice} />

        <TabBar tab={tab} onTab={setTab} advanced={advanced} canSmart={canSmart} />

        {tab === "macro" && <MacroTab asset={asset} pro={advanced} />}
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
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
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
            onPrice={setLivePrice}
          />
          <LayerToggles layers={layers} onToggle={toggleLayer} locked={!canUseLayers} />
          {canUseLayers && layers.cvd && (
            <>
              <VolumeDeltaSubchart data={cvdSeries} title={`Volume Delta · CVD (Binance · ${timeframe.toUpperCase()})`} />
              <CvdSubchart data={series.cvdInst} title="CVD institucional (Coinbase) — varejo × instituição" />
            </>
          )}
          {canUseLayers && layers.funding && <FundingStrip data={series.funding} />}
          {canUseLayers && layers.liquidations && <LiquidationsStrip data={series.liquidations} />}
        </section>

        {/* Painel Gamma (BTC/ETH/SOL, Pro+). Bloqueado, mostra os recursos do módulo
            como teasers: Gamma e — só em BTC/ETH — o Fluxo de opções (HIRO). */}
        {isOptionAsset && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">Módulo Gamma (estilo SpotGamma)</h2>
            {advanced ? (
              <GammaPanel gamma={payload?.gamma ?? null} asset={asset} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <LockedCard title="Módulo Gamma — regime, Zero Gamma e Max Pain" />
                {asset !== "BNB" && (
                  <LockedCard title="Fluxo de opções (HIRO) — delta-fluxo do hedge" />
                )}
              </div>
            )}
          </section>
        )}

        {/* Painel de Volatilidade — BTC/ETH (Deribit, com DVOL) e SOL (Bybit, sem DVOL).
            Para Free aparece bloqueado (teaser), pro usuário saber que o recurso existe. */}
        {isVolAsset && (
          <section>
            {advanced ? (
              <VolatilityPanel asset={asset} />
            ) : (
              <>
                <h2 className="mb-3 text-sm font-semibold text-foreground">Volatilidade (DVOL, IV, term structure)</h2>
                <LockedCard title="Volatilidade — DVOL, IV Percentile e term structure" />
              </>
            )}
          </section>
        )}

        {/* Cards de métricas — separados por audiência: varejo × institucional (§8.6.3) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Fluxo, liquidez e sentimento</h2>

          {/* ── Varejo e alavancagem (perps, fluxo e posicionamento do varejo) ── */}
          <div className="mb-3 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span>Varejo e alavancagem</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard title="Fear & Greed" reading={fng} source="Alternative.me" timestamp={updatedAt} info={GLOSSARY.fng} />
            {advanced ? (
              <>
                <MetricCard title="Funding (CEX agregado)" reading={readFunding(d?.funding_rate == null ? null : d.funding_rate / 100)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.fundingCex} />
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
                <MetricCard
                  title="Risco de squeeze"
                  reading={readSqueezeRisk(d?.funding_rate == null ? null : d.funding_rate / 100, d?.long_short_ratio, d?.liq_long_usd, d?.liq_short_usd)}
                  source="Coinalyze"
                  timestamp={updatedAt}
                  info={GLOSSARY.squeezeRisk}
                />
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
          <div className="mb-3 mt-6 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Institucional e estrutural</span>
            <span className="h-px flex-1 bg-primary/25" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                {payload?.etf_flows && (
                  <MetricCard
                    institutional
                    title="ETFs spot"
                    info={GLOSSARY.etfFlows}
                    reading={readEtfFlow(
                      payload.etf_flows.net_flow_usd,
                      payload.etf_flows.streak_days,
                      payload.etf_flows.flow_7d_usd,
                      payload.etf_flows.as_of,
                    )}
                    source="Farside"
                    timestamp={updatedAt}
                  />
                )}
                {payload?.gamma && (
                  <MetricCard
                    institutional
                    title="Hedge institucional (opções)"
                    info={GLOSSARY.optionsPositioning}
                    reading={readOptionsPositioning(
                      payload.gamma.put_call_ratio,
                      payload.gamma.iv_skew,
                    )}
                    source="Deribit"
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
          </>
        )}
      </main>

      <Disclaimer />

      {user && alertsOpen && (
        <AlertsDrawer
          user={user}
          plan={plan}
          currentAsset={asset}
          price={spot}
          funding={payload?.derivatives?.funding_rate ?? null}
          gamma={payload?.gamma ?? null}
          onClose={() => setAlertsOpen(false)}
        />
      )}
    </div>
  );
}
