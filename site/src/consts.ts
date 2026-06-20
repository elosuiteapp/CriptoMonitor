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
        "Prévia de Macro & Correlações (DXY, Nasdaq, VIX)",
        "Notícias, Fear & Greed e calendário econômico",
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
        "Institucional × varejo: quem compra à vista vs quem alavanca (ETFs, opções e liquidez do book)",
        "Camadas avançadas no gráfico: CVD, funding, pressão do book e heatmap",
        "Smart Money & On-chain · qualquer moeda",
        "Relatórios sob demanda · 30 análises de IA/dia",
      ],
      cta: "Assinar Expert",
      highlight: false,
    },
  ],
};

// Mercados do switcher da home. `live` define se já está no ar (Crypto) ou "em breve"
// (B3/Forex). Cada um traz suas peculiaridades — o painel troca ao clicar na aba.
export const MARKETS = [
  {
    id: "crypto",
    icon: "₿",
    label: "Crypto",
    note: "no ar",
    live: true,
    tagline: "O cockpit institucional de cripto — 24 horas por dia.",
    points: [
      "Gamma e opções (BTC, ETH, SOL) no estilo SpotGamma",
      "Fluxo de varejo × institucional, funding e liquidações",
      "Smart Money & On-chain: SMC, unlocks e stablecoins",
      "Mercado 24/7, sem pregão — leitura em tempo real",
    ],
  },
  {
    id: "b3",
    icon: "🇧🇷",
    label: "B3 · Ações",
    note: "em breve",
    live: false,
    tagline: "A bolsa brasileira com a leitura de quem move o fluxo.",
    points: [
      "Gamma e opções de ações e índice (PETR, VALE, IBOV)",
      "Fluxo de estrangeiro e institucional × pessoa física",
      "Pregão, leilão de abertura/fechamento e after-market",
      "Proventos, dividendos e datas-com no radar",
    ],
  },
  {
    id: "forex",
    icon: "💱",
    label: "Forex",
    note: "em breve",
    live: false,
    tagline: "Câmbio global lido pelas mãos fortes.",
    points: [
      "Pares principais e o dólar (DXY) como bússola",
      "Sessões Ásia / Londres / Nova York e a liquidez de cada uma",
      "Juros, carry trade e diferencial de taxas",
      "Calendário macro (Fed, Copom, payroll) integrado",
    ],
  },
];

// Matriz de comparação detalhada (Free × Pro × Expert) para a página /precos.
// Em cada célula: true = ✓ incluído, false = — não incluído, string = detalhe/limite.
export const COMPARISON = [
  {
    group: "Ativos e dados",
    rows: [
      { label: "Ativos no cockpit", free: "Só BTC", pro: "20 ativos", expert: "20 ativos" },
      { label: "Atualização dos dados", free: "A cada 1h", pro: "A cada 5 min", expert: "A cada 5 min" },
    ],
  },
  {
    group: "Gráfico e opções",
    rows: [
      { label: "Módulo Gamma (regime, Zero Gamma, Max Pain, Call/Put Wall)", free: false, pro: true, expert: true },
      { label: "Volatilidade (DVOL, IV percentile, term structure)", free: false, pro: true, expert: true },
      { label: "Volume Profile (POC) e paredes do book", free: false, pro: true, expert: true },
      { label: "Camadas avançadas: CVD, funding, pressão do book e heatmap", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "Fluxo do varejo",
    rows: [
      { label: "Funding, CVD, long/short, liquidações e risco de squeeze", free: false, pro: true, expert: true },
      { label: "Pressão do book do varejo", free: false, pro: true, expert: true },
    ],
  },
  {
    group: "Institucional × varejo",
    rows: [
      { label: "Viés institucional × varejo (quem compra à vista vs quem alavanca)", free: false, pro: false, expert: true },
      { label: "ETFs spot, hedge de opções e liquidez do book institucional", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "Macro e contexto",
    rows: [
      { label: "Macro & Correlações", free: "Prévia (4 pares)", pro: "Completo", expert: "Completo" },
      { label: "Calendário econômico global", free: true, pro: true, expert: true },
      { label: "Notícias e Fear & Greed", free: true, pro: true, expert: true },
    ],
  },
  {
    group: "Smart Money e On-chain",
    rows: [
      { label: "Smart Money (SMC, order blocks, liquidez) · 100 moedas", free: false, pro: false, expert: true },
      { label: "On-chain: unlocks, stablecoins e atividade de rede", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "IA e relatórios",
    rows: [
      { label: "Análises de IA por dia", free: "1", pro: "10", expert: "30" },
      { label: "Relatórios diários por IA", free: false, pro: true, expert: "+ sob demanda" },
      { label: "Newsletter semanal completa", free: true, pro: true, expert: true },
    ],
  },
  {
    group: "Alertas",
    rows: [
      { label: "Alertas in-app e push (preço, funding, gamma)", free: false, pro: true, expert: true },
      { label: "Alerta por e-mail", free: false, pro: false, expert: true },
      { label: "Histórico de alertas", free: false, pro: "30 dias", expert: "Completo" },
    ],
  },
];
