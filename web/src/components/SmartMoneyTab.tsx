import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useCvd } from "../hooks/useCvd";
import { useOpenInterest, type OiPoint } from "../hooks/useOpenInterest";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePlan } from "../hooks/usePlan";
import { fmtPrice, fmtUsd } from "../lib/format";
import { buildLiquidationGrid } from "../lib/liquidationModel";
import { computeVolumeProfile, fetchKlines, CURATED_ASSETS, type Candle, type Timeframe } from "../lib/marketData";
import { computeSmc, type SmcResult } from "../lib/smc";
import { buildConfluenceSources, type ConfluenceSource, type GammaLevels, type WallLevel } from "../lib/smcConfluence";
import { buildKeyLevels, buildNarrative, type KeyLevel, type ReadingLine, type Tone } from "../lib/smcNarrative";
import { GLOSSARY } from "../lib/glossary";
import { supabase } from "../lib/supabase";
import InfoTip from "./InfoTip";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "./SmartMoneyChart";
import SmcAssetPicker from "./SmcAssetPicker";
import VolumeDeltaSubchart from "./VolumeDeltaSubchart";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
];

const TF_LABEL: Record<string, string> = { "1d": "1D", "4h": "4h", "1h": "1h" };

const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  bad: "bg-rose-500",
  warn: "bg-amber-500",
  neutral: "bg-muted",
};

const BIAS_TONE: Record<string, string> = {
  bullish: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  bearish: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  neutral: "border-border text-muted-foreground",
};

const biasDot = (b: "bullish" | "bearish" | "neutral") =>
  b === "bullish" ? "bg-emerald-500" : b === "bearish" ? "bg-rose-500" : "bg-muted";

const LAYER_LABELS: { key: keyof SmcLayers; label: string; help: string }[] = [
  { key: "orderBlocks", label: "Order Blocks", help: "Order blocks — zonas onde a mão forte posicionou (última vela antes de um movimento forte). Viram suporte (demanda) ou resistência (oferta)." },
  { key: "fvg", label: "Imbalance", help: "Imbalance / FVG (Fair Value Gap) — gap de 3 velas onde o preço passou rápido demais. Tende a ser preenchido depois (ímã)." },
  { key: "liquidity", label: "Liquidez", help: "Zonas de liquidez — aglomerados de stops (topos/fundos iguais). Funcionam como ímãs; o preço costuma buscá-los." },
  { key: "zones", label: "Zonas", help: "Premium/Discount — metade cara (premium, zona de venda) e barata (discount, zona de compra) do range, com o equilíbrio no meio." },
  { key: "equal", label: "EQH/EQL", help: "EQH/EQL — topos iguais (Equal Highs) e fundos iguais (Equal Lows): regiões com liquidez acumulada logo acima/abaixo." },
  { key: "structure", label: "BOS/CHoCH", help: "BOS = rompimento de estrutura (continuação da tendência); CHoCH = mudança de caráter (possível reversão)." },
];

// Indicadores de mercado (calculados das velas da Binance — sem dados do coletor;
// funcionam em qualquer das 100 moedas). Mesmo esquema de toggle das camadas SMC.
const MARKET_LAYERS: { key: keyof SmcLayers; label: string; help: string }[] = [
  { key: "volumeProfile", label: "Volume Profile", help: "POC (preço com mais volume negociado) e Value Area (faixa de 70% do volume) — ímãs e suporte/resistência, calculados do volume das velas." },
  { key: "cvd", label: "CVD / Volume Delta", help: "Volume delta acumulado (comprador agressor − vendedor) das velas da Binance, em painel abaixo do gráfico. Subindo = compradores no comando; divergir do preço é o sinal mais valioso." },
  { key: "liquidations", label: "Liquidações", help: "Heatmap estimado de bolsões de liquidação (modelo de alavancagem sobre as velas). Zonas quentes funcionam como ímãs de preço." },
];

