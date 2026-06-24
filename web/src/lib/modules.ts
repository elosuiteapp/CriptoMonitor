// ─── Módulos de mercado ──────────────────────────────────────────────────────
// O produto começa em "Crypto"; "Forex" é o próximo mercado. O switcher no topo
// já fica configurado e funcional — Forex aparece para todos como "Em breve" e,
// por enquanto, só o admin consegue alternar. Quando o módulo Forex entrar, o
// acesso passará a exigir assinatura do plano Forex (ver gating em ModuleSwitcher).

import { getLocale } from "../hooks/useLocale";

export type ModuleId = "crypto" | "b3" | "forex";

const tl = (pt: string, en: string): string => (getLocale() === "en" ? en : pt);

/** Rótulo do módulo no idioma atual (quem renderiza reage via useT). */
export function moduleLabel(id: ModuleId): string {
  return id === "b3" ? tl("B3 · Ações & FIIs", "B3 · Stocks & REITs") : id === "forex" ? "Forex" : "Crypto";
}

/** Descrição curta do módulo no idioma atual. */
export function moduleDescription(id: ModuleId): string {
  switch (id) {
    case "b3":
      return tl("Ações e FIIs da B3 — fundamentos, dividendos, indicadores e fluxo", "B3 stocks and REITs — fundamentals, dividends, indicators, and flow");
    case "forex":
      return tl("Pares de moedas e câmbio", "Currency pairs and FX");
    default:
      return tl("Bitcoin, altcoins, derivativos e on-chain", "Bitcoin, altcoins, derivatives, and on-chain");
  }
}

export interface MarketModule {
  id: ModuleId;
  label: string;
  icon: string;
  description: string;
  available: boolean; // já implementado e liberado em produção
}

export const MODULES: MarketModule[] = [
  {
    id: "crypto",
    label: "Crypto",
    icon: "₿",
    description: "Bitcoin, altcoins, derivativos e on-chain",
    available: true,
  },
  {
    id: "b3",
    label: "B3 · Ações & FIIs",
    icon: "🇧🇷",
    description: "Ações e FIIs da B3 — fundamentos, dividendos, indicadores e fluxo",
    available: false,
  },
  {
    id: "forex",
    label: "Forex",
    icon: "💱",
    description: "Pares de moedas e câmbio",
    available: false,
  },
];

export const DEFAULT_MODULE: ModuleId = "crypto";
