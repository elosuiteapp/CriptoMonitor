// Espelho EN das constantes da landing (mesma FORMA do consts.ts em PT). As páginas
// "zipam" por índice: estrutura/booleans/ícones vêm do PT; os textos visíveis vêm
// daqui quando o idioma é EN. Mantém consts.ts (PT) intacto.
// `usdAnnual` = preço POR MÊS (USD) quando cobrado no plano anual.

export const PRICING_EN = {
  plans: [
    {
      tagline: "Get to know the 3 markets",
      features: [
        "Live showcase of all 3 modules: Crypto, B3, and Forex",
        "Crypto: BTC cockpit + layers (gamma, VP, retail CVD)",
        "News, Fear & Greed, and economic calendar",
        "Full weekly newsletter",
      ],
      cta: "Create free account",
      usd: 0,
      usdAnnual: 0,
    },
    {
      tagline: "One market, complete and unlocked",
      features: [
        "Pick 1 module: Crypto, B3, or Forex",
        "Full market cockpit, data every 5 min",
        "Gamma/options, flow, Smart Money, and macro",
        "Market Read: bias, conviction, and targets",
        "AI + alerts (in-app, push, and email)",
      ],
      cta: "Get 1 module",
      usd: 19,
      usdAnnual: 15,
    },
    {
      tagline: "Crypto + B3 + Forex, all unlocked",
      features: [
        "All 3 modules, no limits",
        "3 markets for the price of 2",
        "The full depth in every market",
        "AI + alerts across all modules",
        "Priority on upcoming modules",
      ],
      cta: "Get Complete",
      usd: 39,
      usdAnnual: 31,
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
      "Smart Money & On-chain: SMC, order blocks, FVG, and unlocks",
      "A 24/7 market, no closing bell — read it in real time",
    ],
  },
  {
    label: "B3 · Stocks",
    note: "live",
    tagline: "Brazil's stock exchange, read through the eyes of those who move the flow.",
    points: [
      "Cockpit for single stocks and the index (IBOV, PETR, VALE, etc.)",
      "Smart Money: structure, zones, and liquidity (SMC)",
      "Flow by investor type: foreign vs. institutional vs. retail",
      "Earnings, dividends, and calendar on your radar",
    ],
  },
  {
    label: "Forex",
    note: "live",
    tagline: "Global FX, read through the smart money.",
    points: [
      "Major pairs + currency strength and the dollar (DXY)",
      "Smart Money and top-down read across timeframes",
      "COT/CFTC: institutional positioning and carry",
      "Sessions (Asia/London/NY) and macro calendar (Fed, Copom, payrolls)",
    ],
  },
];

// Mesma ordem/contagem do COMPARISON (PT). Booleans idênticos; só os textos mudam.
export const COMPARISON_EN = [
  {
    group: "Markets",
    rows: [
      { label: "Markets included", free: "Showcase of all 3", module: "1 of your choice", complete: "Crypto + B3 + Forex" },
      { label: "Full cockpit, no gates", free: false, module: true, complete: true },
      { label: "Data refresh", free: "Every 1h", module: "Real time (5 min)", complete: "Real time (5 min)" },
    ],
  },
  {
    group: "What comes in every module",
    rows: [
      { label: "Gamma, options, and institutional levels", free: false, module: true, complete: true },
      { label: "Flow: funding, CVD, long/short, and liquidations", free: false, module: true, complete: true },
      { label: "Smart Money: structure, order blocks, liquidity, and FVG", free: false, module: true, complete: true },
      { label: "Institutional vs. retail (smart money vs. leveraged)", free: false, module: true, complete: true },
      { label: "Market Read: bias, conviction, and targets", free: false, module: true, complete: true },
      { label: "Advanced chart layers (CVD, order book, heatmap)", free: false, module: true, complete: true },
    ],
  },
  {
    group: "Macro, AI, and alerts",
    rows: [
      { label: "Macro & Correlations", free: "Preview", module: "Full", complete: "Full" },
      { label: "Economic calendar and news", free: true, module: true, complete: true },
      { label: "AI reports and analyses", free: "Limited", module: "Full", complete: "Full" },
      { label: "In-app, push, and email alerts", free: false, module: true, complete: true },
      { label: "Full weekly newsletter", free: true, module: true, complete: true },
    ],
  },
];
