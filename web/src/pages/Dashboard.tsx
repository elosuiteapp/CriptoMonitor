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
import B3Module from "../components/b3/B3Module";
import B3AssetSelector from "../components/b3/B3AssetSelector";
import { B3_ASSETS, B3_FIIS } from "../lib/b3";
import FundingStrip from "../components/FundingStrip";
import GammaPanel from "../components/GammaPanel";
import LayerToggles from "../components/LayerToggles";
import LiquidationsStrip from "../components/LiquidationsStrip";
import LockedCard from "../components/LockedCard";
import LockedSubchart from "../components/LockedSubchart";
import LockedTab from "../components/LockedTab";
import IndicatorsTab from "../components/indicators/IndicatorsTab";
import MacroTab from "../components/MacroTab";
import MetricCard from "../components/MetricCard";
import ModuleSwitcher from "../components/ModuleSwitcher";
import NewsBlock from "../components/NewsBlock";
import OIDeltaCard from "../components/OIDeltaCard";
import OrderbookImbalanceCard from "../components/OrderbookImbalanceCard";
import NotificationsBell from "../components/NotificationsBell";
import PriceHeader from "../components/PriceHeader";
import ReportsTab from "../components/ReportsTab";
import SmartMoneyTab from "../components/SmartMoneyTab";
import TabBar, { type TabId } from "../components/TabBar";
import LangSwitch from "../components/ui/LangSwitch";
import ThemeToggle from "../components/ui/ThemeToggle";
import UserMenu from "../components/UserMenu";
import VolatilityPanel from "../components/VolatilityPanel";
import VolumeDeltaSubchart from "../components/VolumeDeltaSubchart";
import { useAuth } from "../hooks/useAuth";
import { useCvd } from "../hooks/useCvd";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useMarketRead } from "../hooks/useMarketRead";
import { useModule } from "../hooks/useModule";
import { useOpenInterest } from "../hooks/useOpenInterest";
import { useBookPressureSeries } from "../hooks/useBookPressureSeries";
import { useOrderbookImbalance } from "../hooks/useOrderbookImbalance";
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
import { useGlossary } from "../lib/glossary";
import { cockpitSynthesis } from "../lib/cockpitSynthesis";
import { layerAccess, LAYER_KEYS } from "../lib/layers";
import { useT } from "../lib/i18n";

const OPTION_ASSETS = ["BTC", "ETH", "SOL", "BNB"]; // gamma: BTC/ETH (Deribit) + SOL (Bybit) + BNB (Binance), via relay
const VOL_ASSETS = ["BTC", "ETH", "SOL"]; // Volatility: BTC/ETH (Deribit, c/ DVOL) + SOL (Bybit, s/ DVOL)

