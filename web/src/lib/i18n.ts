import { useLocale, type Locale } from "../hooks/useLocale";

/**
 * Dicionário central de strings do app (PT/EN). A interface `Dict` garante, em
 * tempo de compilação, que toda chave exista nos dois idiomas (paridade).
 *
 * Uso: `const { t } = useT();` → `t.tabs.cockpit`. A migração é incremental —
 * componentes ainda em PT puro vão sendo movidos pra cá aos poucos (ver memory
 * [[i18n-plan]]). Sem libs externas (react-i18next etc.) pra não pesar o bundle.
 */
export interface Dict {
  common: { loading: string; soon: string; manage: string };
  header: { newsletter: string; alerts: string; admin: string; loadingPlan: string };
  tabs: { cockpit: string; smart: string; indicators: string; macro: string; reports: string };
  modules: { menuTitle: string; soon: string; moreSoon: string; forexLocked: string; tooltip: string };
  account: { plan: string; editProfile: string; signOut: string; incomplete: string; incompleteShort: string };
  asset: { gammaTip: string; lockedTip: string };
  login: {
    backHome: string;
    welcomeTitle: string;
    welcomeSub: string;
    highlights: [string, string, string, string];
    copyright: string;
    signinTitle: string;
    signupTitle: string;
    signinSub: string;
    signupSub: string;
    fullName: string;
    namePlaceholder: string;
    email: string;
    password: string;
    signinBtn: string;
    signupBtn: string;
    orContinue: string;
    google: string;
    noAccount: string;
    haveAccount: string;
    createFree: string;
    signin: string;
    seePlans: string;
    accountCreated: string;
    authFail: string;
  };
  locked: { availableOn: string; unlock: string }; // {plan} interpolado
  priceHeader: {
    instTier: string;
    flowTier: string;
    instTip: string;
    flowTip: string;
    updated: string;
    waiting: string;
  };
  cockpit: {
    gammaModule: string;
    gammaLocked: string;
    hiroLocked: string;
    volTitle: string;
    volLocked: string;
    flowSection: string;
    retailGroup: string;
    instGroup: string;
    fundingCex: string;
    fundingOnchain: string;
    cvdRetail: string;
    longShort: string;
    liquidations: string;
    squeezeRisk: string;
    instBias: string;
    instBiasSource: string;
    defiHealth: string;
    dexLiquidity: string;
    dexLiquiditySuffix: string; // "… de liquidez"
    vol24h: string;
    marketMacro: string;
    btcDominance: string;
    totalMcap: string;
    etfSpot: string;
    optionsHedge: string;
    bookRetail: string;
    bookInst: string;
    lockedFundingGex: string;
    lockedCvd: string;
    lockedLongShort: string;
    lockedLiq: string;
    lockedInstBias: string;
    lockedBookInst: string;
    lockedEtf: string;
    lockedMacro: string;
    lockedHedge: string;
  };
  subchart: {
    cvdRetail: string; // título do Volume Delta (varejo)
    cvdInst: string; // título do CVD institucional (Expert)
    cvdInstLocked: string; // título do teaser institucional (Free)
    cvdInstHint: string;
    bookAll: string;
    bookRetail: string;
    bookInstLocked: string;
    bookInstHint: string;
  };
}

