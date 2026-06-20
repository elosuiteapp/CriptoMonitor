import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";
import type { SeriesPoint } from "./useSeries";

/** Série temporal da pressão do book (bid − ask combinado, ±2%, todas as fontes)
 *  por snapshot — para o subgráfico estilo CVD embaixo do preço. Só busca quando
 *  a camada está ligada; atualiza a cada 60s com a aba visível. */
export function useBookPressureSeries(asset: string, plan: Plan | null, enabled: boolean): SeriesPoint[] {
  const [data, setData] = useState<SeriesPoint[]>([]);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!enabled || !advanced) {
      setData([]);
      return;
    }
    let active = true;
    const load = () =>
      supabase
        .from("orderbook_imbalance")
        .select("bid_wide_usd, ask_wide_usd, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(240)
        .then(({ data: rows }) => {
          if (!active) return;
          // soma as exchanges por ts → net (bid − ask) combinado
          const byTs = new Map<string, number>();
          for (const r of (rows as { bid_wide_usd: number; ask_wide_usd: number; ts: string }[] | null) ?? []) {
            byTs.set(r.ts, (byTs.get(r.ts) ?? 0) + (r.bid_wide_usd - r.ask_wide_usd));
          }
          const series = [...byTs.entries()]
            .map(([ts, value]) => ({ time: Math.floor(new Date(ts).getTime() / 1000), value }))
            .sort((a, b) => a.time - b.time)
            .slice(-120);
          setData(series);
        });
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, advanced, enabled]);

  return data;
}
