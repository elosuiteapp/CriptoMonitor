import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

export interface CryptoOnchain {
  onchain: {
    mvrvZ: number | null;
    sopr: number | null;
    nupl: number | null;
    puell: number | null;
    realized: number | null;
    reserveRisk: number | null;
    spot: number | null;
    profit: boolean | null;
    zones: { mvrvZ: string | null; sopr: string | null; nupl: string | null; puell: string | null };
    cycleScore: number | null;
    cycleLabel: string | null;
  };
  liquidity: { stableTotal: number | null; stable30dPct: number | null; tide: string | null };
  network: { hashrate: number | null; feeFast: number | null; diffChange: number | null; mempoolTx: number | null };
  ts: string;
}

/** On-chain (MVRV/SOPR/NUPL/Puell), maré de stablecoins e saúde da rede BTC — market-wide,
 *  atualiza ~diário (re-busca a cada 10 min). Fontes grátis via edge `crypto-onchain`. */
export function useCryptoOnchain(enabled = true): { data: CryptoOnchain | null; loading: boolean } {
  const [data, setData] = useState<CryptoOnchain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      const { data: d, error } = await supabase.functions.invoke("crypto-onchain", { body: {} });
      if (!active) return;
      if (!error && d && !(d as { error?: string }).error) setData(d as CryptoOnchain);
      setLoading(false);
    };
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled]);

  return { data, loading };
}
