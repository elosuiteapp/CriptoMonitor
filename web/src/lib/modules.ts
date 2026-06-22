// ─── Módulos de mercado ──────────────────────────────────────────────────────
// O produto começa em "Crypto"; "Forex" é o próximo mercado. O switcher no topo
// já fica configurado e funcional — Forex aparece para todos como "Em breve" e,
// por enquanto, só o admin consegue alternar. Quando o módulo Forex entrar, o
// acesso passará a exigir assinatura do plano Forex (ver gating em ModuleSwitcher).

export type ModuleId = "crypto" | "b3" | "forex";

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