export default function Dashboard() {
  const { t: tr } = useT();
  const GLOSSARY = useGlossary();
  const { user, signOut } = useAuth();
  const { plan, loading: planLoading } = usePlan(user?.id);
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);
  const { module: market, setModule: setMarket } = useModule();

  const allowed = plan?.assets ?? ["BTC"];
  const [asset, setAsset] = useState("BTC");
  const [b3Asset, setB3Asset] = useState("PETR4");
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
    bookPressure: false,
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
  const imbalance = useOrderbookImbalance(asset, plan);
  const oiSeries = useOpenInterest(asset, plan);
  const advanced = plan?.advanced_metrics ?? false;
  const isExpert = plan?.slug === "expert";
  const canSmart = plan?.smart_money ?? false;
  const canUseLayers = plan?.chart_layers ?? false;
  // Quais camadas o plano pode LIGAR (fonte única em lib/layers.ts):
  // Expert = todas; Pro = estrutura de opções; Free = vitrine (preview_layers).
  const access = layerAccess(plan);
  // O que de fato renderiza = ligada pelo usuário E permitida pelo plano.
  const effectiveLayers = { ...layers } as ActiveLayers;
  for (const k of LAYER_KEYS) effectiveLayers[k] = layers[k] && access[k];
  // Volume Delta / CVD (varejo, Binance) e Pressão do book por candle — quando a
  // camada liga. No Free o book é só do VAREJO (Coinbase = teaser institucional).
  const cvdSeries = useCvd(asset, timeframe, canUseLayers && effectiveLayers.cvd);
  const bookSeries = useBookPressureSeries(asset, canUseLayers && effectiveLayers.bookPressure, !advanced);
  const isOptionAsset = OPTION_ASSETS.includes(asset);
  const isVolAsset = VOL_ASSETS.includes(asset);

  const toggleLayer = (key: keyof ActiveLayers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const fng = useMemo<Reading>(() => readFng(payload?.sentiment?.fng_value), [payload]);

  // Pressão do book consolidada (varejo + institucional, faixa ±2%) — alimenta o motor.
  const bookImbalance = useMemo(() => {
    const bid = (imbalance.varejo?.bid_wide_usd ?? 0) + (imbalance.institucional?.bid_wide_usd ?? 0);
    const ask = (imbalance.varejo?.ask_wide_usd ?? 0) + (imbalance.institucional?.ask_wide_usd ?? 0);
    return bid + ask > 0 ? (bid - ask) / (bid + ask) : null;
  }, [imbalance]);
  // Leitura do Mercado computada UMA vez no cockpit (motor de confluência), só para
  // Expert (canSmart) no módulo cripto. Alimenta o badge do header (todas as abas) e
  // a aba Leitura do Mercado — mesmos números, sem dupla computação.
  const marketRead = useMarketRead(asset, payload ?? null, bookImbalance, market === "crypto" && canSmart);

  if (planLoading || !plan) {
    return <div className="grid h-full place-items-center text-muted-foreground">{tr.header.loadingPlan}</div>;
  }

  const d = payload?.derivatives;
  // Preço de referência do ativo aberto (mesma ordem do PriceHeader) — usado pelo
  // painel de alertas para pré-preencher e oferecer atalhos relativos ao preço.
  const spot = payload?.price?.binance?.price ?? payload?.price?.coinbase?.price ?? payload?.gamma?.spot_price ?? null;
  const macro = payload?.macro;
  const dex = payload?.dex_liquidity;
  const onchain = payload?.onchain_perps;
  const defi = payload?.defi_health;
  const cockpitRead = cockpitSynthesis(payload ?? null, asset);

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
          {market === "b3" && (
            <div className="flex items-center gap-2">
              <B3AssetSelector current={b3Asset} onChange={setB3Asset} items={B3_ASSETS} label="Ações" />
              <B3AssetSelector current={b3Asset} onChange={setB3Asset} items={B3_FIIS} label="FIIs" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/newsletter"
            className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary shadow-sm transition-colors duration-200 hover:border-primary/60 hover:bg-primary/10"
          >
            <span aria-hidden>📰</span>
            {tr.header.newsletter}
          </Link>
          <AIAnalysisButton
            asset={market === "b3" ? b3Asset : asset}
            to={market === "b3" ? "/b3-analysis" : "/analysis"}
            dailyLimit={market === "b3" ? undefined : plan.ai_daily_limit}
          />
          {user && <NotificationsBell user={user} />}
          <button
            onClick={() => setAlertsOpen(true)}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {tr.header.alerts}
          </button>
          {isAdmin && (
            <Link to="/admin" className="text-xs font-semibold text-primary transition-colors hover:text-primary/80">
              {tr.header.admin}
            </Link>
          )}
          <LangSwitch compact />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        {market === "b3" ? (
          <B3Module asset={b3Asset} onAsset={setB3Asset} />
        ) : market !== "crypto" ? (
          <MarketPlaceholder module={market} onBack={() => setMarket("crypto")} />
        ) : (
          <>
        <PriceHeader
          asset={asset}
          payload={payload}
          updatedAt={updatedAt}
          livePrice={livePrice}
          read={marketRead.read}
          readLoading={canSmart && marketRead.loading}
          onOpenRead={() => setTab("indicadores")}
        />

        <TabBar tab={tab} onTab={setTab} advanced={advanced} canSmart={canSmart} />

        {tab === "macro" && <MacroTab asset={asset} pro={advanced} />}
        {tab === "indicadores" &&
          (canSmart ? (
            <IndicatorsTab
              asset={asset}
              read={marketRead.read}
              leans={marketRead.leans}
              biasHist={marketRead.biasHist}
              loading={marketRead.loading}
            />
          ) : (
            <LockedTab title={tr.tabs.indicators} plan="Expert" />
          ))}
        {tab === "smart" &&
          (canSmart ? (
            <SmartMoneyTab asset={asset} />
          ) : (
            <LockedTab title={tr.tabs.smart} plan="Expert" />
          ))}
        {tab === "reports" && <ReportsTab asset={asset} plan={plan} isExpert={isExpert} />}

        {tab === "cockpit" && (
          <>
        {advanced && cockpitRead && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
            <span className="mr-1.5" aria-hidden>🧭</span>
            {cockpitRead}
          </div>
        )}
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
            layers={effectiveLayers}
            canUseLayers={canUseLayers}
            walls={walls}
            oiSeries={oiSeries}
            onPrice={setLivePrice}
          />
          <LayerToggles layers={layers} onToggle={toggleLayer} access={access} showUpsell={!advanced} />
          {canUseLayers && effectiveLayers.cvd && (
            <>
              <VolumeDeltaSubchart data={cvdSeries} title={`${tr.subchart.cvdRetail} (Binance · ${timeframe.toUpperCase()})`} />
              {isExpert ? (
                <CvdSubchart data={series.cvdInst} title={tr.subchart.cvdInst} />
              ) : (
                <LockedSubchart title={tr.subchart.cvdInstLocked} hint={tr.subchart.cvdInstHint} plan="Expert" />
              )}
            </>
          )}
          {canUseLayers && effectiveLayers.bookPressure && (
            <>
              <CvdSubchart data={bookSeries} title={advanced ? tr.subchart.bookAll : tr.subchart.bookRetail} />
              {!isExpert && (
                <LockedSubchart title={tr.subchart.bookInstLocked} hint={tr.subchart.bookInstHint} plan="Expert" />
              )}
            </>
          )}
          {canUseLayers && effectiveLayers.funding && <FundingStrip data={series.funding} />}
          {canUseLayers && effectiveLayers.liquidations && <LiquidationsStrip data={series.liquidations} />}
        </section>

        {/* Painel Gamma (BTC/ETH/SOL, Pro+). Bloqueado, mostra os recursos do módulo
            como teasers: Gamma e — só em BTC/ETH — o Fluxo de opções (HIRO). */}
        {isOptionAsset && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{tr.cockpit.gammaModule}</h2>
            {advanced ? (
              <GammaPanel gamma={payload?.gamma ?? null} asset={asset} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <LockedCard title={tr.cockpit.gammaLocked} />
                {asset !== "BNB" && (
                  <LockedCard title={tr.cockpit.hiroLocked} />
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
                <h2 className="mb-3 text-sm font-semibold text-foreground">{tr.cockpit.volTitle}</h2>
                <LockedCard title={tr.cockpit.volLocked} />
              </>
            )}
          </section>
        )}

        {/* Cards de métricas — separados por audiência: varejo × institucional (§8.6.3) */}
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">{tr.cockpit.flowSection}</h2>

          {/* ── Varejo e alavancagem (perps, fluxo e posicionamento do varejo) ── */}
          <div className="mb-3 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
            <span>{tr.cockpit.retailGroup}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard title="Fear & Greed" reading={fng} source="Alternative.me" timestamp={updatedAt} info={GLOSSARY.fng} />
            {advanced ? (
              <>
                <MetricCard title={tr.cockpit.fundingCex} reading={readFunding(d?.funding_rate == null ? null : d.funding_rate / 100)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.fundingCex} />
                <MetricCard title={tr.cockpit.fundingOnchain} reading={readFunding(onchain?.funding_rate)} source="Hyperliquid" timestamp={updatedAt} info={GLOSSARY.fundingOnchain} />
                <MetricCard
                  title={tr.cockpit.cvdRetail}
                  info={GLOSSARY.cvd}
                  reading={readCvd(
                    payload?.price?.binance?.cvd == null && payload?.price?.okx?.cvd == null
                      ? d?.cvd
                      : (payload?.price?.binance?.cvd ?? 0) + (payload?.price?.okx?.cvd ?? 0),
                  )}
                  source="Binance + OKX"
                  timestamp={updatedAt}
                />
                <MetricCard title={tr.cockpit.longShort} reading={readLongShort(d?.long_short_ratio)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.longShort} />
                <MetricCard title={tr.cockpit.liquidations} reading={readLiquidations(d?.liq_long_usd, d?.liq_short_usd)} source="Coinalyze" timestamp={updatedAt} info={GLOSSARY.liquidations} />
                <MetricCard
                  title={tr.cockpit.squeezeRisk}
                  reading={readSqueezeRisk(
                    d?.funding_rate == null ? null : d.funding_rate / 100,
                    d?.long_short_ratio,
                    d?.liq_long_usd,
                    d?.liq_short_usd,
                    payload?.price?.binance?.cvd == null && payload?.price?.okx?.cvd == null
                      ? d?.cvd
                      : (payload?.price?.binance?.cvd ?? 0) + (payload?.price?.okx?.cvd ?? 0),
                  )}
                  source="Coinalyze"
                  timestamp={updatedAt}
                  info={GLOSSARY.squeezeRisk}
                />
                <OIDeltaCard asset={asset} timestamp={updatedAt} />
                <OrderbookImbalanceCard data={imbalance.varejo} title={tr.cockpit.bookRetail} source="Binance + OKX" timestamp={updatedAt} info={GLOSSARY.bookImbalance} />
              </>
            ) : (
              <>
                <LockedCard title={tr.cockpit.lockedFundingGex} />
                <LockedCard title={tr.cockpit.lockedCvd} />
                <LockedCard title={tr.cockpit.lockedLongShort} />
                <LockedCard title={tr.cockpit.lockedLiq} />
              </>
            )}
          </div>

          {/* ── Institucional e estrutural (spot/smart money, capital estrutural) ── */}
          <div className="mb-3 mt-6 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>{tr.cockpit.instGroup}</span>
            <span className="h-px flex-1 bg-primary/25" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {isExpert ? (
              <>
                <MetricCard
                  institutional
                  title={tr.cockpit.instBias}
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
                  source={tr.cockpit.instBiasSource}
                  timestamp={updatedAt}
                />
                <OrderbookImbalanceCard data={imbalance.institucional} title={tr.cockpit.bookInst} source="Coinbase" institutional timestamp={updatedAt} info={GLOSSARY.bookImbalance} />
                {defi && (
                  <MetricCard institutional title={tr.cockpit.defiHealth} reading={readTvl(defi.tvl_usd, defi.stablecoin_flow_24h)} source="DefiLlama" timestamp={updatedAt} info={GLOSSARY.tvl} />
                )}
                {dex && (
                  <MetricCard
                    institutional
                    title={tr.cockpit.dexLiquidity}
                    info={GLOSSARY.dexLiquidity}
                    reading={{
                      label: `${dex.pair}: ${fmtUsd(dex.liquidity_usd)} ${tr.cockpit.dexLiquiditySuffix}`,
                      detail: `${tr.cockpit.vol24h} ${fmtUsd(dex.volume_24h)}`,
                      level: "neutral",
                    }}
                    source="DexScreener"
                    timestamp={updatedAt}
                  />
                )}
                {macro && (
                  <MetricCard
                    institutional
                    title={tr.cockpit.marketMacro}
                    info={GLOSSARY.macroMarket}
                    reading={{
                      label: `${tr.cockpit.btcDominance} ${fmtPct(macro.btc_dominance, 1)} · mcap ${fmtUsd(macro.total_mcap)}`,
                      detail: `${tr.cockpit.btcDominance} ${fmtPct(macro.btc_dominance, 2)} · ${tr.cockpit.totalMcap} ${fmtUsd(macro.total_mcap)}`,
                      level: "neutral",
                    }}
                    source="CoinGecko"
                    timestamp={updatedAt}
                  />
                )}
                {payload?.etf_flows && (
                  <MetricCard
                    institutional
                    title={tr.cockpit.etfSpot}
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
                    title={tr.cockpit.optionsHedge}
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
                <LockedCard institutional plan="Expert" title={tr.cockpit.lockedInstBias} />
                <LockedCard institutional plan="Expert" title={tr.cockpit.lockedBookInst} />
                <LockedCard institutional plan="Expert" title={tr.cockpit.lockedEtf} />
                <LockedCard institutional plan="Expert" title={tr.cockpit.lockedMacro} />
                <LockedCard institutional plan="Expert" title={tr.cockpit.lockedHedge} />
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
