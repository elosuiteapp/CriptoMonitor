import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookImbalance, Plan } from "../lib/types";

export interface BookImbalances {
  varejo: OrderbookImbalance | null; // Binance
  institucional: OrderbookImbalance | null; // Coinbase
}

/** Pressão do book mais recente do ativo, separada por audiência: varejo (Binance)
 *  × institucional (Coinbase). Pro+. */
export function useOrderbookImbalance(asset: string, plan: Plan | null): BookImbalances {
  const [data, setData] = useState<BookImbalances>({ varejo: null, institucional: null });
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setData({ varejo: null, institucional: null });
      return;
    }
    let active = true;
    supabase
      .from("orderbook_imbalance")
      .select("exchange, bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(6)
      .then(({ data: rows }) => {
        if (!active) return;
        const r = (rows as OrderbookImbalance[] | null) ?? [];
        setData({
          varejo: r.find((x) => x.exchange === "binance") ?? null,
          institucional: r.find((x) => x.exchange === "coinbase") ?? null,
        });
      });
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return data;
}
