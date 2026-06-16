// Camada on-chain — fonte gratuita e confiável (DefiLlama datasets, CORS aberto).
// 1º sinal: TOKEN UNLOCKS (liberação programada de tokens travados/vesting). É um
// evento de OFERTA: unlocks grandes (>1% do supply) tendem a gerar pressão vendedora.
// Endpoint livre: https://defillama-datasets.llama.fi/emissions/{slug}

// Mapa ticker → slug da DefiLlama (só moedas do nosso universo COM vesting/unlocks;
// BTC/ETH/SOL/XRP etc. não têm). Slugs verificados na lista pública.
const UNLOCK_SLUG: Record<string, string> = {
  ARB: "arbitrum",
  OP: "optimism-foundation",
  UNI: "uniswap",
  APT: "aptos",
  SUI: "sui-foundation",
  TIA: "celestia",
  ENA: "ethena",
  JUP: "jupiter",
  AAVE: "aave",
  LDO: "lido",
  PYTH: "pyth",
  JTO: "jito",
  SEI: "sei",
  DYDX: "dydx",
  ENS: "ens",
  IMX: "immutablex",
  BLUR: "blur",
  AXS: "axie-infinity",
  PENDLE: "pendle",
  ONDO: "ondo-finance",
  WLD: "worldcoin",
};

export interface UnlockEvent {
  date: number; // epoch ms do próximo unlock
  tokens: number; // nº de tokens liberados
  pctOfSupply: number; // % do supply máximo (0 quando o supply é desconhecido)
}

/** Próximo unlock programado do ativo (DefiLlama). null quando a moeda não tem
 *  vesting/slug ou não há evento futuro. */
export async function fetchNextUnlock(asset: string): Promise<UnlockEvent | null> {
  const slug = UNLOCK_SLUG[asset];
  if (!slug) return null;
  try {
    const res = await fetch(`https://defillama-datasets.llama.fi/emissions/${slug}`);
    if (!res.ok) return null;
    const d = await res.json();
    const total = Number(d?.metadata?.total) || 0;
    const events = (d?.metadata?.events ?? []) as { timestamp?: number; noOfTokens?: number[] }[];
    const nowSec = Date.now() / 1000;
    const next = events
      .filter((e) => Number(e.timestamp) > nowSec && Array.isArray(e.noOfTokens))
      .map((e) => ({
        ts: Number(e.timestamp),
        tokens: (e.noOfTokens ?? []).reduce((a, b) => a + (Number(b) || 0), 0),
      }))
      .filter((e) => e.tokens > 0)
      .sort((a, b) => a.ts - b.ts)[0];
    if (!next) return null;
    return {
      date: next.ts * 1000,
      tokens: next.tokens,
      pctOfSupply: total > 0 ? (next.tokens / total) * 100 : 0,
    };
  } catch {
    return null;
  }
}
