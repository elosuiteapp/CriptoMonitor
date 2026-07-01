import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

export interface PressureWindow {
  label: string;
  bid: number;
  ask: number;
  tilt: number; // (bid − ask) / (bid + ask), −1..1
}

/** Pressão do book (±2%) por janela (48h/12h/30m) a partir do orderbook_imbalance —
 *  disponível para TODAS as moedas (o depth/heatmap só cobre BTC/ETH/SOL/BNB). A soma por
 *  janela é feita no servidor (RPC get_book_pressure_windows, sql/071) p/ não bater no corte
 *  de linhas do PostgREST. Só busca com a camada ligada; atualiza a cada 60s com a aba visível. */
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
      const out = ["48h", "12h", "30m"].map((label) => {
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
