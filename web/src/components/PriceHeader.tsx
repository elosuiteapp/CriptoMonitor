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

  const up = change24h != null && change24h >= 0;
  const changePill =
    change24h == null
      ? "border-border bg-muted text-muted-foreground"
      : up
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400";

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{asset}</h1>
          <span className="text-sm text-muted-foreground">{ASSET_NAME[asset] ?? asset}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <span className="num text-[2.6rem] font-bold leading-none tracking-tight text-foreground">
            {fmtPrice(price)}
          </span>
          {change24h != null && (
            <span
              className={`num inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${changePill}`}
            >
              {fmtPct(change24h, 2)} · 24h
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {when ? (
          <>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span>
              Atualizado <span className="num">{when}</span>
            </span>
          </>
        ) : (
          "Aguardando primeiro ciclo de coleta"
        )}
      </div>
    </div>
  );
}
