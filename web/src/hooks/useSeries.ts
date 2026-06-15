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
  cvd: SeriesPoint[]; // varejo (Binance)
  cvdInst: SeriesPoint[]; // institucional (Coinbase)
  funding: SeriesPoint[];
  liquidations: LiqPoint[]; // liquidações realizadas por bucket de 5 min
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
      const [{ data: prices }, { data: pricesCb }, { data: deriv }, { data: liq }] = await Promise.all([
        supabase
          .from("prices_cex")
          .select("cvd, ts")
          .eq("asset", asset)
          .eq("exchange", "binance")
          .order("ts", { ascending: true })
          .limit(300),
        supabase
          .from("prices_cex")
          .select("cvd, ts")
          .eq("asset", asset)
          .eq("exchange", "coinbase")
          .order("ts", { ascending: true })
          .limit(300),
        supabase
          .from("derivatives")
          .select("funding_rate, ts")
          .eq("asset", asset)
          .order("ts", { ascending: true })
          .limit(300),
        // Liquidações: pega os buckets mais recentes (desc) e reordena ao montar
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

      const liqPoints: LiqPoint[] = ((liq as Record<string, unknown>[] | null) ?? [])
        .map((r) => ({
          time: Math.floor(new Date(r.ts as string).getTime() / 1000),
          long: Number(r.long_usd ?? 0),
          short: Number(r.short_usd ?? 0),
        }))
        .reverse(); // veio desc → volta a crescente para o eixo do tempo

      setSeries({
        cvd: toPoints(prices, "cvd"),
        cvdInst: toPoints(pricesCb, "cvd"),
        funding: toPoints(deriv, "funding_rate"),
        liquidations: liqPoints,
      });
    })();
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return series;
}
