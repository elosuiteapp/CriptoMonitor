// Constantes do site público. APP_URL aponta para o cockpit (app), no domínio próprio.
export const APP_URL = "https://app.orbeview.com";
export const SITE_URL = "https://orbeview.com";

export const SIGNUP_URL = `${APP_URL}/login`;
export const LOGIN_URL = `${APP_URL}/login`;

// Preços (BRL). Modelo FREE + PRO (decisão 06/jul, sql/110): Free = vitrine AO VIVO dos 3
// mercados; Pro = tudo liberado. Fonte da verdade é a tabela `plans` no Supabase; aqui é
// vitrine — manter em sincronia. `annual` = preço POR MÊS quando cobrado no plano anual.
export const PRICING = {
  plans: [
    {
      slug: "free",
      name: "Free",
      monthly: 0,
      annual: 0,
      tagline: "Os 3 mercados, ao vivo",
      features: [
        "Dados AO VIVO, sem delay",
        "Cripto: cockpit do BTC em tempo real + camadas (gamma, VP, CVD do varejo)",
        "Básico de cada mercado: Cripto, B3 e Forex",
        "Notícias, Fear & Greed e calendário econômico",
        "Newsletter semanal completa",
      ],
      cta: "Criar conta grátis",
      highlight: false,
    },
    {
      slug: "pro",
      name: "Pro",
      monthly: 99,
      annual: 82.5,
      tagline: "Cripto + B3 + Forex, tudo liberado",
      features: [
        "Os 3 mercados completos, sem limites",
        "20 ativos cripto + gamma, opções e fluxo completo",
        "Smart Money & On-chain (SMC) nos 3 mercados",
        "Leitura do Mercado: viés, convicção e alvos",
        "30 análises de IA por dia + relatórios e alertas",
      ],
      cta: "Assinar o Pro",
      highlight: true,
    },
  ],
};

