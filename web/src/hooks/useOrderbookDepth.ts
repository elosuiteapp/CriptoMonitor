import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookDepthRow, Plan } from "../lib/types";

const WINDOW_MS = 48 * 60 * 60 * 1000; // 48h = toda a retenção (heatmap cobre o histórico, não só 2h)
const BUCKET_SECONDS = 120; // funde exchanges + downsample no servidor → 1 coluna / 2 min
const REFRESH_MS = 120_000; // re-busca a cada 2 min (alinhado ao bucket; book macro muda devagar)

/** Escada do book (heatmap de liquidez parada) — Pro+. Só busca quando a camada
 *  está LIGADA (evita payload à toa). Janela rolante de 48h via RPC que FUNDE as 3
 *  exchanges + downsample no servidor (get_book_depth_grid) — senão 48h crus = ~8.600
 *  linhas × JSONB estouraria o payload. RLS Pro+ continua (função SECURITY INVOKER). */
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
      const { data } = await supabase.rpc("get_book_depth_grid", {
        p_asset: asset,
        p_since: since,
        p_bucket_seconds: BUCKET_SECONDS,
      });
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
