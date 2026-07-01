import { relativeTime } from "../lib/format";
import { useT } from "../lib/i18n";
import type { OrderbookImbalance, OrderbookWall } from "../lib/types";
import InfoTip from "./InfoTip";
import Card from "./ui/Card";

interface Props {
  walls: OrderbookWall[];
  price: number | null;
  pressure?: OrderbookImbalance | null;
  timestamp?: string | null;
  institutional?: boolean;
}

const fmtUsd = (n: number) => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
};

// Peso por proximidade: parede colada no preço pesa 1; a 0,5% pesa ~0,5; a 3,5% ~0,12.
// Evita que um muro lá longe distorça o placar (mas ainda conta um pouco).
const proximityWeight = (wallPrice: number, price: number | null) => {
  if (price == null || price <= 0) return 1;
  const distFrac = Math.abs(wallPrice - price) / price;
  return 1 / (1 + distFrac / 0.005);
};

/** Medidor das PAREDES FORTES (só ordens grandes / baleias), ponderadas pela
 *  proximidade do preço: suporte (bids, abaixo) × resistência (asks, acima).
 *  Diferente da pressão do book (que soma TODO o book) — o sinal forte é a
 *  DIVERGÊNCIA entre os dois. Auto-atualiza junto com a camada de paredes (~45s).
 *  Spoofável (inclina as chances, não prevê). Pro+. */
export default function WhaleWallsGauge({ walls, price, pressure, timestamp, institutional = false }: Props) {
  const { t } = useT();
  const w = t.whaleWalls;

  let support = 0;
  let resistance = 0;
  for (const wall of walls) {
    const weighted = wall.notional_usd * proximityWeight(wall.price, price);
    if (wall.side === "bid") support += weighted;
    else resistance += weighted;
  }
  const total = support + resistance;
  const supportPct = total > 0 ? support / total : 0.5;

  const wallSide = supportPct > 0.55 ? "support" : supportPct < 0.45 ? "resistance" : "flat";
  const sideLabel = wallSide === "support" ? w.support : wallSide === "resistance" ? w.resistance : w.balanced;
  const sideColor =
    wallSide === "support"
      ? "text-emerald-600 dark:text-emerald-400"
      : wallSide === "resistance"
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  const domPct = Math.round((supportPct >= 0.5 ? supportPct : 1 - supportPct) * 100);

  // Divergência vs pressão geral do book (todo o book, não só baleias).
  const pTot = pressure ? pressure.bid_wide_usd + pressure.ask_wide_usd : 0;
  const pImb = pTot > 0 ? (pressure!.bid_wide_usd - pressure!.ask_wide_usd) / pTot : 0;
  const pBuyer = pImb > 0.05;
  const pSeller = pImb < -0.05;
  const diverge =
    wallSide === "support" && pSeller ? w.divBuy : wallSide === "resistance" && pBuyer ? w.divSell : null;
  const aligned =
    !diverge && ((wallSide === "support" && pBuyer) || (wallSide === "resistance" && pSeller));

  return (
    <Card highlight={institutional} className="p-4 transition-all duration-200 hover:border-foreground/10 hover:shadow-card-hover">
      <div className="section-title flex items-center gap-1.5">
        {w.title}
        <InfoTip text={w.tip} />
      </div>

      {total <= 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">{w.unavailable}</div>
      ) : (
        <>
          <div className="mt-1 text-sm leading-snug text-foreground">
            <span className={sideColor}>{sideLabel}</span>{" "}
            <span className="num text-muted-foreground">· {domPct}%</span>
            <span className="text-muted-foreground/70"> · {w.weighted}</span>
          </div>

          {/* barra: verde (suporte/bids, abaixo) à esquerda, vermelho (resistência/asks, acima) à direita */}
          <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${supportPct * 100}%` }} />
            <div className="absolute inset-y-0 right-0 bg-rose-500" style={{ width: `${(1 - supportPct) * 100}%` }} />
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-background/80" />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="num">{fmtUsd(support)} {w.support}</span>
            <span className="num">{w.resistance} {fmtUsd(resistance)}</span>
          </div>

          {(diverge || aligned) && (
            <div className="mt-2 border-t border-border pt-2 text-[11px]">
              {diverge ? (
                <span className="text-amber-600 dark:text-amber-400">{diverge}</span>
              ) : (
                <span className="text-muted-foreground">{w.aligned}</span>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {institutional && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-primary">
              {t.book.institutional}
            </span>
          )}
          <span>{t.book.source} Binance + Coinbase + OKX</span>
        </span>
        <span className="num">{relativeTime(timestamp)}</span>
      </div>
    </Card>
  );
}
