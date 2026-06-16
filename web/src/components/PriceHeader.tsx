import { useEffect, useState } from "react";

import { ASSET_NAME, fmtPct, fmtPrice } from "../lib/format";
import { fetch24hChange } from "../lib/marketData";
import type { SnapshotPayload } from "../lib/types";

interface Props {
  asset: string;
  payload: SnapshotPayload | null;
  updatedAt: string | null;
}

export default function PriceHeader({ asset, payload, updatedAt }: Props) {
  const binance = payload?.price?.binance;
  const coinbase = payload?.price?.coinbase;
  const price = binance?.price ?? coinbase?.price ?? payload?.gamma?.spot_price ?? null;
  const when = updatedAt ? new Date(updatedAt).toLocaleString("pt-BR") : null;

  const [change24h, setChange24h] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    fetch24hChange(asset).then((v) => active && setChange24h(v));
    return () => {
      active = false;
    };
  }, [asset]);

  const changeColor =
    change24h == null
      ? "text-muted-foreground"
      : change24h >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400";

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold text-foreground">{asset}</h1>
          <span className="text-sm text-muted-foreground">{ASSET_NAME[asset] ?? asset}</span>
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="num text-3xl font-bold text-foreground">{fmtPrice(price)}</span>
          <span className={`num text-sm font-medium ${changeColor}`}>
            {change24h == null ? "" : `${fmtPct(change24h, 2)} 24h`}
          </span>
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {when ? <>Atualizado <span className="num">{when}</span></> : "Aguardando primeiro ciclo de coleta"}
      </div>
    </div>
  );
}
