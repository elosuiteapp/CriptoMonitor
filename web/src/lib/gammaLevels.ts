import type { GammaData } from "./types";

export interface GammaLevels {
  callWall: number | null; // strike de maior GEX positivo
  putWall: number | null; // strike de GEX mais negativo
  zeroGamma: number | null; // flip
  maxPain: number | null;
}

/** Extrai os níveis plotáveis a partir do perfil de gamma por strike. */
export function gammaLevels(gamma: GammaData | null | undefined): GammaLevels {
  const empty: GammaLevels = { callWall: null, putWall: null, zeroGamma: null, maxPain: null };
  if (!gamma) return empty;

  let callWall: number | null = null;
  let putWall: number | null = null;
  const profile = gamma.profile_jsonb;
  if (profile && typeof profile === "object") {
    let maxGex = -Infinity;
    let minGex = Infinity;
    for (const [strikeStr, gex] of Object.entries(profile)) {
      const strike = Number(strikeStr);
      if (!Number.isFinite(strike)) continue;
      if (gex > maxGex) {
        maxGex = gex;
        callWall = strike;
      }
      if (gex < minGex) {
        minGex = gex;
        putWall = strike;
      }
    }
  }
  return {
    callWall,
    putWall,
    zeroGamma: gamma.zero_gamma_level ?? null,
    maxPain: gamma.max_pain ?? null,
  };
}
