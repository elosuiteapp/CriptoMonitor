// Constantes do site público. APP_URL aponta para o cockpit (app), no domínio próprio.
export const APP_URL = "https://app.orbeview.com";
export const SITE_URL = "https://orbeview.com";

export const SIGNUP_URL = `${APP_URL}/login`;
export const LOGIN_URL = `${APP_URL}/login`;

// Preços de lançamento (BRL). Modelo POR MÓDULO: um mercado completo, ou os três no Completo.
// Fonte da verdade é a tabela `plans` no Supabase; aqui é vitrine — manter em sincronia.
// `annual` = preço POR MÊS quando cobrado no plano anual (mais barato que o mensal).
export const PRICING = {
  plans: [
    {
      slug: "free",
      name: "Free",
      monthly: 0,
      annual: 0,
      tagline: "Conheça os 3 mercados",
      features: [
        "Vitrine ao vivo dos 3 módulos: Cripto, B3 e Forex",
        "Cripto: cockpit do BTC + camadas (gamma, VP, CVD do varejo)",
        "Notícias, Fear & Greed e calendário econômico",
        "Newsletter semanal completa",
      ],
      cta: "Criar conta grátis",
      highlight: false,
    },
    {
      slug: "module",
      name: "1 Módulo",
      monthly: 79,
      annual: 59,
      tagline: "Um mercado, completo e sem travas",
      features: [
        "Escolha 1 módulo: Cripto, B3 ou Forex",
        "Cockpit completo do mercado, dados a cada 5 min",
        "Gamma/opções, fluxo, Smart Money e macro",
        "Leitura do Mercado: viés, convicção e alvos",
        "IA + alertas (in-app, push e e-mail)",
      ],
      cta: "Assinar 1 módulo",
      highlight: false,
    },
    {
      slug: "complete",
      name: "OrbeView Completo",
      monthly: 159,
      annual: 129,
      tagline: "Cripto + B3 + Forex, tudo liberado",
      features: [
        "Os 3 módulos completos, sem limites",
        "3 mercados pelo preço de 2",
        "Toda a profundidade em cada mercado",
        "IA + alertas em todos os módulos",
        "Prioridade nos próximos módulos",
      ],
      cta: "Assinar Completo",
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

// Matriz de comparação (Free × 1 Módulo × Completo) para a página /precos.
// Em cada célula: true = ✓ incluído, false = — não incluído, string = detalhe/limite.
// module e complete têm a MESMA profundidade; o que muda é quantos mercados.
export const COMPARISON = [
  {
    group: "Mercados",
    rows: [
      { label: "Mercados incluídos", free: "Vitrine dos 3", module: "1 à escolha", complete: "Cripto + B3 + Forex" },
      { label: "Cockpit completo, sem travas", free: false, module: true, complete: true },
      { label: "Atualização dos dados", free: "A cada 1h", module: "Tempo real (5 min)", complete: "Tempo real (5 min)" },
    ],
  },
  {
    group: "O que vem em cada módulo",
    rows: [
      { label: "Gamma, opções e níveis institucionais", free: false, module: true, complete: true },
      { label: "Fluxo: funding, CVD, long/short e liquidações", free: false, module: true, complete: true },
      { label: "Smart Money: estrutura, order blocks, liquidez e FVG", free: false, module: true, complete: true },
      { label: "Institucional × varejo (mãos fortes vs alavancado)", free: false, module: true, complete: true },
      { label: "Leitura do Mercado: viés, convicção e alvos", free: false, module: true, complete: true },
      { label: "Camadas avançadas no gráfico (CVD, book, heatmap)", free: false, module: true, complete: true },
    ],
  },
  {
    group: "Macro, IA e alertas",
    rows: [
      { label: "Macro & Correlações", free: "Prévia", module: "Completo", complete: "Completo" },
      { label: "Calendário econômico e notícias", free: true, module: true, complete: true },
      { label: "Relatórios e análises por IA", free: "Limitado", module: "Completo", complete: "Completo" },
      { label: "Alertas in-app, push e e-mail", free: false, module: true, complete: true },
      { label: "Newsletter semanal completa", free: true, module: true, complete: true },
    ],
  },
];