// Explicação por tipo de leitura (tooltip ⓘ no título do card)
const READING_HELP: Record<string, string> = {
  "Estrutura de mercado": "Direção dada pela sequência de topos e fundos. BOS = rompimento (continuação); CHoCH = mudança de caráter (possível reversão).",
  "Estrutura interna": "A estrutura num grau menor (curto prazo). Quando diverge da principal, costuma anteceder pivôs ou pullbacks.",
  "Zona de preço": "Onde o preço está no range: Discount (barato, zona de compra da mão forte), Premium (caro, zona de venda) ou Equilíbrio.",
  "Alvo de liquidez acima": "Pool de liquidez = aglomerado de stops acima do preço. Ímã provável — o preço tende a buscá-lo antes de seguir.",
  "Alvo de liquidez abaixo": "Pool de liquidez = aglomerado de stops abaixo do preço. Ímã provável — o preço tende a buscá-lo antes de seguir.",
  "Resistência (order block)": "Order block de oferta acima do preço — zona onde vendedores tendem a reagir (possível resistência).",
  "Suporte (order block)": "Order block de demanda abaixo do preço — zona onde compradores tendem a reagir (possível suporte).",
  "Varredura de liquidez": "Stop hunt: o preço varre uma região de stops e reverte. Sinal clássico de manipulação da mão forte antes do movimento real.",
};

const CONF_STYLE: Record<string, string> = {
  gamma: "border-primary/40 text-primary",
  wall: "border-border text-muted-foreground",
  vp: "border-sky-500/40 text-sky-400",
  liq: "border-amber-500/40 text-amber-400",
};

/** Preços dos bolsões de liquidação mais fortes (coluna atual do heatmap estimado). */
function liqMagnets(candles: Candle[], oi: OiPoint[], topN = 3): number[] {
  const grid = buildLiquidationGrid(candles, oi);
  if (!grid) return [];
  const col = grid.nCols - 1;
  const span = grid.priceTop - grid.priceBottom;
  const bins: { price: number; v: number }[] = [];
  for (let b = 0; b < grid.nBins; b++) {
    const v = grid.values[col * grid.nBins + b];
    if (v > 0) bins.push({ price: grid.priceTop - ((b + 0.5) / grid.nBins) * span, v });
  }
  bins.sort((a, b) => b.v - a.v);
  const out: number[] = [];
  for (const bn of bins) {
    if (out.every((p) => Math.abs(p - bn.price) > span * 0.02)) out.push(bn.price);
    if (out.length >= topN) break;
  }
  return out;
}

