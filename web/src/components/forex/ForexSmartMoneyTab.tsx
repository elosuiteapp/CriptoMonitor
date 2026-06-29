import { useEffect, useMemo, useState } from "react";

import { fetchForexChart, pairDecimals } from "../../lib/forex";
import { computeSmc, type SmcResult } from "../../lib/smc";
import type { Candle } from "../../lib/marketData";
import { PillRow, TogglePill } from "../TogglePill";
import SmartMoneyChart, { DEFAULT_LAYERS, type SmcLayers } from "../SmartMoneyChart";

const LAYER_DEFS: { key: keyof SmcLayers; label: string; color: string; desc: string }[] = [
  { key: "structure", label: "Estrutura (BOS/CHoCH)", color: "bg-primary", desc: "Quebras de estrutura — BOS (continuação) e CHoCH (mudança de caráter)." },
  { key: "orderBlocks", label: "Order Blocks", color: "bg-emerald-500", desc: "Zonas de ordem institucional (última vela antes do movimento)." },
  { key: "fvg", label: "FVG (gaps)", color: "bg-sky-500", desc: "Fair Value Gaps — desequilíbrios de preço não preenchidos." },
  { key: "liquidity", label: "Liquidez", color: "bg-amber-500", desc: "Pools de liquidez (stops) — alvos de varredura/stop hunt." },
  { key: "equal", label: "Topos/Fundos iguais", color: "bg-fuchsia-500", desc: "EQH/EQL — níveis iguais que atraem liquidez." },
  { key: "zones", label: "Premium/Discount", color: "bg-violet-500", desc: "Zonas premium (caro), equilíbrio e discount (barato) do range." },
  { key: "volumeProfile", label: "Volume Profile", color: "bg-rose-500", desc: "POC + topo/base da área de valor por volume negociado." },
];

/** Smart Money do Forex — estrutura de mercado (SMC) reusando o motor e o gráfico
 *  compartilhados. Sem WebSocket (FX não tem feed Binance) e sem CVD/liquidação. */
export default function ForexSmartMoneyTab({ pair }: { pair: string }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [layers, setLayers] = useState<SmcLayers>({ ...DEFAULT_LAYERS, liquidations: false, cvd: false, htf: false });
  const toggle = (k: keyof SmcLayers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchForexChart(pair, "1d").then((c) => {
      if (!alive) return;
      setCandles(c as unknown as Candle[]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair]);

  const smc: SmcResult | null = useMemo(() => (candles.length >= 60 ? computeSmc(candles) : null), [candles]);
  const dec = pairDecimals(pair);
  const fx = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

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
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Estrutura (swing)</div>
          <div className={`text-sm font-bold capitalize ${smc?.swingBias === "bullish" ? "text-emerald-500" : smc?.swingBias === "bearish" ? "text-rose-500" : "text-muted-foreground"}`}>{dw(smc?.swingBias ?? null)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Estrutura interna</div>
          <div className="text-sm font-bold capitalize text-foreground">{dw(smc?.internalBias ?? null)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Último evento</div>
          <div className="text-sm font-bold text-foreground">{smc?.lastSwing ? `${smc.lastSwing.type} ${dw(smc.lastSwing.bias)}` : "—"}</div>
        </div>
        <div className="rounded-xl border border-border bg-card px-3 py-2 dark:bg-card/60">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Posição no range</div>
          <div className={`text-sm font-bold ${zone?.cls ?? "text-muted-foreground"}`}>{zone?.label ?? "—"}</div>
        </div>
      </div>

      {/* Gráfico SMC + camadas */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <PillRow label="Camadas:">
          {LAYER_DEFS.map((l) => (
            <TogglePill key={l.key} label={l.label} active={layers[l.key]} onToggle={() => toggle(l.key)} color={l.color} desc={l.desc} />
          ))}
        </PillRow>
        <div className="mt-2">
          {loading ? (
            <div className="h-[380px] animate-pulse rounded-xl bg-muted/40" />
          ) : candles.length < 60 ? (
            <div className="grid h-[380px] place-items-center text-sm text-muted-foreground">Sem dados suficientes para {pair}.</div>
          ) : (
            <SmartMoneyChart candles={candles} smc={smc} layers={layers} viewKey={pair} tf="1d" />
          )}
        </div>
        {smc && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Range recente {fx(smc.trailingBottom)} — {fx(smc.trailingTop)} · preço {fx(smc.price)}. Estrutura de mercado (Smart Money Concepts) das velas diárias. Educacional — não é recomendação.
          </p>
        )}
      </div>
    </div>
  );
}
