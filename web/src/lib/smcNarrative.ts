// Transforma o resultado do motor SMC + confluência em (a) uma lista unificada de
// níveis-chave para a tabela e (b) uma leitura automática em português — o
// diferencial do produto: estrutura traduzida, não só caixas no gráfico.

import { getLocale } from "../hooks/useLocale";
import type { ConfluenceHit, ConfluenceSource } from "./smcConfluence";
import { confluenceFor } from "./smcConfluence";
import type { SmcResult } from "./smc";

export type Tone = "good" | "bad" | "warn" | "neutral";

/** Seletor curto PT/EN para os textos puros deste módulo (mesmo padrão do format.ts). */
const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

export interface KeyLevel {
  label: string;
  category: "liquidity" | "orderblock" | "fvg" | "equal" | "zone" | "extreme";
  price: number;
  bias: "bullish" | "bearish" | "neutral";
  note?: string;
  swept?: boolean;
  confluence: ConfluenceHit[];
  distancePct: number;
}

const pct = (level: number, price: number) => ((level - price) / price) * 100;

/** Preço adaptativo na leitura (sem símbolo): integer p/ grandes, decimais p/ sub-1. */
const pnum = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR");
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(4);
  if (a >= 0.0001) return v.toFixed(6);
  return v.toFixed(8);
};

