// Transforma o resultado do motor SMC + confluência em (a) uma lista unificada de
// níveis-chave para a tabela e (b) uma leitura automática em português — o
// diferencial do produto: estrutura traduzida, não só caixas no gráfico.

import type { ConfluenceHit, ConfluenceSource } from "./smcConfluence";
import { confluenceFor } from "./smcConfluence";
import type { SmcResult } from "./smc";

export type Tone = "good" | "bad" | "warn" | "neutral";

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

export function buildKeyLevels(smc: SmcResult, sources: ConfluenceSource[]): KeyLevel[] {
  const out: KeyLevel[] = [];
  const conf = (p: number) => confluenceFor(p, smc.atr, sources);
  const add = (l: Omit<KeyLevel, "confluence" | "distancePct">) =>
    out.push({ ...l, confluence: conf(l.price), distancePct: pct(l.price, smc.price) });

  for (const pool of smc.liquidity) {
    add({
      label: pool.side === "buy" ? "Liquidez de compra (stops de vendidos)" : "Liquidez de venda (stops de comprados)",
      category: "liquidity",
      price: pool.price,
      bias: pool.side === "buy" ? "bullish" : "bearish",
      note: `${pool.count} toques${pool.swept ? " · já varrida" : ""}`,
      swept: pool.swept,
    });
  }
  for (const ob of smc.orderBlocks) {
    add({
      label: `Order block de ${ob.bias === "bullish" ? "alta (demanda)" : "baixa (oferta)"}${ob.internal ? " · interno" : ""}`,
      category: "orderblock",
      price: ob.mid,
      bias: ob.bias,
      note: `${ob.bottom.toFixed(0)}–${ob.top.toFixed(0)}`,
    });
  }
  for (const g of smc.fvgs) {
    add({
      label: `Imbalance/FVG de ${g.bias === "bullish" ? "alta" : "baixa"} (gap)`,
      category: "fvg",
      price: g.mid,
      bias: g.bias,
      note: `${g.bottom.toFixed(0)}–${g.top.toFixed(0)}`,
    });
  }
  for (const eq of smc.equals) {
    add({
      label: eq.kind === "EQH" ? "Topos iguais (EQH) — liquidez acima" : "Fundos iguais (EQL) — liquidez abaixo",
      category: "equal",
      price: eq.price,
      bias: eq.kind === "EQH" ? "bearish" : "bullish",
    });
  }
  add({ label: "Topo do range (Strong/Weak High)", category: "extreme", price: smc.trailingTop, bias: "bearish" });
  add({ label: "Fundo do range (Strong/Weak Low)", category: "extreme", price: smc.trailingBottom, bias: "bullish" });
  add({ label: "Início da zona Premium (caro)", category: "zone", price: smc.premium.bottom, bias: "bearish" });
  add({ label: "Início da zona Discount (barato)", category: "zone", price: smc.discount.top, bias: "bullish" });

  return out.sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct));
}

export interface ReadingLine {
  title: string;
  text: string;
  tone: Tone;
}

const biasWord = (b: "bullish" | "bearish" | null) => (b === "bullish" ? "alta" : b === "bearish" ? "baixa" : "indefinida");

export function buildNarrative(smc: SmcResult, sources: ConfluenceSource[]): ReadingLine[] {
  const lines: ReadingLine[] = [];
  const price = smc.price;

  // 1) Viés estrutural
  const tone: Tone = smc.swingBias === "bullish" ? "good" : smc.swingBias === "bearish" ? "bad" : "neutral";
  let structText = `Estrutura principal de ${biasWord(smc.swingBias)}.`;
  if (smc.lastSwing) {
    const ev = smc.lastSwing.type === "CHoCH" ? "Mudança de Caráter (CHoCH)" : "Rompimento de Estrutura (BOS)";
    structText += ` Último evento relevante: ${ev} de ${biasWord(smc.lastSwing.bias)} em ${smc.lastSwing.price.toFixed(0)}.`;
  }
  lines.push({ title: "Estrutura de mercado", text: structText, tone });

  // 2) Divergência interna
  if (smc.internalBias && smc.swingBias && smc.internalBias !== smc.swingBias) {
    lines.push({
      title: "Estrutura interna",
      text: `A estrutura interna está de ${biasWord(smc.internalBias)}, divergindo da principal — possível pivô de curto prazo ou pullback.`,
      tone: "warn",
    });
  }

  // 3) Posição premium/discount
  if (price >= smc.premium.bottom) {
    lines.push({ title: "Zona de preço", text: "Preço na zona PREMIUM (caro) — região onde a mão forte tende a distribuir/vender.", tone: "warn" });
  } else if (price <= smc.discount.top) {
    lines.push({ title: "Zona de preço", text: "Preço na zona DISCOUNT (barato) — região onde a mão forte tende a acumular/comprar.", tone: "good" });
  } else {
    lines.push({ title: "Zona de preço", text: "Preço em EQUILÍBRIO (meio do range) — sem desconto nem prêmio claro.", tone: "neutral" });
  }

  // 4) Liquidez alvo acima/abaixo (não varrida)
  const above = smc.liquidity.filter((l) => l.price > price && !l.swept).sort((a, b) => a.price - b.price)[0];
  const below = smc.liquidity.filter((l) => l.price < price && !l.swept).sort((a, b) => b.price - a.price)[0];
  const confTxt = (p: number) => {
    const c = confluenceFor(p, smc.atr, sources);
    const exact = c.filter((h) => h.strength === "exact");
    if (exact.length) return ` — confluência com ${exact.map((h) => h.source.label).join(", ")} (alta confiança)`;
    if (c.length) return ` — perto de ${c.map((h) => h.source.label).join(", ")}`;
    return "";
  };
  if (above) {
    lines.push({ title: "Alvo de liquidez acima", text: `Pool de liquidez em ${above.price.toFixed(0)} (~${pct(above.price, price).toFixed(1)}%) — ímã provável${confTxt(above.price)}.`, tone: "neutral" });
  }
  if (below) {
    lines.push({ title: "Alvo de liquidez abaixo", text: `Pool de liquidez em ${below.price.toFixed(0)} (~${pct(below.price, price).toFixed(1)}%) — ímã provável${confTxt(below.price)}.`, tone: "neutral" });
  }

  // 5) Suporte/resistência por order block (acima e abaixo)
  const obAbove = smc.orderBlocks.filter((o) => o.mid > price).sort((a, b) => a.mid - b.mid)[0];
  const obBelow = smc.orderBlocks.filter((o) => o.mid <= price).sort((a, b) => b.mid - a.mid)[0];
  if (obAbove) {
    lines.push({ title: "Resistência (order block)", text: `Order block de ${biasWord(obAbove.bias)} em ${obAbove.mid.toFixed(0)} acima — possível resistência${confTxt(obAbove.mid)}.`, tone: "neutral" });
  }
  if (obBelow) {
    lines.push({ title: "Suporte (order block)", text: `Order block de ${biasWord(obBelow.bias)} em ${obBelow.mid.toFixed(0)} abaixo — possível suporte${confTxt(obBelow.mid)}.`, tone: "neutral" });
  }

  // 6) Varredura de liquidez recente (stop hunt)
  const sweep = smc.liquidity.filter((l) => l.sweptRecently).sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price))[0];
  if (sweep) {
    lines.push({
      title: "Varredura de liquidez",
      text: `Liquidez ${sweep.side === "buy" ? "de compra" : "de venda"} em ${sweep.price.toFixed(0)} foi varrida há pouco — possível stop hunt; atenção a reversão se o preço rejeitar o nível.`,
      tone: "warn",
    });
  }

  return lines;
}
