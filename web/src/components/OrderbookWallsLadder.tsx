import { fmtPrice, fmtUsd } from "../lib/format";
import { useT } from "../lib/i18n";
import { aggregateWalls, type WallZone } from "../lib/orderbookWalls";
import type { OrderbookWall } from "../lib/types";

type Tt = (pt: string, en: string) => string;
// Nomes curtos das corretoras (o notional da zona soma as que aparecem aqui).
const VENUE_SHORT: Record<string, string> = { binance: "Bin", coinbase: "CB", okx: "OKX" };
const venueLabel = (venues: Set<string>) => [...venues].map((v) => VENUE_SHORT[v] ?? v).join("·");

interface Row {
  z: WallZone;
  support: boolean; // abaixo do preço atual = suporte
  distPct: number;
}

/** Escada de liquidez — paredes do book agregadas por zona e ordenadas por preço em
 *  torno do atual: resistência (acima, vermelho) / suporte (abaixo, verde). Leitura
 *  limpa que o overlay no gráfico não entrega em timeframes largos (as barras se
 *  amontoam numa faixa estreita). Aqui as linhas nunca colam e mostram tamanho,
 *  nº de ordens, confluência de exchanges e distância do preço. */
export default function OrderbookWallsLadder({ walls, price }: { walls: OrderbookWall[]; price: number | null }) {
  const { isEn } = useT();
  const tt: Tt = (pt, en) => (isEn ? en : pt);

  if (!walls.length) {
    return (
      <div className="rounded-lg border border-border bg-card dark:bg-card/60 px-3 py-2 text-xs text-muted-foreground">
        {tt("Escada de liquidez", "Liquidity ladder")} — {tt("aguardando paredes do book", "awaiting order-book walls")}
      </div>
    );
  }

  const zones = aggregateWalls(walls).slice(0, 10);
  const maxNot = Math.max(...zones.map((z) => z.notional), 1);
  const cur = price;
  const rows: Row[] = zones
    .map((z) => ({
      z,
      support: cur != null ? z.price < cur : z.side === "bid",
      distPct: cur != null ? ((z.price - cur) / cur) * 100 : 0,
    }))
    .sort((a, b) => b.z.price - a.z.price);
  const firstBelow = cur != null ? rows.findIndex((r) => r.z.price < cur) : -1;

  const divider = cur != null ? (
    <div className="flex items-center gap-2 py-1">
      <span className="h-px flex-1 bg-primary/40" />
      <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
        ◀ {tt("preço", "price")} {fmtPrice(cur)}
      </span>
      <span className="h-px flex-1 bg-primary/40" />
    </div>
  ) : null;

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card/60 p-2">
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
        <span className="font-medium">{tt("Escada de liquidez · paredes do book", "Liquidity ladder · order-book walls")}</span>
        <span>
          <span className="text-rose-600 dark:text-rose-400">{tt("resistência", "resistance")}</span>
          <span className="mx-1">·</span>
          <span className="text-emerald-600 dark:text-emerald-400">{tt("suporte", "support")}</span>
        </span>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={`${r.z.side}-${Math.round(r.z.price)}`}>
            {i === firstBelow ? divider : null}
            <LadderRow r={r} maxNot={maxNot} strongest={r.z.notional >= maxNot} tt={tt} />
          </div>
        ))}
        {firstBelow === -1 ? divider : null}
      </div>
      <p className="mt-1 px-1 text-[10px] text-muted-foreground">
        {tt(
          "Notional = total parado na zona (soma das corretoras listadas). Liquidez parada que tende a frear/atrair o preço — não é ordem garantida. As maiores zonas costumam ficar perto do preço (book mais denso no toque).",
          "Notional = total resting in the zone (summed across the listed venues). Resting liquidity that tends to slow/attract price — not a guaranteed order. The biggest zones tend to sit near price (book is densest at the touch).",
        )}
      </p>
    </div>
  );
}

function LadderRow({ r, maxNot, strongest, tt }: { r: Row; maxNot: number; strongest: boolean; tt: Tt }) {
  const { z, support, distPct } = r;
  const pct = Math.max(4, Math.round((z.notional / maxNot) * 100));
  return (
    <div className={`flex items-center gap-2 rounded px-1 py-1 ${strongest ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}>
      <span className={support ? "text-emerald-500" : "text-rose-500"} aria-hidden>
        ●
      </span>
      <span className="num w-20 shrink-0 text-sm font-semibold text-foreground">{fmtPrice(z.price)}</span>
      <span className="hidden w-16 shrink-0 text-[11px] text-muted-foreground sm:block">
        {support ? tt("suporte", "support") : tt("resistência", "resistance")}
      </span>
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${support ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="num w-16 shrink-0 text-right text-xs font-medium text-foreground">{fmtUsd(z.notional)}</span>
      <span
        className={`hidden w-24 shrink-0 text-right text-[10px] sm:block ${z.venues.size >= 2 ? "text-primary" : "text-muted-foreground"}`}
        title={[...z.venues].join(", ")}
      >
        {venueLabel(z.venues)}
      </span>
      <span className="num w-12 shrink-0 text-right text-[11px] text-muted-foreground">
        {distPct >= 0 ? "+" : ""}
        {distPct.toFixed(1)}%
      </span>
    </div>
  );
}
