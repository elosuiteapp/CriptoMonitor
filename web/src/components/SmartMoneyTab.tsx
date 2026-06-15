import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useOpenInterest, type OiPoint } from "../hooks/useOpenInterest";
import { usePlan } from "../hooks/usePlan";
import { fmtPrice, fmtUsd } from "../lib/format";
import { buildLiquidationGrid } from "../lib/liquidationModel";
import { computeVolumeProfile, fetchKlines, type Candle, type Timeframe } from "../lib/marketData";
import { computeSmc, type SmcResult } from "../lib/smc";
import { buildConfluenceSources, type ConfluenceSource, type GammaLevels, type WallLevel } from "../lib/smcConfluence";
import { buildKeyLevels, buildNarrative, type KeyLevel, type ReadingLine, type Tone } from "../lib/smcNarrative";
import { supabase } from "../lib/supabase";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "./SmartMoneyChart";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
];

const TF_LABEL: Record<string, string> = { "1d": "1D", "4h": "4h", "1h": "1h" };

const TONE_DOT: Record<Tone, string> = {
  good: "bg-signal-green",
  bad: "bg-signal-red",
  warn: "bg-signal-yellow",
  neutral: "bg-slate-500",
};

const BIAS_TONE: Record<string, string> = {
  bullish: "border-signal-green/40 text-signal-green",
  bearish: "border-signal-red/40 text-signal-red",
  neutral: "border-ink-500 text-slate-400",
};

const biasDot = (b: "bullish" | "bearish" | "neutral") =>
  b === "bullish" ? "bg-signal-green" : b === "bearish" ? "bg-signal-red" : "bg-slate-500";

const LAYER_LABELS: { key: keyof SmcLayers; label: string }[] = [
  { key: "orderBlocks", label: "Order Blocks" },
  { key: "fvg", label: "Imbalance" },
  { key: "liquidity", label: "Liquidez" },
  { key: "zones", label: "Zonas" },
  { key: "equal", label: "EQH/EQL" },
  { key: "structure", label: "BOS/CHoCH" },
];

