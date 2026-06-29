import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookDepthRow, Plan } from "../lib/types";

const WINDOW_MS = 48 * 60 * 60 * 1000; // 48h = toda a retenção (heatmap cobre o histórico, não só 2h)
// Bucket de 4 min → 48h = 720 colunas. CRÍTICO: o PostgREST corta a resposta em
// ~1000 linhas (config "Max rows"); a 120s davam 1440 linhas e as ~440 MAIS RECENTES
// eram cortadas (a RPC ordena asc) → o heatmap só mostrava tempo antigo. 720 < 1000.
const BUCKET_SECONDS = 240;
const REFRESH_MS = 120_000; // re-busca a cada 2 min (book macro muda devagar)

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
