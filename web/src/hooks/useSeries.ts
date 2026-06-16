import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

export interface SeriesPoint {
  time: number; // epoch (s)
  value: number;
}

export interface LiqPoint {
  time: number; // epoch (s) — início do bucket de 5 min
  long: number; // longs liquidados (USD) — preço caindo
  short: number; // shorts liquidados (USD) — preço subindo
}

export interface Series {
  cvd: SeriesPoint[]; // varejo agregado (Binance + OKX)
  cvdInst: SeriesPoint[]; // institucional (Coinbase)
  funding: SeriesPoint[];
  liquidations: LiqPoint[]; // liquidações realizadas por bucket de 5 min (barras)
}

/**
 * Séries temporais recentes para as camadas Funding e CVD do gráfico (§8.4).
 * Só carrega para planos avançados (Pro+); o RLS já protege as tabelas.
 */
export function useSeries(asset: string, plan: Plan | null): Series {
  const [series, setSeries] = useState<Series>({ cvd: [], cvdInst: [], funding: [], liquidations: [] });
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setSeries({ cvd: [], cvdInst: [], funding: [], liquidations: [] });
      return;
    }
    let active = true;
    (async () => {
      const [{ data: prices }, { data: pricesOkx }, { data: pricesCb }, { data: deriv }, { data: liq }] = await Promise.all([
        supabase
          .from("prices_cex")
          .select("cvd, ts")
          .eq("asset", asset)
          .eq("exchange", "binance")
          .order("ts", { ascending: false })
          .limit(300),
        supabase
          .from("prices_cex")
          .select("cvd, ts")
          .eq("asset", asset)
          .eq("exchange", "okx")
          .order("ts", { ascending: false })
          .limit(300),
        supabase
          .from("prices_cex")
          .select("cvd, ts")
          .eq("asset", asset)
          .eq("exchange", "coinbase")
          .order("ts", { ascending: false })
          .limit(300),
        supabase
          .from("derivatives")
          .select("funding_rate, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(300),
        supabase
          .from("liquidations")
          .select("long_usd, short_usd, ts")
          .eq("asset", asset)
          .order("ts", { ascending: false })
          .limit(144),
      ]);
      if (!active) return;

      const toPoints = (rows: Record<string, unknown>[] | null, key: string): SeriesPoint[] =>
        (rows ?? [])
          .filter((r) => r[key] != null)
          .map((r) => ({
            time: Math.floor(new Date(r.ts as string).getTime() / 1000),
            value: Number(r[key]),
          }));

      // CVD do varejo AGREGADO = Binance + OKX, somados por timestamp (mesmo ciclo →
      // mesmo segundo). Onde só uma exchange tem CVD, usa o que houver.
      const cvdAggMap = new Map<number, number>();
      for (const p of toPoints(prices, "cvd")) cvdAggMap.set(p.time, (cvdAggMap.get(p.time) ?? 0) + p.value);
      for (const p of toPoints(pricesOkx, "cvd")) cvdAggMap.set(p.time, (cvdAggMap.get(p.time) ?? 0) + p.value);
      const cvdRetail: SeriesPoint[] = [...cvdAggMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) => ({ time, value }));

      const liquidations: LiqPoint[] = ((liq as { long_usd: number | null; short_usd: number | null; ts: string }[]) ?? [])
        .map((r) => ({
          time: Math.floor(new Date(r.ts).getTime() / 1000),
          long: Number(r.long_usd ?? 0),
          short: Number(r.short_usd ?? 0),
        }))
        .reverse(); // veio desc → volta a crescente para o eixo do tempo

      // As queries acima vêm em ordem DECRESCENTE (para pegar as 300 mais recentes);
      // cvdRetail já reordena ao montar o mapa, mas cvdInst e funding precisam ser
      // invertidos de volta para crescente antes de virarem pontos do gráfico.
      setSeries({
        cvd: cvdRetail,
        cvdInst: toPoints((pricesCb ?? []).slice().reverse(), "cvd"),
        funding: toPoints((deriv ?? []).slice().reverse(), "funding_rate"),
        liquidations,
      });
    })();
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return series;
}
