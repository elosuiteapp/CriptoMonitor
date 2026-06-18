// Constantes do site público. APP_URL aponta para o cockpit (app).
// TODO(domínio): trocar APP_URL para https://app.orbeview.com quando o DNS estiver pronto.
export const APP_URL = "https://cripto-monitor-rosy.vercel.app";
export const SITE_URL = "https://orbeview.com";

export const SIGNUP_URL = `${APP_URL}/login`;
export const LOGIN_URL = `${APP_URL}/login`;

// Preços de lançamento (BRL). Fonte da verdade é a tabela `plans` no Supabase;
// aqui é vitrine — manter em sincronia ao alterar preços no /admin.
export const PRICING = {
  annualDiscount: 0.3, // 30% OFF de lançamento (casar com Pricing do app + asaas-checkout)
  plans: [
    {
      slug: "free",
      name: "Free",
      monthly: 0,
      tagline: "Comece a ler o mercado",
      features: [
        "Cockpit do BTC (atualização a cada 60 min)",
        "Gráfico com níveis de gamma",
        "Notícias e Fear & Greed",
        "Newsletter semanal (parcial)",
      ],
      cta: "Criar conta grátis",
      highlight: false,
    },
    {
      slug: "pro",
      name: "Pro",
      monthly: 59,
      tagline: "O cockpit completo",
      features: [
        "20 ativos, dados a cada 5 min",
        "Módulo Gamma, volatilidade e camadas no gráfico",
        "Heatmap de liquidação + paredes do book",
        "Alertas e relatórios diários por IA",
        "Newsletter completa",
      ],
      cta: "Assinar Pro",
      highlight: true,
    },
    {
      slug: "expert",
      name: "Expert",
      monthly: 149,
      tagline: "Inteligência institucional",
      features: [
        "Tudo do Pro +",
        "Smart Money & On-chain (SMC, fluxo, squeeze)",
        "Análise de qualquer moeda",
        "Arquivo histórico completo da newsletter",
      ],
      cta: "Assinar Expert",
      highlight: false,
    },
  ],
};

export const MARKETS = [
  { icon: "₿", label: "Crypto", note: "no ar" },
  { icon: "🇧🇷", label: "B3 · Ações", note: "em breve" },
  { icon: "💱", label: "Forex", note: "em breve" },
];
