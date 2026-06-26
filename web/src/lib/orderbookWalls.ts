import type { OrderbookWall } from "./types";

/** Zona de liquidez agregada: paredes do mesmo lado e preço próximo somadas numa só. */
export interface WallZone {
  side: "bid" | "ask"; // lado original do book (snapshot)
  price: number; // preço médio ponderado pelo notional
  notional: number; // soma do notional (USD) da zona
  venues: Set<string>; // exchanges que contribuíram (confluência)
  count: number; // nº de ordens/buckets somados
}

/**
 * Agrega as paredes do book em ZONAS: paredes do MESMO lado com preços a ~`tol` de
 * distância viram uma só, SOMANDO o notional (Binance+Coinbase+OKX no mesmo preço =
 * parede forte de verdade). Antes cada exchange virava uma barra separada e a maior
 * "engolia" as outras. Devolve ordenado por notional desc (a mais forte primeiro).
 * Fonte ÚNICA usada pelo gráfico (barras) e pelo painel (escada de liquidez).
 */
export function aggregateWalls(walls: OrderbookWall[], tol = 0.0018): WallZone[] {
  const zones: WallZone[] = [];
  for (const w of [...walls].sort((a, b) => b.notional_usd - a.notional_usd)) {
    const z = zones.find((zz) => zz.side === w.side && Math.abs(zz.price - w.price) / w.price <= tol);
    if (z) {
      z.price = (z.price * z.notional + w.price * w.notional_usd) / (z.notional + w.notional_usd);
      z.notional += w.notional_usd;
      z.venues.add(w.exchange);
      z.count += 1;
    } else {
      zones.push({ side: w.side, price: w.price, notional: w.notional_usd, venues: new Set([w.exchange]), count: 1 });
    }
  }
  zones.sort((a, b) => b.notional - a.notional);
  return zones;
}
