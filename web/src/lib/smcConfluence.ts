// Confluência: cruza os níveis do motor SMC com os dados que a plataforma já
// coleta (paredes do order book + níveis de gamma/opções). Um nível SMC que
// coincide com Put Wall + parede de compra, por exemplo, é de alta confiança —
// algo que NENHUM dos indicadores do TradingView consegue sozinho.

export type ConfluenceKind = "gamma" | "wall";

export interface ConfluenceSource {
  kind: ConfluenceKind;
  label: string;
  price: number;
}

/** Tolerância de coincidência: ~0,35% do preço ou 0,4·ATR (o que for maior). */
export function confluenceTolerance(price: number, atr: number): number {
  return Math.max(price * 0.0035, atr * 0.4);
}

/** Fontes externas próximas a um nível SMC (ordenadas pela distância). */
export function confluenceFor(
  level: number,
  atr: number,
  sources: ConfluenceSource[],
): ConfluenceSource[] {
  const tol = confluenceTolerance(level, atr);
  return sources
    .filter((s) => Number.isFinite(s.price) && Math.abs(s.price - level) <= tol)
    .sort((a, b) => Math.abs(a.price - level) - Math.abs(b.price - level));
}

export interface GammaLevels {
  call_wall: number | null;
  put_wall: number | null;
  zero_gamma_level: number | null;
  max_pain: number | null;
}

export interface WallLevel {
  side: "bid" | "ask";
  price: number;
  notional_usd: number;
}

/** Monta a lista de fontes de confluência a partir de gamma + paredes do book. */
export function buildConfluenceSources(
  gamma: GammaLevels | null,
  walls: WallLevel[],
  fmtUsd: (v: number) => string,
): ConfluenceSource[] {
  const sources: ConfluenceSource[] = [];
  if (gamma) {
    if (gamma.call_wall) sources.push({ kind: "gamma", label: "Call Wall", price: gamma.call_wall });
    if (gamma.put_wall) sources.push({ kind: "gamma", label: "Put Wall", price: gamma.put_wall });
    if (gamma.zero_gamma_level) sources.push({ kind: "gamma", label: "Zero Gamma", price: gamma.zero_gamma_level });
    if (gamma.max_pain) sources.push({ kind: "gamma", label: "Max Pain", price: gamma.max_pain });
  }
  const topWalls = [...walls].sort((a, b) => b.notional_usd - a.notional_usd).slice(0, 6);
  for (const w of topWalls) {
    sources.push({
      kind: "wall",
      label: `Parede ${w.side === "bid" ? "compra" : "venda"} ${fmtUsd(w.notional_usd)}`,
      price: w.price,
    });
  }
  return sources;
}
