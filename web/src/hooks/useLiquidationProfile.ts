import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

export interface LiqLevel {
  price: number; // centro da faixa de preço
  long: number; // longs liquidados nessa faixa (USD)
  short: number; // shorts liquidados nessa faixa (USD)
  total: number; // long + short
}

export interface LiqProfile {
  levels: LiqLevel[];
  max: number; // maior `total` entre as faixas (para normalizar a intensidade)
}

const N_BINS = 24;

/**
 * Perfil de liquidações POR NÍVEL DE PREÇO (realizado): para cada bucket de 5 min
 * de `liquidations`, associa o preço spot daquele instante (`prices_cex` Binance,
 * vizinho mais próximo no tempo) e acumula o USD liquidado por faixa de preço.
 * É dado real — cobre só a janela coletada (~12h hoje), então as faixas ficam
 * perto do preço atual e se espalham com o tempo. Só Pro+ (RLS já protege).
 */
export function useLiquidationProfile(asset: string, plan: Plan | null): LiqProfile | null {
  const [profile, setProfile] = useState<LiqProfile | null>(null);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setProfile(null);
      return;
    }
    let active = true;
    (async () => {
      const [{ data: liq }, { data: px }] = await Promise.all([
        supabase
          .from("liquidations")
          .select("long_usd, short_usd, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(144),
        supabase
          .from("prices_cex")
          .select("price, ts")
          .eq("asset", asset)
          .eq("exchange", "binance")
          .order("ts", { ascending: false })
          .limit(200),
      ]);
      if (!active) return;

      const liqRows = (liq as { long_usd: number | null; short_usd: number | null; ts: string }[]) ?? [];
      const pxRows = ((px as { price: number | null; ts: string }[]) ?? [])
        .filter((r) => r.price != null)
        .map((r) => ({ t: new Date(r.ts).getTime(), price: Number(r.price) }));
      if (liqRows.length < 2 || pxRows.length === 0) {
        setProfile(null);
        return;
      }

      const priceAt = (t: number): number => {
        let best = pxRows[0];
        let bestDist = Math.abs(pxRows[0].t - t);
        for (const p of pxRows) {
          const d = Math.abs(p.t - t);
          if (d < bestDist) {
            bestDist = d;
            best = p;
          }
        }
        return best.price;
      };

      const points = liqRows.map((r) => ({
        price: priceAt(new Date(r.ts).getTime()),
        long: Number(r.long_usd ?? 0),
        short: Number(r.short_usd ?? 0),
      }));

      const prices = points.map((p) => p.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const span = Math.max(max - min, max * 0.001);
      const binSize = span / N_BINS;

      const bins = new Map<number, LiqLevel>();
      for (const p of points) {
        const idx = Math.min(N_BINS - 1, Math.max(0, Math.floor((p.price - min) / binSize)));
        const center = Number((min + (idx + 0.5) * binSize).toFixed(2));
        const b = bins.get(idx) ?? { price: center, long: 0, short: 0, total: 0 };
        b.long += p.long;
        b.short += p.short;
        b.total += p.long + p.short;
        bins.set(idx, b);
      }

      const levels = [...bins.values()].filter((l) => l.total > 0);
      const maxTotal = Math.max(1, ...levels.map((l) => l.total));
      setProfile({ levels, max: maxTotal });
    })();
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return profile;
}
