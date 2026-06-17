import { useEffect, useState } from "react";

import { fetchNetworkActivity, type NetworkActivity } from "../lib/onchain";

/** Atividade da blockchain do ativo (L1s nativos: BTC/ETH/SOL/LTC/BCH/DOGE).
 *  null para tokens. Atualiza a cada 2 min com a aba visível. */
export function useNetworkActivity(asset: string): NetworkActivity | null {
  const [net, setNet] = useState<NetworkActivity | null>(null);

  useEffect(() => {
    let active = true;
    setNet(null);
    const load = () =>
      fetchNetworkActivity(asset)
        .then((n) => active && setNet(n))
        .catch(() => active && setNet(null));
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 120000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset]);

  return net;
}
