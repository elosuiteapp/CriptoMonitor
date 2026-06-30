import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookWall, Plan } from "../lib/types";

const REFRESH_MS = 45_000; // re-busca sozinho (o coletor grava paredes ~5 min, mas atualiza sem recarregar)

/** Paredes do order book mais recentes do ativo (PRD3 §8.8.1) — Pro+.
 *  Re-busca em intervalo p/ atualizar a camada sem o usuário recarregar/religar. */
export function useOrderbookWalls(asset: string, plan: Plan | null): OrderbookWall[] {
  const [walls, setWalls] = useState<OrderbookWall[]>([]);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setWalls([]);
      return;
    }
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("orderbook_walls")
        .select("exchange, side, price, notional_usd, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(200); // até 20 buckets × 2 lados × 3 corretoras por snapshot (~120)
      if (!active) return;
      const rows = (data as (OrderbookWall & { ts: string })[]) ?? [];
      const latestTs = rows[0]?.ts;
      setWalls(rows.filter((r) => r.ts === latestTs));
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, advanced]);

  return walls;
}
