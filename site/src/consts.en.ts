// Espelho EN das constantes da landing (mesma FORMA do consts.ts em PT). As páginas
// "zipam" por índice: estrutura/booleans/ícones vêm do PT; os textos visíveis vêm
// daqui quando o idioma é EN. Mantém consts.ts (PT) intacto.

export const PRICING_EN = {
  plans: [
    {
      tagline: "Start reading the market",
      features: [
        "BTC cockpit (refreshed every 60 min)",
        "Macro & Correlations preview (DXY, Nasdaq, VIX)",
        "News, Fear & Greed, and economic calendar",
        "Full weekly newsletter",
      ],
      cta: "Create free account",
      usd: 0,
    },
    {
      tagline: "The complete cockpit",
      features: [
        "20 assets, data every 5 min",
        "Gamma, volatility, and Macro & Correlations",
        "Retail cockpit: funding, CVD, long/short, and liquidations",
        "Options levels on the chart + order-book walls",
        "In-app alerts and daily AI reports",
      ],
      cta: "Get Pro",
      usd: 19,
    },
    {
      tagline: "Institutional-grade intelligence",
      features: [
        "Everything in Pro, plus",
        "Market Read: bias, conviction, and targets in a single synthesis (exclusive)",
        "Institutional vs. retail: who's buying spot vs. who's leveraged (ETFs, options, and order-book liquidity)",
        "Advanced chart layers: CVD, funding, order-book pressure, and heatmap",
        "Smart Money & On-chain · any coin",
        "On-demand reports · 30 AI analyses/day",
      ],
      cta: "Get Expert",
      usd: 49,
    },
  ],
};

export const MARKETS_EN = [
  {
    label: "Crypto",
    note: "live",
    tagline: "The institutional crypto cockpit — 24 hours a day.",
    points: [
      "Gamma and options (BTC, ETH, SOL), SpotGamma-style",
      "Retail vs. institutional flow, funding, and liquidations",
      "Smart Money & On-chain: SMC, unlocks, and stablecoins",
      "A 24/7 market, no closing bell — read it in real time",
    ],
  },
  {
    label: "B3 · Stocks",
    note: "coming soon",
    tagline: "Brazil's stock exchange, read through the eyes of those who move the flow.",
    points: [
      "Gamma and options on single stocks and the index (PETR, VALE, IBOV)",
      "Foreign and institutional flow vs. retail",
      "Trading session, opening/closing auctions, and after-market",
      "Earnings, dividends, and ex-dividend dates on your radar",
    ],
  },
  {
    label: "Forex",
    note: "coming soon",
    tagline: "Global FX, read through the smart money.",
    points: [
      "Major pairs, with the dollar (DXY) as your compass",
      "Asia / London / New York sessions and the liquidity of each",
      "Interest rates, carry trade, and rate differentials",
      "Integrated macro calendar (Fed, Copom, payrolls)",
    ],
  },
];

// Mesma ordem/contagem do COMPARISON (PT). Booleans idênticos; só os textos mudam.
export const COMPARISON_EN = [
  {
    group: "Market Read (exclusive synthesis)",
    rows: [
      { label: "Synthesized read: bias + conviction + regime + divergences", free: false, pro: false, expert: true },
      { label: "Liquidity targets (where price is being pulled)", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "Assets and data",
    rows: [
      { label: "Assets in the cockpit", free: "BTC only", pro: "20 assets", expert: "20 assets" },
      { label: "Data refresh", free: "Every 1h", pro: "Every 5 min", expert: "Every 5 min" },
    ],
  },
  {
    group: "Chart and options",
    rows: [
      { label: "Gamma module (regime, Zero Gamma, Max Pain, Call/Put Wall)", free: false, pro: true, expert: true },
      { label: "Volatility (DVOL, IV percentile, term structure)", free: false, pro: true, expert: true },
      { label: "Volume Profile (POC) and order-book walls", free: false, pro: true, expert: true },
      { label: "Advanced layers: CVD, funding, order-book pressure, and heatmap", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "Retail flow",
    rows: [
      { label: "Funding, CVD, long/short, liquidations, and squeeze risk", free: false, pro: true, expert: true },
      { label: "Retail order-book pressure", free: false, pro: true, expert: true },
    ],
  },
  {
    group: "Institutional vs. retail",
    rows: [
      { label: "Institutional vs. retail bias (who's buying spot vs. who's leveraged)", free: false, pro: false, expert: true },
      { label: "Spot ETFs, options hedging, and institutional order-book liquidity", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "Macro and context",
    rows: [
      { label: "Macro & Correlations", free: "Preview (4 pairs)", pro: "Full", expert: "Full" },
      { label: "Global economic calendar", free: true, pro: true, expert: true },
      { label: "News and Fear & Greed", free: true, pro: true, expert: true },
    ],
  },
  {
    group: "Smart Money and On-chain",
    rows: [
      { label: "Smart Money (SMC, order blocks, liquidity) · 100 coins", free: false, pro: false, expert: true },
      { label: "On-chain: unlocks, stablecoins, and network activity", free: false, pro: false, expert: true },
    ],
  },
  {
    group: "AI and reports",
    rows: [
      { label: "AI analyses per day", free: "1", pro: "10", expert: "30" },
      { label: "Daily AI reports", free: false, pro: true, expert: "+ on demand" },
      { label: "Full weekly newsletter", free: true, pro: true, expert: true },
    ],
  },
  {
    group: "Alerts",
    rows: [
      { label: "In-app and push alerts (price, funding, gamma)", free: false, pro: true, expert: true },
      { label: "Email alerts", free: false, pro: false, expert: true },
      { label: "Alert history", free: false, pro: "30 days", expert: "Full" },
    ],
  },
];