// Mercados do switcher da home. `live` = já está no ar. Os TRÊS no ar (Cripto, B3, Forex).
// `accent` = token de cor do mercado (indigo/verde/âmbar) — as classes literais ficam
// no Home.astro (mapa ACCENT) p/ o Tailwind detectar. `features` = as ferramentas que
// cada mercado entrega (a seção "As ferramentas..." troca junto com o switcher).
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
      "Smart Money & On-chain: SMC, order blocks, FVG e unlocks",
      "Mercado 24/7, sem pregão — leitura em tempo real",
    ],
    features: [
      { icon: "🧭", title: "Leitura do Mercado", desc: "Tendência, fluxo e liquidez viram um só veredito — comprar, vender ou esperar — com convicção, divergências e alvos." },
      { icon: "📊", title: "Gamma e opções", desc: "Regime de gamma, Zero Gamma, Max Pain e as paredes de call e put — os níveis que as opções defendem, estilo SpotGamma." },
      { icon: "🌊", title: "Fluxo e alavancagem", desc: "Funding, CVD, long/short e liquidações: onde o dinheiro alavancado se acumula e quando vira combustível de squeeze." },
      { icon: "🏦", title: "Institucional × varejo", desc: "Quem compra à vista — spot, ETFs e hedge de opções — contra o varejo alavancado. Cruzar os dois lados é a leitura mais forte." },
      { icon: "🧠", title: "Smart Money & On-chain", desc: "Estrutura SMC, order blocks, liquidez, unlocks e atividade da rede — em qualquer moeda." },
      { icon: "🌐", title: "Macro & Correlações", desc: "Correlação com DXY, Nasdaq, ouro e VIX, liquidez em stablecoins e o calendário econômico global." },
    ],
  },
  {
    id: "b3",
    icon: "🇧🇷",
    label: "B3 · Ações",
    note: "no ar",
    live: true,
    tagline: "A bolsa brasileira com a leitura de quem move o fluxo.",
    points: [
      "Cockpit de ações e índice (IBOV, PETR, VALE e cia)",
      "Smart Money: estrutura, zonas e liquidez (SMC)",
      "Fluxo por investidor: estrangeiro × institucional × pessoa física",
      "Proventos, dividendos e calendário no radar",
    ],
    features: [
      { icon: "🧭", title: "Leitura do Mercado", desc: "Tendência, estrutura e o macro brasileiro num só viés por ação ou índice — o que muda a leitura e onde estão os gatilhos, em reais." },
      { icon: "🌡️", title: "Medo & Ganância Brasil", desc: "Um termômetro próprio do humor da bolsa: amplitude do mercado, momento do IBOV, volatilidade e câmbio porto-seguro num número de 0 a 100." },
      { icon: "👥", title: "Fluxo por investidor", desc: "Quem está comprando: estrangeiro, institucional ou pessoa física. O placar que revela a mão que sustenta — ou derruba — o pregão." },
      { icon: "🧠", title: "Smart Money (SMC)", desc: "Estrutura, zonas de compra e venda, order blocks e liquidez — a mesma engenharia de mão forte, aplicada a ações e FIIs." },
      { icon: "🏢", title: "FIIs a fundo", desc: "Dividend yield vs CDI, P/VP e deságio, segmento e sustentabilidade do rendimento — o raio-x de cada fundo imobiliário." },
      { icon: "🌐", title: "Macro BR & Commodities", desc: "CDI, IBC-Br e desemprego, mais Brent, ouro e cobre que movem PETR, VALE e as siderúrgicas — e a maré global do Fed." },
    ],
  },
  {
    id: "forex",
    icon: "💱",
    label: "Forex",
    note: "no ar",
    live: true,
    tagline: "Câmbio global lido pelas mãos fortes.",
    points: [
      "Pares principais + força de moedas e o dólar (DXY)",
      "Smart Money e leitura top-down por timeframe",
      "COT/CFTC: posicionamento institucional e carry",
      "Sessões (Ásia/Londres/NY) e calendário macro (Fed, Copom, payroll)",
    ],
    features: [
      { icon: "🧭", title: "Leitura do Mercado", desc: "Tendência, estrutura e a força do dólar num só viés por par — com cabo de guerra das forças, cenários e divergências." },
      { icon: "💪", title: "Força das moedas & DXY", desc: "Quem está forte e quem está fraco (24h e 5 dias) e o dólar (DXY) que comanda o câmbio — pra operar o par certo, no lado certo." },
      { icon: "🏦", title: "Posicionamento COT", desc: "O smart money do câmbio (CFTC): institucional × hedge funds × varejo. Quando institucional e varejo divergem, o varejo costuma errar." },
      { icon: "💰", title: "Carry & juros", desc: "O motor de longo prazo do FX: o diferencial de juros entre as moedas — quem paga mais atrai capital e sustenta a tendência." },
      { icon: "🌗", title: "Risk-on/off & sessões", desc: "O humor global (AUD e NZD × JPY e CHF) e as sessões Ásia, Londres e NY que ligam e desligam a liquidez do câmbio." },
      { icon: "🗓️", title: "Calendário macro", desc: "Fed, Copom, payroll e cia. organizados por moeda — os eventos que sacodem os pares, antes de eles te sacudirem." },
    ],
  },
];

// Matriz de comparação (Free × Pro) para a página /precos.
// Em cada célula: true = ✓ incluído, false = — não incluído, string = detalhe/limite.
export const COMPARISON = [
  {
    group: "Mercados",
    rows: [
      { label: "Mercados incluídos", free: "Básico dos 3, ao vivo", pro: "Cripto + B3 + Forex completos" },
      { label: "Cockpit completo, sem travas", free: "BTC (vitrine)", pro: true },
      { label: "Atualização dos dados", free: "Tempo real, sem delay", pro: "Tempo real, sem delay" },
    ],
  },
  {
    group: "O que o Pro libera",
    rows: [
      { label: "Gamma, opções e níveis institucionais", free: "Só no BTC", pro: true },
      { label: "Fluxo: funding, CVD, long/short e liquidações", free: false, pro: true },
      { label: "Smart Money: estrutura, order blocks, liquidez e FVG", free: false, pro: true },
      { label: "Institucional × varejo (mãos fortes vs alavancado)", free: false, pro: true },
      { label: "Leitura do Mercado: viés, convicção e alvos", free: false, pro: true },
      { label: "Camadas avançadas no gráfico (CVD, book, heatmap)", free: "Só no BTC", pro: true },
    ],
  },
  {
    group: "Macro, IA e alertas",
    rows: [
      { label: "Macro & Correlações", free: "Prévia", pro: "Completo" },
      { label: "Calendário econômico e notícias", free: true, pro: true },
      { label: "Relatórios e análises por IA", free: "1 por dia", pro: "30 por dia" },
      { label: "Alertas in-app, push e e-mail", free: false, pro: true },
      { label: "Newsletter semanal completa", free: true, pro: true },
    ],
  },
];
