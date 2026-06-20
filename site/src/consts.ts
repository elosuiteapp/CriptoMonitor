// Constantes do site público. APP_URL aponta para o cockpit (app), no domínio próprio.
export const APP_URL = "https://app.orbeview.com";
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
        "Newsletter semanal completa",
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
        "Gamma, volatilidade e Macro & Correlações",
        "Cockpit de varejo: funding, CVD, long/short e liquidações",
        "Níveis de opções no gráfico + paredes do book",
        "Alertas in-app e relatórios diários por IA",
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
        "Camada institucional: viés Coinbase, ETFs e hedge de opções",
        "Camadas avançadas no gráfico: CVD, funding, pressão do book e heatmap",
        "Smart Money & On-chain · qualquer moeda",
        "Relatórios sob demanda · 30 análises de IA/dia",
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
