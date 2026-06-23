import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { SeriesPoint } from "./useSeries";

/** Série temporal da pressão do book (bid − ask, ±2%) por snapshot — para o
 *  subgráfico estilo CVD embaixo do preço. Só busca quando a camada está ligada;
 *  atualiza a cada 60s com a aba visível.
 *
 *  `retailOnly`: soma só o VAREJO (exclui a Coinbase) — é o que o Free enxerga
 *  (o institucional é teaser). Pro+/Expert passam false e veem todas as fontes.
 *  O que volta de fato é decidido pelo RLS (sql/053); o filtro aqui é defensivo. */
export function useBookPressureSeries(asset: string, enabled: boolean, retailOnly = false): SeriesPoint[] {
  const [data, setData] = useState<SeriesPoint[]>([]);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      return;
    }
    let active = true;
    const load = () =>
      supabase
        .from("orderbook_imbalance")
        .select("exchange, bid_wide_usd, ask_wide_usd, ts")
        .eq("asset", asset)
        .order("ts", { ascending: false })
        .limit(480) // várias exchanges por ts → mais linhas para cobrir ~120 ciclos
        .then(({ data: rows }) => {
          if (!active) return;
          // soma as exchanges por ts → net (bid − ask) combinado
          const byTs = new Map<string, number>();
          for (const r of (rows as { exchange: string; bid_wide_usd: number; ask_wide_usd: number; ts: string }[] | null) ?? []) {
            if (retailOnly && r.exchange === "coinbase") continue;
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
  }, [asset, enabled, retailOnly]);

  return data;
}