const PT: Dict = {
  common: { loading: "Carregando…", soon: "Em breve", manage: "gerenciar" },
  header: { newsletter: "Newsletter", alerts: "Alertas", admin: "Admin", loadingPlan: "Carregando plano…" },
  tabs: {
    cockpit: "Cockpit Principal",
    smart: "Smart Money & On-chain",
    indicators: "Leitura do Mercado",
    macro: "Macro & Correlações",
    reports: "Relatórios",
  },
  modules: {
    menuTitle: "Módulo de mercado",
    soon: "Em breve",
    moreSoon: "Novos módulos serão liberados conforme seu plano.",
    forexLocked: "Disponível com o plano Forex (em breve)",
    tooltip: "Módulo de mercado",
  },
  account: {
    plan: "Plano",
    editProfile: "Editar perfil",
    signOut: "Sair",
    incomplete: "Cadastro incompleto — adicione seu telefone/WhatsApp.",
    incompleteShort: "Cadastro incompleto",
  },
  asset: {
    gammaTip: "Camada institucional completa (gamma, opções, DVOL, CVD Coinbase)",
    lockedTip: "Disponível em planos superiores",
  },
  login: {
    backHome: "← Página inicial",
    welcomeTitle: "Bem-vindo de volta",
    welcomeSub: "Acesse seu cockpit e continue lendo o mercado com a visão de quem o move.",
    highlights: [
      "Gamma, smart money e fluxo de capital em tempo real",
      "Heatmap de liquidação e paredes do book",
      "Alertas e relatórios diários por IA",
      "Cripto agora; ações (B3) e câmbio chegando",
    ],
    copyright: "© 2026 OrbeView · informativo e educacional, não é recomendação.",
    signinTitle: "Acesse seu cockpit",
    signupTitle: "Crie sua conta",
    signinSub: "Entre com suas credenciais para continuar.",
    signupSub: "Comece grátis — sem cartão.",
    fullName: "Nome completo",
    namePlaceholder: "Seu nome",
    email: "E-mail",
    password: "Senha",
    signinBtn: "Entrar no cockpit",
    signupBtn: "Criar conta grátis",
    orContinue: "ou continue com",
    google: "Entrar com Google",
    noAccount: "Não tem conta?",
    haveAccount: "Já tem conta?",
    createFree: "Criar conta grátis",
    signin: "Entrar",
    seePlans: "Ver planos",
    accountCreated: "Conta criada! Confirme o e-mail (se exigido) e faça login.",
    authFail: "Falha na autenticação",
  },
  locked: { availableOn: "Disponível no plano {plan}.", unlock: "Desbloquear no {plan} →" },
  priceHeader: {
    instTier: "Institucional + Gamma",
    flowTier: "Derivativos & fluxo",
    instTip: "Camada institucional completa: gamma, opções, volatilidade (DVOL) e CVD/prêmio Coinbase — além de derivativos e fluxo.",
    flowTip: "Cockpit de derivativos & fluxo: funding (CEX + on-chain), OI, long/short, liquidações e paredes do book. Sem gamma/opções (não há bolsa de opções líquida para esta moeda).",
    updated: "Atualizado",
    waiting: "Aguardando primeiro ciclo de coleta",
  },
  cockpit: {
    gammaModule: "Módulo Gamma (estilo SpotGamma)",
    gammaLocked: "Módulo Gamma — regime, Zero Gamma e Max Pain",
    hiroLocked: "Fluxo de opções (HIRO) — delta-fluxo do hedge",
    volTitle: "Volatilidade (DVOL, IV, term structure)",
    volLocked: "Volatilidade — DVOL, IV Percentile e term structure",
    flowSection: "Fluxo, liquidez e sentimento",
    retailGroup: "Varejo e alavancagem",
    instGroup: "Institucional e estrutural",
    fundingCex: "Funding (CEX agregado)",
    fundingOnchain: "Funding onchain",
    cvdRetail: "CVD do varejo",
    longShort: "Long / Short",
    liquidations: "Liquidações",
    squeezeRisk: "Risco de squeeze",
    instBias: "Viés Institucional × Varejo",
    instBiasSource: "Prêmio + Participação + CVD (Coinbase × Binance+OKX)",
    defiHealth: "Saúde DeFi (TVL)",
    dexLiquidity: "Liquidez DEX",
    dexLiquiditySuffix: "de liquidez",
    vol24h: "Volume 24h",
    marketMacro: "Macro do mercado",
    btcDominance: "Dominância BTC",
    totalMcap: "Market cap total",
    etfSpot: "ETFs spot",
    optionsHedge: "Hedge institucional (opções)",
    bookRetail: "Pressão do book · varejo",
    bookInst: "Pressão do book · institucional",
    lockedFundingGex: "Funding & GEX",
    lockedCvd: "CVD do varejo",
    lockedLongShort: "Long / Short ratio",
    lockedLiq: "Liquidações — alvos de liquidez",
    lockedInstBias: "Viés Institucional × Varejo",
    lockedBookInst: "Pressão do book · institucional",
    lockedEtf: "ETFs spot · fluxo institucional",
    lockedMacro: "Macro do mercado · dominância e mcap",
    lockedHedge: "Hedge institucional (opções)",
  },
  subchart: {
    cvdRetail: "Volume Delta · CVD do varejo",
    cvdInst: "CVD institucional (Coinbase) — varejo × instituição",
    cvdInstLocked: "CVD institucional (Coinbase)",
    cvdInstHint: "O varejo você já vê. Falta o smart money à vista — o fluxo que mais diverge.",
    bookAll: "Pressão do book · todas as fontes (bid − ask, ±2%)",
    bookRetail: "Pressão do book · varejo (Binance + OKX, bid − ask ±2%)",
    bookInstLocked: "Pressão do book · institucional (Coinbase)",
    bookInstHint: "Liquidez parada do book institucional — onde a instituição segura o preço.",
  },
};

