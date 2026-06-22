import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3Macro, type B3MacroData } from "../../lib/b3";
import { computeVolumeProfile, type Candle, type Timeframe, type VolumeProfile } from "../../lib/marketData";
import { computeSmc, type SmcResult } from "../../lib/smc";
import { buildConfluenceSources, type ConfluenceSource } from "../../lib/smcConfluence";
import { buildKeyLevels, buildNarrative, type KeyLevel, type ReadingLine, type Tone } from "../../lib/smcNarrative";
import InfoTip from "../InfoTip";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "../SmartMoneyChart";
import { PillRow, TogglePill } from "../TogglePill";
import { Cell, ComingSoon, toneCls } from "./B3Shared";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "15m", label: "15M" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4h" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
  { id: "1M", label: "1M" },
];
const TF_LABEL: Record<string, string> = { "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1S", "1M": "1Mês" };
const HIGHER_TF: Partial<Record<Timeframe, Timeframe>> = { "15m": "1h", "1h": "4h", "4h": "1d", "1d": "1w", "1w": "1M" };

// Camadas que funcionam na B3 (matemática de candles). CVD e Liquidações ficam de fora
// (precisam de fluxo agressor / open interest — sem fonte grátis na B3).
const B3_DEFAULT_LAYERS: SmcLayers = { ...DEFAULT_LAYERS, cvd: false, liquidations: false };
const LAYERS: { key: keyof SmcLayers; label: string; color: string; help: string }[] = [
  { key: "orderBlocks", label: "Order Blocks", color: "bg-emerald-500", help: "Zonas onde a mão forte posicionou (última vela antes de um movimento forte). Viram suporte (demanda) ou resistência (oferta)." },
  { key: "fvg", label: "Imbalance (FVG)", color: "bg-purple-500", help: "Fair Value Gap: gap de 3 velas onde o preço passou rápido demais. Tende a ser preenchido depois (ímã)." },
  { key: "liquidity", label: "Liquidez", color: "bg-amber-500", help: "Aglomerados de stops (topos/fundos iguais). Funcionam como ímãs; o preço costuma buscá-los." },
  { key: "zones", label: "Premium/Discount", color: "bg-sky-500", help: "Metade cara (premium, zona de venda) e barata (discount, zona de compra) do range, com o equilíbrio no meio." },
  { key: "equal", label: "EQH/EQL", color: "bg-teal-500", help: "Topos iguais (Equal Highs) e fundos iguais (Equal Lows): regiões com liquidez acumulada logo acima/abaixo." },
  { key: "structure", label: "BOS/CHoCH", color: "bg-fuchsia-500", help: "BOS = rompimento de estrutura (continuação); CHoCH = mudança de caráter (possível reversão)." },
  { key: "volumeProfile", label: "Volume Profile", color: "bg-sky-400", help: "POC (preço com mais volume) e Value Area (70% do volume) — ímãs e suporte/resistência. Só nas ações (índice/dólar não têm volume)." },
  { key: "htf", label: "HTF (TF maior)", color: "bg-fuchsia-400", help: "Níveis do timeframe MAIOR projetados no gráfico atual. Operar a favor do TF maior é o princípio nº1 do Smart Money." },
];

const pnum = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString("pt-BR") : v.toFixed(2));
const TONE_DOT: Record<Tone, string> = { good: "bg-emerald-500", bad: "bg-rose-500", warn: "bg-amber-500", neutral: "bg-muted" };
const BIAS_TONE: Record<string, string> = {
  bullish: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  bearish: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  neutral: "border-border text-muted-foreground",
};
const biasWord = (b: "bullish" | "bearish" | "neutral" | null) => (b === "bullish" ? "alta" : b === "bearish" ? "baixa" : "neutro");

function PremiumDiscountGauge({ smc }: { smc: SmcResult }) {
  const range = smc.trailingTop - smc.trailingBottom;
  const pos = range > 0 ? Math.max(0, Math.min(1, (smc.price - smc.trailingBottom) / range)) : 0.5;
  const zone = smc.price >= smc.premium.bottom ? "Premium" : smc.price <= smc.discount.top ? "Discount" : "Equilíbrio";
  const zoneColor = zone === "Premium" ? "text-rose-600 dark:text-rose-400" : zone === "Discount" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Posição no range</span>
        <span className={`num ${zoneColor}`}>{(pos * 100).toFixed(0)}% · {zone}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full" style={{ background: "linear-gradient(to right, rgba(34,197,94,0.5), rgba(148,163,184,0.3), rgba(239,68,68,0.5))" }}>
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-background" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>Discount</span>
        <span>Equilíbrio</span>
        <span>Premium</span>
      </div>
    </div>
  );
}

/** Fluxo & Smart Money da B3. Reusa o motor SMC do cripto (computeSmc + SmartMoneyChart),
 *  alimentado com candles da B3 — order blocks, FVG, liquidez, BOS/CHoCH, premium/discount,
 *  EQH/EQL, volume profile, HTF. + proxy grátis do estrangeiro (ADRs). */
