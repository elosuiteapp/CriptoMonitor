import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { OrderbookImbalance, Plan } from "../lib/types";

export interface BookImbalances {
  varejo: OrderbookImbalance | null; // todas as corretoras MENOS Coinbase (Binance + OKX…)
  institucional: OrderbookImbalance | null; // Coinbase
}

/** Pressão do book mais recente do ativo, separada por audiência: varejo (todas as
 *  corretoras exceto Coinbase, somadas) × institucional (Coinbase). Pro+.
 *  Re-busca a cada 60s (aba visível) para acompanhar os ciclos do coletor (5 min). */
export function useOrderbookImbalance(asset: string, plan: Plan | null): BookImbalances {
  const [data, setData] = useState<BookImbalances>({ varejo: null, institucional: null });
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setData({ varejo: null, institucional: null });
      return;
    }
    let active = true;
    const load = () =>
      supabase
        .from("orderbook_imbalance")
        .select("exchange, bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(12)
        .then(({ data: rows }) => {
          if (!active) return;
          const r = (rows as OrderbookImbalance[] | null) ?? [];
          const latestTs = r[0]?.ts;
          const atLatest = r.filter((x) => x.ts === latestTs);
          const institucional = atLatest.find((x) => x.exchange === "coinbase") ?? null;
          // Varejo = soma de TODAS as corretoras menos a Coinbase (Binance + OKX + futuras).
          const retail = atLatest.filter((x) => x.exchange !== "coinbase");
          const varejo = retail.length
            ? retail.reduce<OrderbookImbalance>(
                (a, x) => ({
                  exchange: "varejo",
                  bid_near_usd: a.bid_near_usd + x.bid_near_usd,
                  ask_near_usd: a.ask_near_usd + x.ask_near_usd,
                  bid_wide_usd: a.bid_wide_usd + x.bid_wide_usd,
                  ask_wide_usd: a.ask_wide_usd + x.ask_wide_usd,
                  ts: x.ts,
                }),
                { exchange: "varejo", bid_near_usd: 0, ask_near_usd: 0, bid_wide_usd: 0, ask_wide_usd: 0, ts: latestTs ?? "" },
              )
            : null;
          setData({ varejo, institucional });
        });
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, advanced]);

  return data;
}
