import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

export interface PressureWindow {
  label: string;
  bid: number;
  ask: number;
  tilt: number; // (bid − ask) / (bid + ask), −1..1
}

/** Pressão do book (±2%) em DUAS janelas (sql/093): '30m' = soma dos snapshots do
 *  orderbook_imbalance; '1m' = AO VIVO, último snapshot do orderbook_depth (coleta de 1 min;
 *  fallback imbalance p/ moedas sem depth). Soma no servidor (RPC get_book_pressure_windows).
 *  Só busca com a camada ligada; re-busca a cada 60s com a aba visível (acompanha o 1m). */
export function useBookPressureWindows(asset: string, enabled: boolean): PressureWindow[] | null {
  const [data, setData] = useState<PressureWindow[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let active = true;
    const load = async () => {
      const { data: rows } = await supabase.rpc("get_book_pressure_windows", { p_asset: asset });
      if (!active) return;
      const byLabel = new Map((rows as { label: string; bid: number; ask: number }[] | null)?.map((r) => [r.label, r]) ?? []);
      const out = ["30m", "1m"].map((label) => {
        const r = byLabel.get(label);
        const bid = Number(r?.bid ?? 0);
        const ask = Number(r?.ask ?? 0);
        const tot = bid + ask;
        return { label, bid, ask, tilt: tot > 0 ? (bid - ask) / tot : 0 };
      });
      setData(out);
    };
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, enabled]);

  return data;
}