export default function B3SmartMoneyTab({ asset }: { asset: string }) {
  const [tf, setTf] = useState<Timeframe>("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [smc, setSmc] = useState<SmcResult | null>(null);
  const [htfSmc, setHtfSmc] = useState<SmcResult | null>(null);
  const [mtf, setMtf] = useState<{ tf: Timeframe; bias: "bullish" | "bearish" | "neutral" }[]>([]);
  const [layers, setLayers] = useState<SmcLayers>(B3_DEFAULT_LAYERS);
  const [macro, setMacro] = useState<B3MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const toggleLayer = (key: keyof SmcLayers) => setLayers((p) => ({ ...p, [key]: !p[key] }));

  // Candles do ativo/timeframe + SMC.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchB3Chart(asset, tf).then((c) => {
      if (!alive) return;
      setCandles(c as Candle[]);
      setSmc(computeSmc(c as Candle[]));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [asset, tf]);

  // Estrutura do timeframe MAIOR (confluência top-down).
  useEffect(() => {
    const up = HIGHER_TF[tf];
    if (!up) {
      setHtfSmc(null);
      return;
    }
    let alive = true;
    fetchB3Chart(asset, up).then((c) => alive && setHtfSmc(computeSmc(c as Candle[])));
    return () => {
      alive = false;
    };
  }, [asset, tf]);

  // Viés multi-timeframe (top-down): 1D / 4h / 1h.
  useEffect(() => {
    let alive = true;
    setMtf([]);
    const tfs: Timeframe[] = ["1d", "4h", "1h"];
    Promise.all(
      tfs.map(async (t) => {
        const c = await fetchB3Chart(asset, t);
        return { tf: t, bias: (computeSmc(c as Candle[])?.swingBias ?? "neutral") as "bullish" | "bearish" | "neutral" };
      }),
    ).then((out) => alive && setMtf(out));
    return () => {
      alive = false;
    };
  }, [asset]);

  // ADRs (proxy do estrangeiro).
  useEffect(() => {
    let alive = true;
    fetchB3Macro().then((r) => alive && setMacro(r));
    return () => {
      alive = false;
    };
  }, []);

  const vp = useMemo<VolumeProfile | null>(() => (candles.some((c) => c.volume > 0) ? computeVolumeProfile(candles) : null), [candles]);

  const htfLevels = useMemo(() => {
    if (!htfSmc) return [] as { price: number; label: string }[];
    const s = htfSmc;
    const lbl = TF_LABEL[HIGHER_TF[tf] ?? ""] ?? "HTF";
    const out: { price: number; label: string }[] = [];
    const byDist = (a: { mid: number }, b: { mid: number }) => Math.abs(a.mid - s.price) - Math.abs(b.mid - s.price);
    s.orderBlocks.slice().sort(byDist).slice(0, 3).forEach((o) => out.push({ price: o.mid, label: `OB ${lbl}` }));
    s.liquidity.filter((l) => !l.swept).sort((a, b) => Math.abs(a.price - s.price) - Math.abs(b.price - s.price)).slice(0, 3).forEach((l) => out.push({ price: l.price, label: `Liq ${lbl}` }));
    return out;
  }, [htfSmc, tf]);

  const allSources = useMemo(() => {
    const sources: ConfluenceSource[] = buildConfluenceSources(null, [], (v) => v.toLocaleString("pt-BR"));
    const extra: ConfluenceSource[] = [];
    if (vp) {
      extra.push({ kind: "vp", label: "POC", price: vp.poc });
      extra.push({ kind: "vp", label: "VA High", price: vp.vah });
      extra.push({ kind: "vp", label: "VA Low", price: vp.val });
    }
    htfLevels.forEach((l) => extra.push({ kind: "htf", label: l.label, price: l.price }));
    return [...sources, ...extra];
  }, [vp, htfLevels]);

  const bias = smc?.swingBias ?? "neutral";
  const keyLevels: KeyLevel[] = smc ? buildKeyLevels(smc, allSources) : [];
  const narrative: ReadingLine[] = smc ? buildNarrative(smc, allSources) : [];

  const adrs = macro?.adrs ?? [];
  const adrAvg = adrs.length ? adrs.reduce((s, a) => s + a.premiumPct, 0) / adrs.length : null;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground">Smart Money · {asset}</h3>
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${BIAS_TONE[bias]}`}>Viés: {biasWord(bias)}</span>
      </div>

      {/* Tendência multi-timeframe + posição no range */}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Tendência (top-down):
            <InfoTip text="Viés da estrutura em vários timeframes (1D/4h/1h). Operar a favor do timeframe maior aumenta a chance — princípio nº1 do Smart Money." />
          </span>
          {mtf.length === 0 ? (
            <span className="text-xs text-muted-foreground">calculando…</span>
          ) : (
            mtf.map((m) => (
              <span key={m.tf} className={`rounded-full border px-2 py-0.5 text-xs ${BIAS_TONE[m.bias]}`}>
                {TF_LABEL[m.tf] ?? m.tf} · {biasWord(m.bias)}
              </span>
            ))
          )}
        </div>
        {smc && <PremiumDiscountGauge smc={smc} />}
      </div>

      {/* Leitura automática */}
      {narrative.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {narrative.map((l, i) => (
            <div key={i} className="flex gap-2 rounded-xl border border-border bg-card p-3 dark:bg-card/60">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[l.tone]}`} />
              <div>
                <div className="text-xs font-semibold text-foreground">{l.title}</div>
                <div className="text-xs text-muted-foreground">{l.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gráfico SMC + camadas + timeframe (mesma linha, acima do gráfico — padrão do cripto) */}
      <div className="rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PillRow label="Camadas:">
            {LAYERS.map((l) => (
              <TogglePill key={l.key} label={l.label} active={layers[l.key]} onToggle={() => toggleLayer(l.key)} color={l.color} desc={l.help} />
            ))}
          </PillRow>
          <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-background p-0.5">
            {TFS.map((t) => (
              <button key={t.id} onClick={() => setTf(t.id)} className={`rounded-md px-3 py-1 text-xs transition-colors ${tf === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {loading && candles.length === 0 ? (
            <div className="grid h-[380px] place-items-center text-sm text-muted-foreground">Carregando estrutura…</div>
          ) : (
            <SmartMoneyChart candles={candles} smc={smc} layers={layers} viewKey={`${asset}-${tf}`} vp={vp} tf={tf} htfLevels={htfLevels} />
          )}
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          <span className="text-emerald-600 dark:text-emerald-400">verde</span> = demanda/discount · <span className="text-rose-600 dark:text-rose-400">vermelho</span> = oferta/premium · <span className="text-amber-500">âmbar</span> = liquidez · <span className="text-purple-400">violeta</span> = imbalance · EQH/EQL = topos/fundos iguais · setas = BOS/CHoCH. Tudo calculado dos candles.
        </p>
      </div>

      {/* Níveis-chave por confluência */}
      {keyLevels.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card dark:bg-card/60">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Níveis-chave por confluência</h3>
            <span className="text-xs text-muted-foreground">SMC × Volume Profile × HTF — por distância</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Nível</th>
                  <th className="px-4 py-2 text-right font-medium">Preço</th>
                  <th className="px-4 py-2 text-right font-medium">Distância</th>
                  <th className="px-4 py-2 font-medium">Confluência</th>
                </tr>
              </thead>
              <tbody>
                {keyLevels.slice(0, 12).map((lvl, i) => (
                  <tr key={i} className={`border-b border-border last:border-0 ${lvl.confluence.length >= 1 ? "bg-primary/5" : ""} ${lvl.swept ? "opacity-50" : ""}`}>
                    <td className="border-l-2 px-4 py-2.5" style={{ borderLeftColor: lvl.bias === "bullish" ? "#22c55e" : lvl.bias === "bearish" ? "#ef4444" : "#475569" }}>
                      <span className="text-foreground">{lvl.label}</span>
                      {lvl.note && <div className="text-[11px] text-muted-foreground">{lvl.note}</div>}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-foreground">{pnum(lvl.price)}</td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-muted-foreground">{lvl.distancePct >= 0 ? "+" : ""}{lvl.distancePct.toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      {lvl.confluence.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {lvl.confluence.map((c, j) => (
                            <span key={j} className="rounded-full border border-sky-500/40 px-2 py-0.5 text-[10px] text-sky-400">{c.source.label}</span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Termômetro do estrangeiro (proxy grátis) */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="text-sm font-semibold text-foreground">Termômetro do estrangeiro (proxy grátis)</h3>
        <p className="mb-2 text-xs text-muted-foreground">Capital externo por dados livres: prêmio/desconto dos ADRs na NYSE vs ação local.</p>
        {adrs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando ADRs…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Cell label="ADRs (média)" value={<span className={toneCls(adrAvg)}>{`${adrAvg! >= 0 ? "+" : ""}${adrAvg!.toFixed(2)}%`}</span>} sub={adrAvg! >= 0 ? "entrada" : "saída"} />
            {adrs.map((a) => (
              <Cell key={a.ticker} label={`${a.name} (${a.ticker})`} value={<span className={toneCls(a.premiumPct)}>{`${a.premiumPct >= 0 ? "+" : ""}${a.premiumPct.toFixed(2)}%`}</span>} sub={a.premiumPct >= 0 ? "prêmio" : "desconto"} />
            ))}
          </div>
        )}
      </div>

      <ComingSoon icon="🎯" title="Gamma & Opções (GEX) — fonte paga">
        <p>Call/Put Wall, Zero Gamma, Max Pain e exposição a gama por strike nas opções líquidas (PETR4, VALE3, IBOV).</p>
        <p className="text-[11px]">Requer OpLab (gregas + open interest por strike). Fluxo oficial por investidor: dadosdemercado.</p>
      </ComingSoon>
    </div>
  );
}