const CONF_STYLE: Record<string, string> = {
  gamma: "border-accent/40 text-accent",
  wall: "border-slate-500/40 text-slate-300",
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
  const oiSeries = useOpenInterest(asset, plan);
  const [alertedIdx, setAlertedIdx] = useState<number | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [tf, setTf] = useState<Timeframe>("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [smc, setSmc] = useState<SmcResult | null>(null);
  const [sources, setSources] = useState<ConfluenceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<SmcLayers>(DEFAULT_LAYERS);
  const toggleLayer = (key: keyof SmcLayers) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const [mtf, setMtf] = useState<{ tf: Timeframe; bias: "bullish" | "bearish" | "neutral" }[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const klines = await fetchKlines(asset, tf, 320);
        if (!active) return;
        const result = computeSmc(klines);
        setCandles(klines);
        setSmc(result);

        // Confluência: gamma (opções) + paredes do book — dados que a plataforma já coleta
        const [gammaRes, wallsRes] = await Promise.all([
          supabase
            .from("gamma_profile")
            .select("call_wall, put_wall, zero_gamma_level, max_pain, ts")
            .eq("asset", asset)
            .order("ts", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("orderbook_walls")
            .select("side, price, notional_usd, ts")
            .eq("asset", asset)
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
        if (active) setError(e instanceof Error ? e.message : "Falha ao carregar dados de mercado");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [asset, tf]);

  // Viés multi-timeframe (top-down): calcula a estrutura em 1D/4h/1h
  useEffect(() => {
    let active = true;
    const tfs: Timeframe[] = ["1d", "4h", "1h"];
    setMtf([]);
    (async () => {
      const out = await Promise.all(
        tfs.map(async (t) => {
          try {
            const k = await fetchKlines(asset, t, 320);
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
  }, [asset]);

  // Confluência enriquecida: gamma + book (sources) + POC/Value Area + bolsões de liquidação
  const allSources = useMemo(() => {
    const extra: ConfluenceSource[] = [];
    if (candles.length) {
      const vp = computeVolumeProfile(candles);
      if (vp) {
        extra.push({ kind: "vp", label: "POC", price: vp.poc });
        extra.push({ kind: "vp", label: "VA High", price: vp.vah });
        extra.push({ kind: "vp", label: "VA Low", price: vp.val });
      }
      liqMagnets(candles, oiSeries).forEach((p, i) =>
        extra.push({ kind: "liq", label: i === 0 ? "Liquidação (forte)" : "Liquidação", price: p }),
      );
    }
    return [...sources, ...extra];
  }, [sources, candles, oiSeries]);

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
      asset,
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
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-300">Smart Money · {asset}</h2>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${BIAS_TONE[bias]}`}>
            Viés: {bias === "bullish" ? "alta" : bias === "bearish" ? "baixa" : "indefinido"}
          </span>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-600 bg-ink-800/60 p-0.5">
          {TFS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTf(t.id)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                tf === t.id ? "bg-accent/20 text-accent" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tendência multi-timeframe (top-down) + medidor de range */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-ink-600 bg-ink-800/60 p-3">
          <span className="text-xs text-slate-400">Tendência (top-down):</span>
          {mtf.length === 0 ? (
            <span className="text-xs text-slate-600">calculando…</span>
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
        <div className="rounded-xl border border-signal-red/40 bg-signal-red/10 p-4 text-sm text-signal-red">{error}</div>
      )}

      {/* Leitura automática em PT */}
      {narrative.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {narrative.map((l, i) => (
            <div key={i} className="flex gap-2 rounded-xl border border-ink-600 bg-ink-800/60 p-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[l.tone]}`} />
              <div>
                <div className="text-xs font-semibold text-slate-300">{l.title}</div>
                <div className="text-xs text-slate-400">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico SMC */}
      <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-3">
        {/* Toggles de camadas */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {LAYER_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                layers[key]
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-ink-500 text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && candles.length === 0 ? (
          <div className="grid h-[380px] place-items-center text-sm text-slate-500">Carregando estrutura…</div>
        ) : (
          <SmartMoneyChart candles={candles} smc={smc} layers={layers} />
        )}
        <p className="mt-2 px-1 text-[11px] text-slate-500">
          Zonas: <span className="text-signal-green">verde</span> = demanda/discount ·{" "}
          <span className="text-signal-red">vermelho</span> = oferta/premium ·{" "}
          <span className="text-amber-500">âmbar</span> = liquidez · <span className="text-purple-400">violeta</span> = imbalance (FVG) ·
          EQH/EQL = topos/fundos iguais · setas = BOS/CHoCH. Tudo calculado dos candles.
        </p>
      </div>

      {/* Tabela de níveis-chave com confluência */}
      <div className="overflow-hidden rounded-2xl border border-ink-600 bg-ink-800/60">
        <div className="flex items-baseline justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-300">Níveis-chave por confluência</h3>
          <span className="text-xs text-slate-500">SMC × book × gamma × POC × liquidação — ordenado por distância</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-600 text-xs uppercase text-slate-500">
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
                  className={`border-b border-ink-700/60 ${
                    lvl.confluence.some((c) => c.strength === "exact") || lvl.confluence.length >= 2 ? "bg-accent/5" : ""
                  } ${lvl.swept ? "opacity-50" : ""}`}
                >
                  <td
                    className="border-l-2 px-4 py-2.5"
                    style={{ borderLeftColor: lvl.bias === "bullish" ? "#22c55e" : lvl.bias === "bearish" ? "#ef4444" : "#475569" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${biasDot(lvl.bias)}`} />
                      <span className="text-slate-200">{lvl.label}</span>
                    </div>
                    {lvl.note && <div className="pl-4 text-[11px] text-slate-500">{lvl.note}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-300">{fmtPrice(lvl.price)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-400">
                    {lvl.distancePct >= 0 ? "+" : ""}
                    {lvl.distancePct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {lvl.confluence.length === 0 ? (
                      <span className="text-slate-600">—</span>
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
                          ? "border-signal-green/40 text-signal-green"
                          : "border-ink-500 text-slate-400 hover:bg-ink-700 hover:text-slate-200"
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
          <div className="grid place-items-center py-8 text-sm text-slate-500">Sem níveis suficientes neste timeframe.</div>
        )}
      </div>
      {alertError ? (
        <p className="text-xs text-signal-red">{alertError}</p>
      ) : (
        <p className="text-[11px] text-slate-500">
          🔔 cria um alerta de preço no nível (toque acima → dispara na subida; abaixo → na descida). Gerencie em{" "}
          <Link to="/alerts" className="text-accent hover:underline">Alertas</Link>.
        </p>
      )}

      {/* Nota on-chain (futuro) */}
      <p className="text-[11px] text-slate-600">
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
  const zoneColor = zone === "Premium" ? "text-signal-red" : zone === "Discount" ? "text-signal-green" : "text-slate-400";
  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-800/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Posição no range</span>
        <span className={zoneColor}>
          {(pos * 100).toFixed(0)}% · {zone}
        </span>
      </div>
      <div
        className="relative mt-2 h-2 rounded-full"
        style={{ background: "linear-gradient(to right, rgba(34,197,94,0.5), rgba(148,163,184,0.3), rgba(239,68,68,0.5))" }}
      >
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink-900"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>Discount</span>
        <span>Equilíbrio</span>
        <span>Premium</span>
      </div>
    </div>
  );
}
