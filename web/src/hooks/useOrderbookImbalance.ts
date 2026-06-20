import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookImbalance, Plan } from "../lib/types";

/** Pressão do book (bid × ask perto do preço) mais recente do ativo — Pro+. */
export function useOrderbookImbalance(asset: string, plan: Plan | null): OrderbookImbalance | null {
  const [data, setData] = useState<OrderbookImbalance | null>(null);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setData(null);
      return;
    }
    let active = true;
    supabase
      .from("orderbook_imbalance")
      .select("bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setData((data as OrderbookImbalance | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return data;
}
