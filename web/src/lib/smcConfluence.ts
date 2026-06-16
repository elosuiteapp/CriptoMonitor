// Confluência: cruza os níveis do motor SMC com os dados que a plataforma já
// coleta (paredes do order book + níveis de gamma/opções). Um nível SMC que
// coincide com Put Wall + parede de compra, por exemplo, é de alta confiança —
// algo que NENHUM dos indicadores do TradingView consegue sozinho.

export type ConfluenceKind = "gamma" | "wall" | "vp" | "liq" | "htf";

export interface ConfluenceSource {
  kind: ConfluenceKind;
  label: string;
  price: number;
}

export interface ConfluenceHit {
  source: ConfluenceSource;
  strength: "exact" | "near"; // exata (no nível) ou próxima (~1%)
  distancePct: number;
}

/** Tolerância de coincidência EXATA: ~0,35% do preço ou 0,4·ATR (o que for maior). */
export function confluenceTolerance(price: number, atr: number): number {
  return Math.max(price * 0.0035, atr * 0.4);
}

/** Fontes externas próximas a um nível SMC, com 2 níveis: exata e "próxima" (~1%). */
export function confluenceFor(level: number, atr: number, sources: ConfluenceSource[]): ConfluenceHit[] {
  const tolExact = confluenceTolerance(level, atr);
  const tolNear = level * 0.01;
  return sources
    .filter((s) => Number.isFinite(s.price))
    .map((s) => ({ source: s, d: Math.abs(s.price - level) }))
    .filter((x) => x.d <= tolNear)
    .map((x) => ({ source: x.source, strength: (x.d <= tolExact ? "exact" : "near") as "exact" | "near", distancePct: (x.d / level) * 100 }))
    .sort((a, b) => a.distancePct - b.distancePct);
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
