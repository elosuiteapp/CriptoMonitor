// Resumo SMC compacto para alimentar o copiloto de IA (generate-analysis).
// Calcula a estrutura em 1D e 4h e devolve só o essencial (viés, último evento,
// zona premium/discount, suporte/resistência por order block, liquidez e sweep).

import { fetchKlines, type Timeframe } from "./marketData";
import { computeSmc, type SmcResult } from "./smc";

function summarizeOne(smc: SmcResult | null) {
  if (!smc) return null;
  const p = smc.price;
  const obAbove = smc.orderBlocks.filter((o) => o.mid > p).sort((a, b) => a.mid - b.mid)[0];
  const obBelow = smc.orderBlocks.filter((o) => o.mid <= p).sort((a, b) => b.mid - a.mid)[0];
  const liqAbove = smc.liquidity.filter((l) => !l.swept && l.price > p).sort((a, b) => a.price - b.price)[0];
  const liqBelow = smc.liquidity.filter((l) => !l.swept && l.price < p).sort((a, b) => b.price - a.price)[0];
  const sweep = smc.liquidity.find((l) => l.sweptRecently);
  // Zona pela banda de equilíbrio (47,5–52,5%) — MESMO critério da UI (gauge/narrativa,
  // auditoria 02/jul). Antes usava as bordas 95%/5% e a IA recebia zona divergente da tela.
  const zone = p > smc.equilibrium.top ? "premium" : p < smc.equilibrium.bottom ? "discount" : "equilibrium";
  return {
    bias: smc.swingBias,
    internal_bias: smc.internalBias,
    last_structure: smc.lastSwing ? { type: smc.lastSwing.type, bias: smc.lastSwing.bias, price: Math.round(smc.lastSwing.price) } : null,
    zone,
    range: { low: Math.round(smc.trailingBottom), high: Math.round(smc.trailingTop) },
    order_block_resistance: obAbove ? Math.round(obAbove.mid) : null,
    order_block_support: obBelow ? Math.round(obBelow.mid) : null,
    liquidity_above: liqAbove ? Math.round(liqAbove.price) : null,
    liquidity_below: liqBelow ? Math.round(liqBelow.price) : null,
    recent_sweep: sweep ? { side: sweep.side, price: Math.round(sweep.price) } : null,
    prev_day_high: smc.prevLevels.pdh != null ? Math.round(smc.prevLevels.pdh) : null,
    prev_day_low: smc.prevLevels.pdl != null ? Math.round(smc.prevLevels.pdl) : null,
    range_extremes: smc.extremes, // strong/weak high-low (à la LuxAlgo)
  };
}

export async function smcSummary(asset: string) {
  const tfs: Timeframe[] = ["1d", "4h"];
  const [d1, h4] = await Promise.all(
    tfs.map(async (t) => {
      try {
        return summarizeOne(computeSmc(await fetchKlines(asset, t, 320)));
      } catch {
        return null;
      }
    }),
  );
  return { "1d": d1, "4h": h4 };
}