export default function SmartMoneyTab({ asset }: { asset: string }) {
  const { user } = useAuth();
  const { plan } = usePlan(user?.id);
  const channels = plan?.alert_channels ?? [];
  // O Smart Money (Expert) pode ir além das moedas curadas e LEMBRA a última moeda,
  // timeframe e camadas (persistido em localStorage). Inicia na última escolhida;
  // na 1ª vez, no ativo global do cockpit. As não-curadas só têm price-action.
  const [smcAsset, setSmcAsset] = usePersistentState<string>("cm.smc-asset", asset);
  const isCurated = CURATED_ASSETS.includes(smcAsset);
  const oiSeries = useOpenInterest(smcAsset, plan);
  const [alertedIdx, setAlertedIdx] = useState<number | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [tf, setTf] = usePersistentState<Timeframe>("cm.smc-tf", "1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [smc, setSmc] = useState<SmcResult | null>(null);
  const [sources, setSources] = useState<ConfluenceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = usePersistentState<SmcLayers>("cm.smc-layers", DEFAULT_LAYERS, true);
  const toggleLayer = (key: keyof SmcLayers) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const [mtf, setMtf] = useState<{ tf: Timeframe; bias: "bullish" | "bearish" | "neutral" }[]>([]);
  // Volume Delta / CVD por candle (klines) — só busca com a camada CVD ligada.
  const cvdSeries = useCvd(smcAsset, tf, layers.cvd);

  useEffect(() => {
    let active = true;

    // silent = refresh automático (não pisca o "carregando" nem reenquadra o gráfico)
    const run = async (silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const klines = await fetchKlines(smcAsset, tf, 320);
        if (!active) return;
        setCandles(klines);
        setSmc(computeSmc(klines));

        // Confluência: gamma (opções) + paredes do book — dados que a plataforma já coleta
        const [gammaRes, wallsRes] = await Promise.all([
          supabase
            .from("gamma_profile")
            .select("call_wall, put_wall, zero_gamma_level, max_pain, ts")
            .eq("asset", smcAsset)
            .order("ts", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("orderbook_walls")
            .select("side, price, notional_usd, ts")
            .eq("asset", smcAsset)
            .order("ts", { ascending: false })
            .limit(40),
        ]);
        if (!active) return;
        const gamma = (gammaRes.data as GammaLevels | null) ?? null;
        const wallRows = (wallsRes.data as (WallLevel & { ts: string })[]) ?? [];
        const latestTs = wallRows[0]?.ts;
        const walls = wallRows.filter((w) => w.ts === latestTs);
        setSources(buildConfluenceSources(gamma, walls, (v) => fmtUsd(v)));
      } catch (e) {
        if (active && !silent) setError(e instanceof Error ? e.message : "Falha ao carregar dados de mercado");
      } finally {
        if (active && !silent) setLoading(false);
      }
    };

    run(false);
    // Atualização automática a cada 60s (só com a aba visível) + ao voltar pra aba
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run(true);
    }, 60000);
    const onVis = () => {
      if (document.visibilityState === "visible") run(true);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [smcAsset, tf]);

  // Viés multi-timeframe (top-down): calcula a estrutura em 1D/4h/1h
  useEffect(() => {
    let active = true;
    const tfs: Timeframe[] = ["1d", "4h", "1h"];
    setMtf([]);
    (async () => {
      const out = await Promise.all(
        tfs.map(async (t) => {
          try {
            const k = await fetchKlines(smcAsset, t, 320);
            const r = computeSmc(k);
            return { tf: t, bias: (r?.swingBias ?? "neutral") as "bullish" | "bearish" | "neutral" };
          } catch {
            return { tf: t, bias: "neutral" as const };
          }
        }),
      );
      if (active) setMtf(out);
    })();
    return () => {
      active = false;
    };
  }, [smcAsset]);

  // Volume Profile (POC/VA) dos candles — reusado na confluência e no gráfico.
  const vp = useMemo(() => (candles.length ? computeVolumeProfile(candles) : null), [candles]);

  // Confluência enriquecida: gamma + book (sources) + POC/Value Area + bolsões de liquidação
  const allSources = useMemo(() => {
    const extra: ConfluenceSource[] = [];
    if (vp) {
      extra.push({ kind: "vp", label: "POC", price: vp.poc });
      extra.push({ kind: "vp", label: "VA High", price: vp.vah });
      extra.push({ kind: "vp", label: "VA Low", price: vp.val });
    }
    if (candles.length) {
      liqMagnets(candles, oiSeries).forEach((p, i) =>
        extra.push({ kind: "liq", label: i === 0 ? "Liquidação (forte)" : "Liquidação", price: p }),
      );
    }
    return [...sources, ...extra];
  }, [sources, candles, oiSeries, vp]);

  const bias = smc?.swingBias ?? "neutral";
  const keyLevels: KeyLevel[] = smc ? buildKeyLevels(smc, allSources) : [];
  const narrative: ReadingLine[] = smc ? buildNarrative(smc, allSources) : [];

  // Cria um alerta de preço no nível SMC (reaproveita o módulo de Alertas).
  async function createAlert(lvl: KeyLevel, idx: number) {
    setAlertError(null);
    if (!user || !smc) return;
    if (channels.length === 0) {
      setAlertError("Alertas disponíveis nos planos Pro/Expert.");
      return;
    }
    const op = lvl.price >= smc.price ? ">" : "<";
    const { error } = await supabase.from("alerts").insert({
      user_id: user.id,
      asset: smcAsset,
      metric: "price",
      condition: { op, value: Math.round(lvl.price) },
      channel: channels[0],
    });
    if (error) {
      setAlertError(error.message);
      return;
    }
    setAlertedIdx(idx);
    setTimeout(() => setAlertedIdx((cur) => (cur === idx ? null : cur)), 2500);
  }

  return (
    <section className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Smart Money</h2>
          <SmcAssetPicker current={smcAsset} onChange={setSmcAsset} />
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${BIAS_TONE[bias]}`}>
            Viés: {bias === "bullish" ? "alta" : bias === "bearish" ? "baixa" : "indefinido"}
            <InfoTip text={GLOSSARY.bias} />
          </span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Atualiza automaticamente a cada 60s">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> ao vivo
          </span>
        </div>
      </div>

      {/* Tendência multi-timeframe (top-down) + medidor de range */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card dark:bg-card/60 p-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Tendência (top-down):
            <InfoTip text="Viés da estrutura em vários timeframes (1D/4h/1h). Operar a favor do timeframe maior aumenta a chance — princípio nº1 do Smart Money." />
          </span>
          {mtf.length === 0 ? (
            <span className="text-xs text-muted-foreground">calculando…</span>
          ) : (
            mtf.map((m) => (
              <span key={m.tf} className={`rounded-full border px-2 py-0.5 text-xs ${BIAS_TONE[m.bias]}`}>
                {TF_LABEL[m.tf] ?? m.tf} · {m.bias === "bullish" ? "alta" : m.bias === "bearish" ? "baixa" : "neutro"}
              </span>
            ))
          )}
        </div>
        {smc && <PremiumDiscountGauge smc={smc} />}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>
      )}

      {!isCurated && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
          <span aria-hidden className="mt-px">⚠</span>
          <span>
            <b>{smcAsset}</b> está fora da lista institucional: leitura por <b>price-action puro</b>{" "}
            (velas da Binance). Sem gamma, paredes do book e dados do coletor — a confluência fica
            limitada a POC/Value Area e bolsões de liquidação.
          </span>
        </div>
      )}

      {/* Leitura automática em PT */}
      {narrative.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {narrative.map((l, i) => (
            <div key={i} className="flex gap-2 rounded-xl border border-border bg-card dark:bg-card/60 p-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[l.tone]}`} />
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  {l.title}
                  {READING_HELP[l.title] && <InfoTip text={READING_HELP[l.title]} />}
                </div>
                <div className="text-xs text-muted-foreground">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico SMC */}
      <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-3">
        {/* Camadas (esquerda) + timeframe (direita) — controlam o gráfico abaixo */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {LAYER_LABELS.map(({ key, label, help }) => (
              <span
                key={key}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  layers[key] ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <button type="button" onClick={() => toggleLayer(key)} className="hover:opacity-80">
                  {label}
                </button>
                <InfoTip text={help} />
              </span>
            ))}
            <span className="mx-0.5 h-4 w-px bg-border" />
            {MARKET_LAYERS.map(({ key, label, help }) => (
              <span
                key={key}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  layers[key] ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                <button type="button" onClick={() => toggleLayer(key)} className="hover:opacity-80">
                  {label}
                </button>
                <InfoTip text={help} />
              </span>
            ))}
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-background p-0.5">
            {TFS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTf(t.id)}
                className={`rounded-md px-3 py-1 text-xs transition-colors ${
                  tf === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading && candles.length === 0 ? (
          <div className="grid h-[380px] place-items-center text-sm text-muted-foreground">Carregando estrutura…</div>
        ) : (
          <SmartMoneyChart candles={candles} smc={smc} layers={layers} viewKey={`${smcAsset}-${tf}`} vp={vp} oiSeries={oiSeries} asset={smcAsset} tf={tf} />
        )}
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          Zonas: <span className="text-emerald-600 dark:text-emerald-400">verde</span> = demanda/discount ·{" "}
          <span className="text-rose-600 dark:text-rose-400">vermelho</span> = oferta/premium ·{" "}
          <span className="text-amber-500">âmbar</span> = liquidez · <span className="text-purple-400">violeta</span> = imbalance (FVG) ·
          EQH/EQL = topos/fundos iguais · setas = BOS/CHoCH. Tudo calculado dos candles.
        </p>
      </div>

      {/* Volume Delta / CVD (klines) — painel abaixo do gráfico, qualquer moeda */}
      {layers.cvd && (
        <VolumeDeltaSubchart data={cvdSeries} title={`Volume Delta · CVD (Binance · ${tf.toUpperCase()})`} />
      )}

      {/* Tabela de níveis-chave com confluência */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card dark:bg-card/60">
        <div className="flex items-baseline justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Níveis-chave por confluência</h3>
          <span className="text-xs text-muted-foreground">SMC × book × gamma × POC × liquidação — ordenado por distância</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Nível</th>
                <th className="px-4 py-2 text-right font-medium">Preço</th>
                <th className="px-4 py-2 text-right font-medium">Distância</th>
                <th className="px-4 py-2 font-medium">Confluência</th>
                <th className="px-4 py-2 text-right font-medium">Alerta</th>
              </tr>
            </thead>
            <tbody>
              {keyLevels.slice(0, 14).map((lvl, i) => (
                <tr
                  key={i}
                  className={`border-b border-border ${
                    lvl.confluence.some((c) => c.strength === "exact") || lvl.confluence.length >= 2 ? "bg-primary/5" : ""
                  } ${lvl.swept ? "opacity-50" : ""}`}
                >
                  <td
                    className="border-l-2 px-4 py-2.5"
                    style={{ borderLeftColor: lvl.bias === "bullish" ? "#22c55e" : lvl.bias === "bearish" ? "#ef4444" : "#475569" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${biasDot(lvl.bias)}`} />
                      <span className="text-foreground">{lvl.label}</span>
                    </div>
                    {lvl.note && <div className="pl-4 text-[11px] text-muted-foreground">{lvl.note}</div>}
                  </td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right text-foreground">{fmtPrice(lvl.price)}</td>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">
                    {lvl.distancePct >= 0 ? "+" : ""}
                    {lvl.distancePct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {lvl.confluence.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {lvl.confluence.map((c, j) => (
                          <span
                            key={j}
                            title={c.strength === "near" ? "confluência próxima (~1%)" : "confluência exata"}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${CONF_STYLE[c.source.kind] ?? CONF_STYLE.wall} ${
                              c.strength === "near" ? "border-dashed opacity-70" : ""
                            }`}
                          >
                            {c.source.label}
                            {c.strength === "near" ? " ~" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => createAlert(lvl, i)}
                      className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                        alertedIdx === i
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {alertedIdx === i ? "✓ criado" : "🔔 alerta"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && keyLevels.length === 0 && (
          <div className="grid place-items-center py-8 text-sm text-muted-foreground">Sem níveis suficientes neste timeframe.</div>
        )}
      </div>
      {alertError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{alertError}</p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          🔔 cria um alerta de preço no nível (toque acima → dispara na subida; abaixo → na descida). Gerencie em{" "}
          <Link to="/alerts" className="text-primary hover:underline">Alertas</Link>.
        </p>
      )}

      {/* Nota on-chain (futuro) */}
      <p className="text-[11px] text-muted-foreground">
        Em breve: camada on-chain (exchange netflow, whale alerts, MVRV, unlocks) quando houver fonte de dados dedicada.
      </p>
    </section>
  );
}

/** Medidor da posição do preço dentro do range (0% = fundo/discount, 100% = topo/premium). */
function PremiumDiscountGauge({ smc }: { smc: SmcResult }) {
  const range = smc.trailingTop - smc.trailingBottom;
  const pos = range > 0 ? Math.max(0, Math.min(1, (smc.price - smc.trailingBottom) / range)) : 0.5;
  const zone = smc.price >= smc.premium.bottom ? "Premium" : smc.price <= smc.discount.top ? "Discount" : "Equilíbrio";
  const zoneColor = zone === "Premium" ? "text-rose-600 dark:text-rose-400" : zone === "Discount" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">Posição no range <InfoTip text={GLOSSARY.rangePosition} /></span>
        <span className={`num ${zoneColor}`}>
          {(pos * 100).toFixed(0)}% · {zone}
        </span>
      </div>
      <div
        className="relative mt-2 h-2 rounded-full"
        style={{ background: "linear-gradient(to right, rgba(34,197,94,0.5), rgba(148,163,184,0.3), rgba(239,68,68,0.5))" }}
      >
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Discount</span>
        <span>Equilíbrio</span>
        <span>Premium</span>
      </div>
    </div>
  );
}
