// Síntese de uma linha do Cockpit — orienta o usuário ANTES da parede de cards.
// Rule-based, do snapshot (sem IA): sentimento + gamma + funding + fluxo varejo/institucional.
// Bilíngue (PT/EN) via getLocale() — o Dashboard que renderiza já reage à troca (useT).

import { getLocale } from "../hooks/useLocale";
import type { SnapshotPayload } from "./types";

const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

export function cockpitSynthesis(p: SnapshotPayload | null, asset: string): string | null {
  if (!p) return null;
  const parts: string[] = [];

  const fng = p.sentiment?.fng_value;
  if (fng != null)
    parts.push(
      `${tl("sentimento", "sentiment")} ${
        fng < 25
          ? tl("de medo extremo", "extreme fear")
          : fng < 45
            ? tl("de medo", "fear")
            : fng > 75
              ? tl("de ganância extrema", "extreme greed")
              : fng > 55
                ? tl("de ganância", "greed")
                : tl("neutro", "neutral")
      } (F&G ${fng})`,
    );

  const regime = p.gamma?.regime;
  if (regime)
    parts.push(
      `${tl("gamma", "gamma")} ${
        regime === "negative"
          ? tl("negativo — dealers amplificam o movimento", "negative — dealers amplify the move")
          : tl("positivo — dealers amortecem", "positive — dealers dampen it")
      }`,
    );

  const f = p.derivatives?.funding_rate; // PERCENT (convenção Coinalyze)
  if (f != null)
    parts.push(
      `${tl("funding", "funding")} ${
        f > 0.03
          ? tl("alto (comprados pagam caro)", "high (longs paying up)")
          : f > 0
            ? tl("levemente positivo", "slightly positive")
            : f < -0.03
              ? tl("negativo (vendidos pagam)", "negative (shorts paying)")
              : tl("neutro", "neutral")
      }`,
    );

  const bcvd = p.price?.binance?.cvd;
  if (bcvd != null) {
    const retail = bcvd + (p.price?.okx?.cvd ?? 0);
    parts.push(`${tl("varejo", "retail")} ${retail >= 0 ? tl("comprador", "buying") : tl("vendedor", "selling")}`);
  }

  if (p.coinbase_premium != null)
    parts.push(
      `${tl("institucional", "institutional")} ${
        p.coinbase_premium >= 0
          ? tl("comprando (prêmio Coinbase)", "buying (Coinbase premium)")
          : tl("vendendo (desconto)", "selling (discount)")
      }`,
    );

  if (!parts.length) return null;
  return `${asset}: ${parts.join(" · ")}.`;
}
