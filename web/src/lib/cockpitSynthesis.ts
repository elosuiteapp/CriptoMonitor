// Síntese de uma linha do Cockpit — orienta o usuário ANTES da parede de cards.
// Rule-based, do snapshot (sem IA): sentimento + gamma + funding + fluxo varejo/institucional.

import type { SnapshotPayload } from "./types";

export function cockpitSynthesis(p: SnapshotPayload | null, asset: string): string | null {
  if (!p) return null;
  const parts: string[] = [];

  const fng = p.sentiment?.fng_value;
  if (fng != null)
    parts.push(
      `sentimento ${fng < 25 ? "de medo extremo" : fng < 45 ? "de medo" : fng > 75 ? "de ganância extrema" : fng > 55 ? "de ganância" : "neutro"} (F&G ${fng})`,
    );

  const regime = p.gamma?.regime;
  if (regime) parts.push(`gamma ${regime === "negative" ? "negativo — dealers amplificam o movimento" : "positivo — dealers amortecem"}`);

  const f = p.derivatives?.funding_rate; // PERCENT (convenção Coinalyze)
  if (f != null)
    parts.push(`funding ${f > 0.03 ? "alto (comprados pagam caro)" : f > 0 ? "levemente positivo" : f < -0.03 ? "negativo (vendidos pagam)" : "neutro"}`);

  const bcvd = p.price?.binance?.cvd;
  if (bcvd != null) {
    const retail = bcvd + (p.price?.okx?.cvd ?? 0);
    parts.push(`varejo ${retail >= 0 ? "comprador" : "vendedor"}`);
  }

  if (p.coinbase_premium != null)
    parts.push(`institucional ${p.coinbase_premium >= 0 ? "comprando (prêmio Coinbase)" : "vendendo (desconto)"}`);

  if (!parts.length) return null;
  return `${asset}: ${parts.join(" · ")}.`;
}
