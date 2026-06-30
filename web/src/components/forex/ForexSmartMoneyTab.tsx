import { useEffect, useMemo, useState } from "react";

import { usePersistentState } from "../../hooks/usePersistentState";
import { computeForexProfile, fetchForexChart, pairDecimals } from "../../lib/forex";
import { computeSmc, type SmcResult } from "../../lib/smc";
import { buildConfluenceSources } from "../../lib/smcConfluence";
import { buildKeyLevels, type KeyLevel } from "../../lib/smcNarrative";
import type { Candle, Timeframe } from "../../lib/marketData";
import InfoTip from "../InfoTip";
import { PillRow, TogglePill } from "../TogglePill";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "../SmartMoneyChart";

const TFS: { id: Timeframe; label: string }[] = [
  { id: "15m", label: "15M" },
  { id: "1h", label: "1H" },
  { id: "4h", label: "4H" },
  { id: "1d", label: "1D" },
  { id: "1w", label: "1S" },
  { id: "1M", label: "1Mês" },
];
const TF_WORD: Record<string, string> = { "15m": "de 15 min", "1h": "de 1 hora", "4h": "de 4 horas", "1d": "diárias", "1w": "semanais", "1M": "mensais" };

const LAYER_DEFS: { key: keyof SmcLayers; label: string; color: string; desc: string }[] = [
  { key: "structure", label: "Estrutura (BOS/CHoCH)", color: "bg-primary", desc: "Quebras de estrutura — BOS (continuação) e CHoCH (mudança de caráter)." },
  { key: "orderBlocks", label: "Order Blocks", color: "bg-emerald-500", desc: "Zonas de ordem institucional (última vela antes do movimento)." },
  { key: "fvg", label: "FVG (gaps)", color: "bg-sky-500", desc: "Fair Value Gaps — desequilíbrios de preço não preenchidos." },
  { key: "liquidity", label: "Liquidez", color: "bg-amber-500", desc: "Pools de liquidez (stops) — alvos de varredura/stop hunt." },
  { key: "equal", label: "Topos/Fundos iguais", color: "bg-fuchsia-500", desc: "EQH/EQL — níveis iguais que atraem liquidez." },
  { key: "zones", label: "Premium/Discount", color: "bg-violet-500", desc: "Zonas premium (caro), equilíbrio e discount (barato) do range." },
  { key: "volumeProfile", label: "Perfil de preço (POC)", color: "bg-rose-500", desc: "POC + área de valor por TEMPO no preço (FX não tem volume real; usamos tempo-no-preço / TPO)." },
];

/** Smart Money do Forex — estrutura de mercado (SMC) reusando o motor e o gráfico
 *  compartilhados. Sem WebSocket (FX não tem feed Binance) e sem CVD/liquidação.
 *  Volume Profile = perfil tempo-no-preço (FX vem sem volume). */
