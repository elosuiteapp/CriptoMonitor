import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookWall, Plan } from "../lib/types";

/** Paredes do order book mais recentes do ativo (PRD3 §8.8.1) — Pro+. */
export function useOrderbookWalls(asset: string, plan: Plan | null): OrderbookWall[] {
  const [walls, setWalls] = useState<OrderbookWall[]>([]);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setWalls([]);
      return;
    }
    let active = true;
    supabase
      .from("orderbook_walls")
      .select("exchange, side, price, notional_usd, ts")
      .eq("asset", asset)
      .order("ts", { ascending: false })
      .limit(200) // até 20 buckets × 2 lados × 3 corretoras por snapshot (~120)
      .then(({ data }) => {
        if (!active) return;
        const rows = (data as (OrderbookWall & { ts: string })[]) ?? [];
        const latestTs = rows[0]?.ts;
        setWalls(rows.filter((r) => r.ts === latestTs));
      });
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return walls;
}
