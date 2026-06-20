import { relativeTime } from "../lib/format";
import type { OrderbookImbalance } from "../lib/types";
import InfoTip from "./InfoTip";
import Card from "./ui/Card";

interface Props {
  data: OrderbookImbalance | null;
  title?: string;
  source?: string;
  institutional?: boolean;
  timestamp?: string | null;
  info?: string;
}

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

/** Gauge "pressão do book": liquidez parada (bid × ask) perto do preço, em duas
 *  faixas (±0,5% e ±2%). Verde = compra (suporte), vermelho = venda (resistência).
 *  Diferente do CVD (fluxo executado) — a leitura forte é cruzar os dois. */
export default function OrderbookImbalanceCard({
  data,
  title = "Pressão do book (bid × ask)",
  source = "Binance + Coinbase",
  institutional = false,
  timestamp,
  info,
}: Props) {
  const wideTot = data ? data.bid_wide_usd + data.ask_wide_usd : 0;
  const bidPct = wideTot > 0 ? data!.bid_wide_usd / wideTot : 0.5;
  const wideImb = wideTot > 0 ? (data!.bid_wide_usd - data!.ask_wide_usd) / wideTot : 0;
  const buyer = wideImb > 0.05;
  const seller = wideImb < -0.05;
  const sideLabel = buyer ? "Book mais comprador" : seller ? "Book mais vendedor" : "Book equilibrado";
  const sideColor = buyer
    ? "text-emerald-600 dark:text-emerald-400"
    : seller
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";
  const domPct = Math.round((bidPct >= 0.5 ? bidPct : 1 - bidPct) * 100);
  const domWord = bidPct >= 0.5 ? "compra" : "venda";

  const nearTot = data ? data.bid_near_usd + data.ask_near_usd : 0;
  const nearImb = nearTot > 0 ? (data!.bid_near_usd - data!.ask_near_usd) / nearTot : 0;
  const nearWord = nearImb > 0.05 ? "comprador" : nearImb < -0.05 ? "vendedor" : "equilibrado";
  const nearColor = nearImb > 0.05
    ? "text-emerald-600 dark:text-emerald-400"
    : nearImb < -0.05
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

  return (
    <Card highlight={institutional} className="p-4 transition-all duration-200 hover:border-foreground/10 hover:shadow-card-hover">
      <div className="section-title flex items-center gap-1.5">
        {title}
        {info && <InfoTip text={info} />}
      </div>

      {!data ? (
        <div className="mt-2 text-sm text-muted-foreground">Indisponível neste ciclo.</div>
      ) : (
        <>
          <div className="mt-1 text-sm leading-snug text-foreground">
            <span className={sideColor}>{sideLabel}</span>{" "}
            <span className="num text-muted-foreground">· {domPct}% {domWord}</span>
          </div>

          {/* barra: verde (bid/compra) à esquerda, vermelho (ask/venda) à direita */}
          <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${bidPct * 100}%` }} />
            <div className="absolute inset-y-0 right-0 bg-rose-500" style={{ width: `${(1 - bidPct) * 100}%` }} />
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-background/80" />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="num">compra {fmtUsd(data.bid_wide_usd)}</span>
            <span className="text-muted-foreground/70">±2% do preço</span>
            <span className="num">{fmtUsd(data.ask_wide_usd)} venda</span>
          </div>

          <div className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
            Perto (±0,5%): <b className={nearColor}>{nearWord}</b>
            <span className="num"> · {fmtUsd(data.bid_near_usd)} × {fmtUsd(data.ask_near_usd)}</span>
          </div>
        </>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {institutional && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-primary">
              Institucional
            </span>
          )}
          <span>Fonte: {source}</span>
        </span>
        <span className="num">{relativeTime(timestamp)}</span>
      </div>
    </Card>
  );
}