export default function ForexSmartMoneyTab({ pair }: { pair: string }) {
  const [tf, setTf] = usePersistentState<Timeframe>("cm.fx-smc-tf", "1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<SmcLayers>({ ...DEFAULT_LAYERS, liquidations: false, cvd: false, htf: false });
  const toggle = (k: keyof SmcLayers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchForexChart(pair, tf).then((c) => {
      if (!alive) return;
      setCandles(c as unknown as Candle[]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair, tf]);

  const smc: SmcResult | null = useMemo(() => (candles.length >= 60 ? computeSmc(candles) : null), [candles]);
  const profile = useMemo(() => (candles.length > 10 ? computeForexProfile(candles.slice(-150)) : null), [candles]);
  const dec = pairDecimals(pair);
  const fx = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

  // Níveis-chave por confluência (SMC + Volume Profile) — mesmo motor do cripto/B3.
  const keyLevels = useMemo<KeyLevel[]>(() => {
    if (!smc) return [];
    const sources = buildConfluenceSources(null, [], (v) => fx(v));
    if (profile) {
      sources.push({ kind: "vp", label: "POC", price: profile.poc });
      sources.push({ kind: "vp", label: "VA High", price: profile.vah });
      sources.push({ kind: "vp", label: "VA Low", price: profile.val });
    }
    return buildKeyLevels(smc, sources);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smc, profile]);

  const zone = smc
    ? smc.price >= smc.premium.bottom
      ? { label: "Premium (caro)", cls: "text-rose-500" }
      : smc.price <= smc.discount.top
        ? { label: "Discount (barato)", cls: "text-emerald-500" }
        : { label: "Equilíbrio", cls: "text-muted-foreground" }
    : null;
  const dw = (b: "bullish" | "bearish" | null) => (b === "bullish" ? "alta" : b === "bearish" ? "baixa" : "—");

  return (
    <div className="space-y-4">
      {/* Resumo da estrutura */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Estrutura (swing)
            <InfoTip text="A 'leitura do gráfico' por topos e fundos (conceito Smart Money). Alta = o par faz topos e fundos cada vez mais altos; baixa = o contrário. É o esqueleto da tendência principal." />
          </div>
          <div className={`text-sm font-bold capitalize ${smc?.swingBias === "bullish" ? "text-emerald-500" : smc?.swingBias === "bearish" ? "text-rose-500" : "text-muted-foreground"}`}>{dw(smc?.swingBias ?? null)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Estrutura interna
            <InfoTip text="A tendência dos movimentos MENORES dentro da estrutura principal. Quando concorda com o swing, o sinal é mais forte; quando diverge, o mercado pode estar virando." />
          </div>
          <div className="text-sm font-bold capitalize text-foreground">{dw(smc?.internalBias ?? null)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Último evento
            <InfoTip text="O último marco de estrutura: BOS (rompimento que confirma a tendência) ou CHoCH (mudança de caráter, possível reversão). Mostra o que o mercado acabou de fazer." />
          </div>
          <div className="text-sm font-bold text-foreground">{smc?.lastSwing ? `${smc.lastSwing.type} ${dw(smc.lastSwing.bias)}` : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Posição no range
            <InfoTip text="Onde o preço está dentro da faixa recente: Discount (barato, metade de baixo — zona de compra), Equilíbrio (meio) ou Premium (caro, metade de cima — zona de venda). Smart Money compra no discount e vende no premium." />
          </div>
          <div className={`text-sm font-bold ${zone?.cls ?? "text-muted-foreground"}`}>{zone?.label ?? "—"}</div>
        </div>
      </div>

      {/* Gráfico SMC + timeframe + camadas */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        {/* Timeframe à DIREITA (camadas vão ABAIXO) — mesmo padrão do Smart Money do cripto */}
        <div className="mb-2 flex justify-end">
          <div className="flex shrink-0 gap-1 rounded-lg border border-border bg-background p-0.5">
            {TFS.map((t) => (
              <button key={t.id} onClick={() => setTf(t.id)} className={`rounded-md px-3 py-1 text-xs transition-colors ${tf === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-[380px] animate-pulse rounded-xl bg-muted/40" />
        ) : candles.length < 60 ? (
          <div className="grid h-[380px] place-items-center text-sm text-muted-foreground">Sem dados suficientes para {pair} em {tf}.</div>
        ) : (
          <SmartMoneyChart candles={candles} smc={smc} layers={layers} viewKey={`${pair}-${tf}`} vp={layers.volumeProfile ? profile : null} tf={tf} />
        )}
        {/* Camadas ABAIXO do gráfico — mesmo padrão de posição do cockpit/cripto */}
        <div className="mt-2">
          <PillRow label="Camadas:">
            {LAYER_DEFS.map((l) => (
              <TogglePill key={l.key} label={l.label} active={layers[l.key]} onToggle={() => toggle(l.key)} color={l.color} desc={l.desc} />
            ))}
          </PillRow>
        </div>
        {smc && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Range recente {fx(smc.trailingBottom)} — {fx(smc.trailingTop)} · preço {fx(smc.price)}. Estrutura de mercado (Smart Money Concepts) das velas {TF_WORD[tf] ?? tf}. Educacional — não é recomendação.
          </p>
        )}
      </div>

      {/* Níveis-chave por confluência (SMC × Perfil de preço) */}
      {keyLevels.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card dark:bg-card/60">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Níveis-chave por confluência
              <InfoTip text="Os preços mais importantes perto do atual, do mais próximo ao mais distante. Vêm da estrutura (order blocks, liquidez, premium/discount) e do perfil de preço (POC). 'Confluência' = quando vários fatores apontam o mesmo nível — quanto mais, mais forte. Verde = suporte (compra), vermelho = resistência (venda)." />
            </h3>
            <span className="text-xs text-muted-foreground">SMC × Perfil de preço — por distância</span>
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
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-foreground">{fx(lvl.price)}</td>
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
    </div>
  );
}
