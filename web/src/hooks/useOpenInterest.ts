import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

export interface OiPoint {
  time: number; // epoch (s)
  oi: number; // open interest agregado (USD), Coinalyze
}

/**
 * Histórico de Open Interest (derivatives, Coinalyze) para ponderar o heatmap de
 * liquidações: candles com mais OI = mais posições abertas → zonas de liquidação
 * mais fortes. Só Pro+ (a tabela já tem RLS). Janela curta (a coleta começou em
 * 14/06) → o modelo usa OI onde houver e cai para volume puro no histórico antigo.
 */
export function useOpenInterest(asset: string, plan: Plan | null): OiPoint[] {
  const [oi, setOi] = useState<OiPoint[]>([]);
  const advanced = plan?.advanced_metrics ?? false;

  useEffect(() => {
    if (!advanced) {
      setOi([]);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("derivatives")
        .select("open_interest, ts")
        .eq("asset", asset)
        .not("open_interest", "is", null)
        .order("ts", { ascending: true })
        .limit(2000);
      if (!active) return;
      const pts = ((data as { open_interest: number | null; ts: string }[]) ?? [])
        .filter((r) => r.open_interest != null)
        .map((r) => ({ time: Math.floor(new Date(r.ts).getTime() / 1000), oi: Number(r.open_interest) }));
      setOi(pts);
    })();
    return () => {
      active = false;
    };
  }, [asset, advanced]);

  return oi;
}
