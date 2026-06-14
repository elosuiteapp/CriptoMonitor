import { ASSET_NAME, fmtPrice } from "../lib/format";
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

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold text-slate-100">{asset}</h1>
          <span className="text-sm text-slate-500">{ASSET_NAME[asset] ?? asset}</span>
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-white">{fmtPrice(price)}</div>
      </div>
      <div className="text-right text-xs text-slate-500">
        {when ? <>Atualizado {when}</> : "Aguardando primeiro ciclo de coleta"}
      </div>
    </div>
  );
}
