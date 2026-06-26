import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookDepthRow, Plan } from "../lib/types";

const WINDOW_MS = 2 * 60 * 60 * 1000; // 2h de janela (heatmap = microestrutura recente)
const REFRESH_MS = 60_000; // re-busca a cada 1 min (cadência da coleta)

/** Escada do book (heatmap de liquidez parada) — Pro+. Só busca quando a camada
 *  está LIGADA (evita payload à toa). Janela rolante de 2h, atualiza a cada 1 min. */
export function useOrderbookDepth(asset: string, plan: Plan | null, enabled: boolean): OrderbookDepthRow[] | null {
  const [rows, setRows] = useState<OrderbookDepthRow[] | null>(null);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!enabled || !advanced) {
      setRows(null);
      return;
    }
    let active = true;
    const load = async () => {
      const since = new Date(Date.now() - WINDOW_MS).toISOString();
      const { data } = await supabase
        .from("orderbook_depth")
        .select("ts, exchange, mid, bids, asks")
        .eq("asset", asset)
        .gte("ts", since)
        .order("ts", { ascending: true })
        .limit(2000);
      if (active) setRows((data as OrderbookDepthRow[]) ?? []);
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, advanced, enabled]);

  return rows;
}