export function buildKeyLevels(smc: SmcResult, sources: ConfluenceSource[]): KeyLevel[] {
  const out: KeyLevel[] = [];
  const conf = (p: number) => confluenceFor(p, smc.atr, sources);
  const add = (l: Omit<KeyLevel, "confluence" | "distancePct">) =>
    out.push({ ...l, confluence: conf(l.price), distancePct: pct(l.price, smc.price) });

  for (const pool of smc.liquidity) {
    add({
      label: pool.side === "buy"
        ? tl("Liquidez de compra (stops de vendidos)", "Buy-side liquidity (shorts' stops)")
        : tl("Liquidez de venda (stops de comprados)", "Sell-side liquidity (longs' stops)"),
      category: "liquidity",
      price: pool.price,
      bias: pool.side === "buy" ? "bullish" : "bearish",
      note: `${pool.count} ${tl("toques", "touches")}${pool.swept ? tl(" · já varrida", " · already swept") : ""}`,
      swept: pool.swept,
    });
  }
  for (const ob of smc.orderBlocks) {
    const kind = ob.bias === "bullish" ? tl("alta (demanda)", "bullish (demand)") : tl("baixa (oferta)", "bearish (supply)");
    add({
      label: `${tl("Order block de", "Order block")} ${kind}${ob.internal ? tl(" · interno", " · internal") : ""}`,
      category: "orderblock",
      price: ob.mid,
      bias: ob.bias,
      note: `${pnum(ob.bottom)}–${pnum(ob.top)}`,
    });
  }
  for (const g of smc.fvgs) {
    add({
      label: g.bias === "bullish"
        ? tl("Imbalance/FVG de alta (gap)", "Bullish imbalance/FVG (gap)")
        : tl("Imbalance/FVG de baixa (gap)", "Bearish imbalance/FVG (gap)"),
      category: "fvg",
      price: g.mid,
      bias: g.bias,
      note: `${pnum(g.bottom)}–${pnum(g.top)}`,
    });
  }
  for (const eq of smc.equals) {
    add({
      label: eq.kind === "EQH"
        ? tl("Topos iguais (EQH) — liquidez acima", "Equal highs (EQH) — liquidity above")
        : tl("Fundos iguais (EQL) — liquidez abaixo", "Equal lows (EQL) — liquidity below"),
      category: "equal",
      price: eq.price,
      bias: eq.kind === "EQH" ? "bearish" : "bullish",
    });
  }
  add({ label: tl("Topo do range (Strong/Weak High)", "Range high (Strong/Weak High)"), category: "extreme", price: smc.trailingTop, bias: "bearish" });
  add({ label: tl("Fundo do range (Strong/Weak Low)", "Range low (Strong/Weak Low)"), category: "extreme", price: smc.trailingBottom, bias: "bullish" });
  add({ label: tl("Início da zona Premium (caro)", "Premium zone start (expensive)"), category: "zone", price: smc.premium.bottom, bias: "bearish" });
  add({ label: tl("Início da zona Discount (barato)", "Discount zone start (cheap)"), category: "zone", price: smc.discount.top, bias: "bullish" });

  return out.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

export interface ReadingLine {
  id: "structure" | "internal" | "zone" | "liqAbove" | "liqBelow" | "obAbove" | "obBelow" | "sweep";
  title: string;
  text: string;
  tone: Tone;
}

const biasWord = (b: "bullish" | "bearish" | null) =>
  b === "bullish" ? tl("alta", "bullish") : b === "bearish" ? tl("baixa", "bearish") : tl("indefinida", "undefined");

export function buildNarrative(smc: SmcResult, sources: ConfluenceSource[]): ReadingLine[] {
  const lines: ReadingLine[] = [];
  const price = smc.price;

  // 1) Viés estrutural
  const tone: Tone = smc.swingBias === "bullish" ? "good" : smc.swingBias === "bearish" ? "bad" : "neutral";
  let structText = tl(`Estrutura principal de ${biasWord(smc.swingBias)}.`, `Main structure is ${biasWord(smc.swingBias)}.`);
  if (smc.lastSwing) {
    const ev = smc.lastSwing.type === "CHoCH"
      ? tl("Mudança de Caráter (CHoCH)", "Change of Character (CHoCH)")
      : tl("Rompimento de Estrutura (BOS)", "Break of Structure (BOS)");
    structText += tl(
      ` Último evento relevante: ${ev} de ${biasWord(smc.lastSwing.bias)} em ${pnum(smc.lastSwing.price)}.`,
      ` Latest relevant event: ${biasWord(smc.lastSwing.bias)} ${ev} at ${pnum(smc.lastSwing.price)}.`,
    );
  }
  lines.push({ id: "structure", title: tl("Estrutura de mercado", "Market structure"), text: structText, tone });

  // 2) Divergência interna
  if (smc.internalBias && smc.swingBias && smc.internalBias !== smc.swingBias) {
    lines.push({
      id: "internal",
      title: tl("Estrutura interna", "Internal structure"),
      text: tl(
        `A estrutura interna está de ${biasWord(smc.internalBias)}, divergindo da principal — possível pivô de curto prazo ou pullback.`,
        `Internal structure is ${biasWord(smc.internalBias)}, diverging from the main one — possible short-term pivot or pullback.`,
      ),
      tone: "warn",
    });
  }

  // 3) Posição premium/discount — pela banda de equilíbrio (47,5–52,5%), não pelas bordas
  // 95%/5% (que rotulavam quase todo o range como "equilíbrio"; auditoria 02/jul).
  if (price > smc.equilibrium.top) {
    lines.push({ id: "zone", title: tl("Zona de preço", "Price zone"), text: tl("Preço na zona PREMIUM (caro) — região onde a mão forte tende a distribuir/vender.", "Price in the PREMIUM zone (expensive) — where smart money tends to distribute/sell."), tone: "warn" });
  } else if (price < smc.equilibrium.bottom) {
    lines.push({ id: "zone", title: tl("Zona de preço", "Price zone"), text: tl("Preço na zona DISCOUNT (barato) — região onde a mão forte tende a acumular/comprar.", "Price in the DISCOUNT zone (cheap) — where smart money tends to accumulate/buy."), tone: "good" });
  } else {
    lines.push({ id: "zone", title: tl("Zona de preço", "Price zone"), text: tl("Preço em EQUILÍBRIO (meio do range) — sem desconto nem prêmio claro.", "Price at EQUILIBRIUM (middle of the range) — no clear discount or premium."), tone: "neutral" });
  }

  // 4) Liquidez alvo acima/abaixo (não varrida)
  const above = smc.liquidity.filter((l) => l.price > price && !l.swept).sort((a, b) => a.price - b.price)[0];
  const below = smc.liquidity.filter((l) => l.price < price && !l.swept).sort((a, b) => b.price - a.price)[0];
  const confTxt = (p: number) => {
    const c = confluenceFor(p, smc.atr, sources);
    const exact = c.filter((h) => h.strength === "exact");
    if (exact.length) return tl(` — confluência com ${exact.map((h) => h.source.label).join(", ")} (alta confiança)`, ` — confluence with ${exact.map((h) => h.source.label).join(", ")} (high confidence)`);
    if (c.length) return tl(` — perto de ${c.map((h) => h.source.label).join(", ")}`, ` — near ${c.map((h) => h.source.label).join(", ")}`);
    return "";
  };
  if (above) {
    lines.push({ id: "liqAbove", title: tl("Alvo de liquidez acima", "Liquidity target above"), text: tl(`Pool de liquidez em ${pnum(above.price)} (~${pct(above.price, price).toFixed(1)}%) — ímã provável${confTxt(above.price)}.`, `Liquidity pool at ${pnum(above.price)} (~${pct(above.price, price).toFixed(1)}%) — likely magnet${confTxt(above.price)}.`), tone: "neutral" });
  }
  if (below) {
    lines.push({ id: "liqBelow", title: tl("Alvo de liquidez abaixo", "Liquidity target below"), text: tl(`Pool de liquidez em ${pnum(below.price)} (~${pct(below.price, price).toFixed(1)}%) — ímã provável${confTxt(below.price)}.`, `Liquidity pool at ${pnum(below.price)} (~${pct(below.price, price).toFixed(1)}%) — likely magnet${confTxt(below.price)}.`), tone: "neutral" });
  }

  // 5) Suporte/resistência por order block (acima e abaixo)
  const obAbove = smc.orderBlocks.filter((o) => o.mid > price).sort((a, b) => a.mid - b.mid)[0];
  const obBelow = smc.orderBlocks.filter((o) => o.mid <= price).sort((a, b) => b.mid - a.mid)[0];
  if (obAbove) {
    lines.push({ id: "obAbove", title: tl("Resistência (order block)", "Resistance (order block)"), text: tl(`Order block de ${biasWord(obAbove.bias)} em ${pnum(obAbove.mid)} acima — possível resistência${confTxt(obAbove.mid)}.`, `${biasWord(obAbove.bias)} order block at ${pnum(obAbove.mid)} above — possible resistance${confTxt(obAbove.mid)}.`), tone: "neutral" });
  }
  if (obBelow) {
    lines.push({ id: "obBelow", title: tl("Suporte (order block)", "Support (order block)"), text: tl(`Order block de ${biasWord(obBelow.bias)} em ${pnum(obBelow.mid)} abaixo — possível suporte${confTxt(obBelow.mid)}.`, `${biasWord(obBelow.bias)} order block at ${pnum(obBelow.mid)} below — possible support${confTxt(obBelow.mid)}.`), tone: "neutral" });
  }

  // 6) Varredura de liquidez recente (stop hunt)
  const sweep = smc.liquidity.filter((l) => l.sweptRecently).sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];
  if (sweep) {
    lines.push({
      id: "sweep",
      title: tl("Varredura de liquidez", "Liquidity sweep"),
      text: tl(
        `Liquidez ${sweep.side === "buy" ? "de compra" : "de venda"} em ${pnum(sweep.price)} foi varrida há pouco — possível stop hunt; atenção a reversão se o preço rejeitar o nível.`,
        `${sweep.side === "buy" ? "Buy-side" : "Sell-side"} liquidity at ${pnum(sweep.price)} was swept recently — possible stop hunt; watch for a reversal if price rejects the level.`,
      ),
      tone: "warn",
    });
  }

  return lines;
}
