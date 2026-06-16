import { useEffect, useState } from "react";

import { fetchPerpContext, type PerpContext } from "../lib/marketData";

/** Funding + OI (Binance Futures) do ativo, atualizado a cada 60s com a aba
 *  visível. null quando a moeda não tem perp na Binance. */
export function usePerpContext(asset: string): PerpContext | null {
  const [ctx, setCtx] = useState<PerpContext | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchPerpContext(asset)
        .then((c) => active && setCtx(c))
        .catch(() => active && setCtx(null));
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset]);

  return ctx;
}
