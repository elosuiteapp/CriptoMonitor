import { useEffect, useState } from "react";

import { fetchVolumeDelta, type CvdPoint, type Timeframe } from "../lib/marketData";

/** Volume Delta / CVD por candle (klines da Binance) para o ativo+timeframe do
 *  gráfico. Só busca quando `enabled` (camada CVD ligada). Atualiza a cada 60s
 *  com a aba visível. */
export function useCvd(asset: string, tf: Timeframe, enabled: boolean): CvdPoint[] {
  const [data, setData] = useState<CvdPoint[]>([]);

  useEffect(() => {
    if (!enabled) {
      setData([]);
      return;
    }
    let active = true;
    const load = () =>
      fetchVolumeDelta(asset, tf, 1000)
        .then((d) => active && setData(d))
        .catch(() => active && setData([]));
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [asset, tf, enabled]);

  return data;
}