const EN: Dict = {
  common: { loading: "Loading…", soon: "Soon", manage: "manage" },
  header: { newsletter: "Newsletter", alerts: "Alerts", admin: "Admin", loadingPlan: "Loading plan…" },
  tabs: {
    cockpit: "Main Cockpit",
    smart: "Smart Money & On-chain",
    indicators: "Market Read",
    macro: "Macro & Correlations",
    reports: "Reports",
  },
  modules: {
    menuTitle: "Market module",
    soon: "Soon",
    moreSoon: "New modules unlock with your plan.",
    forexLocked: "Available on the Forex plan (soon)",
    tooltip: "Market module",
  },
  account: {
    plan: "Plan",
    editProfile: "Edit profile",
    signOut: "Sign out",
    incomplete: "Profile incomplete — add your phone/WhatsApp.",
    incompleteShort: "Profile incomplete",
  },
  asset: {
    gammaTip: "Full institutional layer (gamma, options, DVOL, Coinbase CVD)",
    lockedTip: "Available on higher plans",
  },
  login: {
    backHome: "← Home",
    welcomeTitle: "Welcome back",
    welcomeSub: "Sign in to your cockpit and keep reading the market the way the big players do.",
    highlights: [
      "Gamma, smart money & capital flow in real time",
      "Liquidation heatmap & order-book walls",
      "AI alerts & daily reports",
      "Crypto now; stocks (B3) & forex coming",
    ],
    copyright: "© 2026 OrbeView · informational and educational, not financial advice.",
    signinTitle: "Sign in to your cockpit",
    signupTitle: "Create your account",
    signinSub: "Enter your credentials to continue.",
    signupSub: "Start free — no card required.",
    fullName: "Full name",
    namePlaceholder: "Your name",
    email: "Email",
    password: "Password",
    signinBtn: "Sign in to cockpit",
    signupBtn: "Create free account",
    orContinue: "or continue with",
    google: "Continue with Google",
    noAccount: "No account yet?",
    haveAccount: "Already have an account?",
    createFree: "Create free account",
    signin: "Sign in",
    seePlans: "See plans",
    accountCreated: "Account created! Confirm your email (if required) and sign in.",
    authFail: "Authentication failed",
  },
  locked: { availableOn: "Available on the {plan} plan.", unlock: "Unlock with {plan} →" },
  priceHeader: {
    instTier: "Institutional + Gamma",
    flowTier: "Derivatives & flow",
    instTip: "Full institutional layer: gamma, options, volatility (DVOL), and Coinbase CVD/premium — plus derivatives and flow.",
    flowTip: "Derivatives & flow cockpit: funding (CEX + on-chain), OI, long/short, liquidations, and order-book walls. No gamma/options (no liquid options market for this coin).",
    updated: "Updated",
    waiting: "Waiting for the first data cycle",
  },
  cockpit: {
    gammaModule: "Gamma module (SpotGamma-style)",
    gammaLocked: "Gamma module — regime, Zero Gamma, and Max Pain",
    hiroLocked: "Options flow (HIRO) — hedge delta-flow",
    volTitle: "Volatility (DVOL, IV, term structure)",
    volLocked: "Volatility — DVOL, IV percentile, and term structure",
    flowSection: "Flow, liquidity, and sentiment",
    retailGroup: "Retail and leverage",
    instGroup: "Institutional and structural",
    fundingCex: "Funding (CEX aggregate)",
    fundingOnchain: "On-chain funding",
    cvdRetail: "Retail CVD",
    longShort: "Long / Short",
    liquidations: "Liquidations",
    squeezeRisk: "Squeeze risk",
    instBias: "Institutional vs. retail bias",
    instBiasSource: "Premium + share + CVD (Coinbase vs. Binance+OKX)",
    defiHealth: "DeFi health (TVL)",
    dexLiquidity: "DEX liquidity",
    dexLiquiditySuffix: "in liquidity",
    vol24h: "24h volume",
    marketMacro: "Market macro",
    btcDominance: "BTC dominance",
    totalMcap: "Total market cap",
    etfSpot: "Spot ETFs",
    optionsHedge: "Institutional hedge (options)",
    bookRetail: "Order-book pressure · retail",
    bookInst: "Order-book pressure · institutional",
    lockedFundingGex: "Funding & GEX",
    lockedCvd: "Retail CVD",
    lockedLongShort: "Long / Short ratio",
    lockedLiq: "Liquidations — liquidity targets",
    lockedInstBias: "Institutional vs. retail bias",
    lockedBookInst: "Order-book pressure · institutional",
    lockedEtf: "Spot ETFs · institutional flow",
    lockedMacro: "Market macro · dominance and mcap",
    lockedHedge: "Institutional hedge (options)",
  },
  subchart: {
    cvdRetail: "Volume Delta · Retail CVD",
    cvdInst: "Institutional CVD (Coinbase) — retail vs. institution",
    cvdInstLocked: "Institutional CVD (Coinbase)",
    cvdInstHint: "You already see retail. What's missing is the spot smart money — the flow that diverges most.",
    bookAll: "Order-book pressure · all sources (bid − ask, ±2%)",
    bookRetail: "Order-book pressure · retail (Binance + OKX, bid − ask ±2%)",
    bookInstLocked: "Order-book pressure · institutional (Coinbase)",
    bookInstHint: "The institutional book's resting liquidity — where institutions defend price.",
  },
};

const MESSAGES: Record<Locale, Dict> = { pt: PT, en: EN };

/** Hook de tradução: `const { t, locale, setLocale } = useT()`. */
export function useT() {
  const { locale, setLocale, isEn } = useLocale();
  return { t: MESSAGES[locale], locale, setLocale, isEn };
}
