import { useEffect, useState } from "react";

import { fetchStablecoinLiquidity, type StablecoinLiquidity } from "../lib/onchain";

/** Liquidez em stablecoins (dry powder) — sinal on-chain market-wide (DefiLlama).
 *  Igual para todas as moedas; busca uma vez (cacheado em lib/onchain). */
export function useStablecoins(): StablecoinLiquidity | null {
  const [sc, setSc] = useState<StablecoinLiquidity | null>(null);

  useEffect(() => {
    let active = true;
    fetchStablecoinLiquidity()
      .then((v) => active && setSc(v))
      .catch(() => active && setSc(null));
    return () => {
      active = false;
    };
  }, []);

  return sc;
}
