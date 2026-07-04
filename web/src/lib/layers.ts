import type { ActiveLayers } from "../components/Chart";
import type { Plan } from "./types";

export type LayerKey = keyof ActiveLayers;

export const LAYER_KEYS: LayerKey[] = [
  "gex",
  "zeroGamma",
  "maxPain",
  "volumeProfile",
  "orderbookWalls",
  "funding",
  "cvd",
  "bookPressure",
  "liquidations",
  "bookHeatmap",
];

// Camadas "de fluxo" — exclusivas do Expert quando o acesso vem por advanced_metrics.
// (O Free ganha cvd/bookPressure pela vitrine, mas só do VAREJO — ver gating no RLS.)
// bookHeatmap fica no degrau Pro (como as paredes do book): liquidez parada estrutural.
const EXPERT_TIER: LayerKey[] = ["funding", "cvd", "bookPressure", "liquidations"];

/**
 * Quais camadas do gráfico o plano pode LIGAR (fonte única de verdade do gating
 * de camadas no front):
 *  - Expert: todas;
 *  - Pro (advanced, não-expert): tudo menos as camadas de fluxo do Expert;
 *  - Free/preview: exatamente as listadas em `plan.preview_layers` (parametrizado
 *    no banco, sql/053).
 */
export function layerAccess(plan: Plan | null): Record<LayerKey, boolean> {
  const advanced = plan?.advanced_metrics ?? false;
  // "Expert" por CAPACIDADE (smart_money), não pelo slug legado: os planos vendidos desde a
  // sql/078 (mod_crypto/complete) têm smart_money=true mas slug ≠ "expert" — o gate por slug
  // trancava as camadas de fluxo pra quem pagou o módulo completo (família do bug da auditoria 02/jul).
  const isExpert = (plan?.smart_money ?? false) || plan?.slug === "expert";
  const preview = new Set(plan?.preview_layers ?? []);

  const out = {} as Record<LayerKey, boolean>;
  for (const k of LAYER_KEYS) {
    out[k] = isExpert
      ? true
      : advanced
        ? !EXPERT_TIER.includes(k)
        : preview.has(k);
  }
  return out;
}
