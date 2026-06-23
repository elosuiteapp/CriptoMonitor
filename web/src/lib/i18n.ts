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
  smart: {
    biasLabel: string;
    biasUp: string;
    biasDown: string;
    biasUndef: string;
    trendNeutral: string;
    live: string;
    liveTip: string;
    radar: string;
    radarOnTip: string;
    radarOffTip: string;
    radarNew: string; // {type} {bias} {price}
    radarSweep: string; // {price}
    alertNotifTitle: string; // título da notificação nativa do radar
    dismiss: string;
    fundingTip: string;
    per8h: string;
    oiTip: string;
    unlockTitle: string; // prefixo; {asset} anexado
    unlockTip: string;
    in: string;
    daysAbbr: string;
    ofSupply: string;
    stablesTitle: string;
    stablesTip: string;
    total: string;
    capitalIn: string;
    capitalOut: string;
    flowFlat: string;
    netTitle: string; // {chain}
    netTip: string;
    txs24h: string;
    tpsNoVotes: string;
    avgFee: string;
    mempool: string;
    hashrate: string;
    trendTopDown: string;
    trendTip: string;
    calculating: string;
    loadError: string;
    nonCurated1: string; // "{asset}" bold antes; texto até price-action
    nonCuratedPA: string; // "price-action puro" (bold)
    nonCurated2: string; // restante
    loadingStructure: string;
    legendZones: string;
    legendDemand: string;
    legendSupply: string;
    legendLiquidity: string;
    legendImbalance: string;
    legendEqual: string;
    legendArrows: string;
    legendComputed: string;
    cvdSubTitle: string; // {tf}
    keyLevelsTitle: string;
    keyLevelsSub: string;
    thLevel: string;
    thPrice: string;
    thDist: string;
    thConf: string;
    thAlert: string;
    confNearTip: string;
    confExactTip: string;
    confLiq: string; // rótulo de confluência "Liquidação"
    confLiqStrong: string; // "Liquidação (forte)"
    alertCreated: string;
    alertBtn: string;
    noLevels: string;
    alertFooter: string; // até "Gerencie em"; link anexado
    alertsLink: string;
    alertsProExpert: string;
    onchainSoon: string;
    subLoading: string; // "carregando…" do subgráfico
    rangePos: string;
    zonePremium: string;
    zoneDiscount: string;
    zoneEquilibrium: string;
    obUp: string; // marcador do gráfico "OB alta"
    obDown: string;
    heatmapTitle: string;
    heatWeak: string;
    heatStrong: string;
    heatLongs: string;
    heatShorts: string;
    searchPlaceholder: string;
    favorites: string;
    nothingFound: string;
    favRemove: string;
    favAdd: string;
    favMax: string; // {max}
    layers: {
      orderBlocks: { label: string; help: string };
      fvg: { label: string; help: string };
      liquidity: { label: string; help: string };
      zones: { label: string; help: string };
      equal: { label: string; help: string };
      structure: { label: string; help: string };
      volumeProfile: { label: string; help: string };
      cvd: { label: string; help: string };
      liquidations: { label: string; help: string };
      htf: { label: string; help: string };
    };
    readingHelp: {
      structure: string;
      internal: string;
      zone: string;
      liqAbove: string;
      liqBelow: string;
      obAbove: string;
      obBelow: string;
      sweep: string;
    };
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
  smart: {
    biasLabel: "Viés",
    biasUp: "alta",
    biasDown: "baixa",
    biasUndef: "indefinido",
    trendNeutral: "neutro",
    live: "ao vivo",
    liveTip: "Atualiza automaticamente a cada 60s",
    radar: "Radar",
    radarOnTip: "Radar de eventos SMC ligado — avisa BOS/CHoCH/varredura com a aba aberta",
    radarOffTip: "Ativar radar de eventos SMC (BOS/CHoCH/varredura)",
    radarNew: "novo {type} de {bias} em {price}",
    radarSweep: "varredura de liquidez (stop hunt) em {price}",
    alertNotifTitle: "OrbeView · Smart Money",
    dismiss: "Dispensar",
    fundingTip: "Funding atual do perpétuo USDT-M da Binance (intervalo de 8h). Positivo = comprados pagando vendidos (otimismo alavancado); negativo = vendidos pagando.",
    per8h: "/8h",
    oiTip: "Open Interest: valor total em contratos perpétuos abertos (Binance Futures). Subindo junto com o preço = posições novas; subindo contra o preço = atenção a squeeze.",
    unlockTitle: "On-chain · Próximo unlock — ",
    unlockTip: "Token unlock: liberação programada de tokens em vesting. Liberações grandes (>1% do supply) tendem a gerar pressão vendedora. Fonte: DefiLlama (on-chain).",
    in: "em",
    daysAbbr: "d",
    ofSupply: "do supply",
    stablesTitle: "On-chain · Fluxo de capital (stablecoins) — netflow do mercado",
    stablesTip: "Emissão líquida de stablecoins (USDT/USDC etc.) = capital entrando (cunhagem) ou saindo (resgate) de cripto. É o melhor proxy gratuito de 'netflow' do mercado: dry powder expandindo = combustível pra risco; encolhendo = risk-off. Market-wide (igual p/ todas as moedas). Fonte: DefiLlama.",
    total: "Total",
    capitalIn: "capital entrando (combustível)",
    capitalOut: "capital saindo (risk-off)",
    flowFlat: "fluxo de lado",
    netTitle: "On-chain · Rede {chain}",
    netTip: "Atividade da blockchain: transações nas últimas 24h, taxa média paga, transações na fila (mempool) e hashrate (poder de mineração, só redes PoW). Solana mostra TPS (transações/s, sem votos). Mais atividade/taxas = rede mais demandada. Fonte: Blockchair / RPC Solana.",
    txs24h: "Txs 24h",
    tpsNoVotes: "TPS (sem votos)",
    avgFee: "Taxa méd.",
    mempool: "Mempool",
    hashrate: "Hashrate",
    trendTopDown: "Tendência (top-down):",
    trendTip: "Viés da estrutura em vários timeframes (1D/4h/1h). Operar a favor do timeframe maior aumenta a chance — princípio nº1 do Smart Money.",
    calculating: "calculando…",
    loadError: "Falha ao carregar dados de mercado",
    nonCurated1: "está fora da lista institucional: leitura por",
    nonCuratedPA: "price-action puro",
    nonCurated2: "(velas da Binance). Sem gamma, paredes do book e dados do coletor — a confluência fica limitada a POC/Value Area e bolsões de liquidação.",
    loadingStructure: "Carregando estrutura…",
    legendZones: "Zonas",
    legendDemand: "demanda/discount",
    legendSupply: "oferta/premium",
    legendLiquidity: "liquidez",
    legendImbalance: "imbalance (FVG)",
    legendEqual: "EQH/EQL = topos/fundos iguais",
    legendArrows: "setas = BOS/CHoCH",
    legendComputed: "Tudo calculado dos candles.",
    cvdSubTitle: "Volume Delta · CVD (Binance · {tf})",
    keyLevelsTitle: "Níveis-chave por confluência",
    keyLevelsSub: "SMC × book × gamma × POC × liquidação × HTF — ordenado por distância",
    thLevel: "Nível",
    thPrice: "Preço",
    thDist: "Distância",
    thConf: "Confluência",
    thAlert: "Alerta",
    confNearTip: "confluência próxima (~1%)",
    confExactTip: "confluência exata",
    confLiq: "Liquidação",
    confLiqStrong: "Liquidação (forte)",
    alertCreated: "✓ criado",
    alertBtn: "🔔 alerta",
    noLevels: "Sem níveis suficientes neste timeframe.",
    alertFooter: "🔔 cria um alerta de preço no nível (toque acima → dispara na subida; abaixo → na descida). Gerencie em",
    alertsLink: "Alertas",
    alertsProExpert: "Alertas disponíveis nos planos Pro/Expert.",
    onchainSoon: "Em breve: camada on-chain (exchange netflow, whale alerts, MVRV, unlocks) quando houver fonte de dados dedicada.",
    subLoading: "carregando…",
    rangePos: "Posição no range",
    zonePremium: "Premium",
    zoneDiscount: "Discount",
    zoneEquilibrium: "Equilíbrio",
    obUp: "alta",
    obDown: "baixa",
    heatmapTitle: "Heatmap de liquidações · estimativa (modelo de alavancagem)",
    heatWeak: "fraco",
    heatStrong: "forte",
    heatLongs: "longs ↓",
    heatShorts: "shorts ↑",
    searchPlaceholder: "Buscar moeda (nome ou ticker)…",
    favorites: "Favoritos",
    nothingFound: "Nada encontrado.",
    favRemove: "Remover dos favoritos",
    favAdd: "Adicionar aos favoritos",
    favMax: "Máximo de {max} favoritos",
    layers: {
      orderBlocks: { label: "Order Blocks", help: "Order blocks — zonas onde a mão forte posicionou (última vela antes de um movimento forte). Viram suporte (demanda) ou resistência (oferta)." },
      fvg: { label: "Imbalance", help: "Imbalance / FVG (Fair Value Gap) — gap de 3 velas onde o preço passou rápido demais. Tende a ser preenchido depois (ímã)." },
      liquidity: { label: "Liquidez", help: "Zonas de liquidez — aglomerados de stops (topos/fundos iguais). Funcionam como ímãs; o preço costuma buscá-los." },
      zones: { label: "Zonas", help: "Premium/Discount — metade cara (premium, zona de venda) e barata (discount, zona de compra) do range, com o equilíbrio no meio." },
      equal: { label: "EQH/EQL", help: "EQH/EQL — topos iguais (Equal Highs) e fundos iguais (Equal Lows): regiões com liquidez acumulada logo acima/abaixo." },
      structure: { label: "BOS/CHoCH", help: "BOS = rompimento de estrutura (continuação da tendência); CHoCH = mudança de caráter (possível reversão)." },
      volumeProfile: { label: "Volume Profile", help: "POC (preço com mais volume negociado) e Value Area (faixa de 70% do volume) — ímãs e suporte/resistência, calculados do volume das velas." },
      cvd: { label: "CVD / Volume Delta", help: "Volume delta acumulado (comprador agressor − vendedor) das velas da Binance, em painel abaixo do gráfico. Subindo = compradores no comando; divergir do preço é o sinal mais valioso." },
      liquidations: { label: "Liquidações", help: "Heatmap estimado de bolsões de liquidação (modelo de alavancagem sobre as velas). Zonas quentes funcionam como ímãs de preço." },
      htf: { label: "HTF (TF maior)", help: "Níveis do timeframe MAIOR (order blocks e liquidez) projetados no gráfico atual — em fúcsia. Operar a favor do timeframe maior é o princípio nº1 do Smart Money; nível que coincide com o HTF tem muito mais peso." },
    },
    readingHelp: {
      structure: "Direção dada pela sequência de topos e fundos. BOS = rompimento (continuação); CHoCH = mudança de caráter (possível reversão).",
      internal: "A estrutura num grau menor (curto prazo). Quando diverge da principal, costuma anteceder pivôs ou pullbacks.",
      zone: "Onde o preço está no range: Discount (barato, zona de compra da mão forte), Premium (caro, zona de venda) ou Equilíbrio.",
      liqAbove: "Pool de liquidez = aglomerado de stops acima do preço. Ímã provável — o preço tende a buscá-lo antes de seguir.",
      liqBelow: "Pool de liquidez = aglomerado de stops abaixo do preço. Ímã provável — o preço tende a buscá-lo antes de seguir.",
      obAbove: "Order block de oferta acima do preço — zona onde vendedores tendem a reagir (possível resistência).",
      obBelow: "Order block de demanda abaixo do preço — zona onde compradores tendem a reagir (possível suporte).",
      sweep: "Stop hunt: o preço varre uma região de stops e reverte. Sinal clássico de manipulação da mão forte antes do movimento real.",
    },
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
  smart: {
    biasLabel: "Bias",
    biasUp: "bullish",
    biasDown: "bearish",
    biasUndef: "undefined",
    trendNeutral: "neutral",
    live: "live",
    liveTip: "Auto-refreshes every 60s",
    radar: "Radar",
    radarOnTip: "SMC event radar on — alerts BOS/CHoCH/sweeps while the tab is open",
    radarOffTip: "Turn on the SMC event radar (BOS/CHoCH/sweeps)",
    radarNew: "new {bias} {type} at {price}",
    radarSweep: "liquidity sweep (stop hunt) at {price}",
    alertNotifTitle: "OrbeView · Smart Money",
    dismiss: "Dismiss",
    fundingTip: "Current funding of Binance's USDT-M perpetual (8h interval). Positive = longs paying shorts (leveraged optimism); negative = shorts paying.",
    per8h: "/8h",
    oiTip: "Open Interest: total value in open perpetual contracts (Binance Futures). Rising with price = new positions; rising against price = watch for a squeeze.",
    unlockTitle: "On-chain · Next unlock — ",
    unlockTip: "Token unlock: scheduled release of vesting tokens. Large releases (>1% of supply) tend to create selling pressure. Source: DefiLlama (on-chain).",
    in: "in",
    daysAbbr: "d",
    ofSupply: "of supply",
    stablesTitle: "On-chain · Capital flow (stablecoins) — market netflow",
    stablesTip: "Net stablecoin issuance (USDT/USDC etc.) = capital flowing into (minting) or out of (redemption) crypto. It's the best free proxy for market 'netflow': expanding dry powder = fuel for risk; shrinking = risk-off. Market-wide (same for all coins). Source: DefiLlama.",
    total: "Total",
    capitalIn: "capital flowing in (fuel)",
    capitalOut: "capital flowing out (risk-off)",
    flowFlat: "flat flow",
    netTitle: "On-chain · {chain} network",
    netTip: "Blockchain activity: transactions in the last 24h, average fee paid, queued transactions (mempool), and hashrate (mining power, PoW networks only). Solana shows TPS (tx/s, votes excluded). More activity/fees = a more in-demand network. Source: Blockchair / Solana RPC.",
    txs24h: "Txs 24h",
    tpsNoVotes: "TPS (no votes)",
    avgFee: "Avg fee",
    mempool: "Mempool",
    hashrate: "Hashrate",
    trendTopDown: "Trend (top-down):",
    trendTip: "Structure bias across timeframes (1D/4h/1h). Trading with the higher timeframe improves your odds — the #1 Smart Money principle.",
    calculating: "computing…",
    loadError: "Failed to load market data",
    nonCurated1: "is outside the institutional list: read via",
    nonCuratedPA: "pure price-action",
    nonCurated2: "(Binance candles). No gamma, order-book walls, or collector data — confluence is limited to POC/Value Area and liquidation pockets.",
    loadingStructure: "Loading structure…",
    legendZones: "Zones",
    legendDemand: "demand/discount",
    legendSupply: "supply/premium",
    legendLiquidity: "liquidity",
    legendImbalance: "imbalance (FVG)",
    legendEqual: "EQH/EQL = equal highs/lows",
    legendArrows: "arrows = BOS/CHoCH",
    legendComputed: "All computed from candles.",
    cvdSubTitle: "Volume Delta · CVD (Binance · {tf})",
    keyLevelsTitle: "Key levels by confluence",
    keyLevelsSub: "SMC × book × gamma × POC × liquidation × HTF — sorted by distance",
    thLevel: "Level",
    thPrice: "Price",
    thDist: "Distance",
    thConf: "Confluence",
    thAlert: "Alert",
    confNearTip: "near confluence (~1%)",
    confExactTip: "exact confluence",
    confLiq: "Liquidation",
    confLiqStrong: "Liquidation (strong)",
    alertCreated: "✓ created",
    alertBtn: "🔔 alert",
    noLevels: "Not enough levels on this timeframe.",
    alertFooter: "🔔 creates a price alert at the level (tap above → fires on the way up; below → on the way down). Manage them in",
    alertsLink: "Alerts",
    alertsProExpert: "Alerts available on the Pro/Expert plans.",
    onchainSoon: "Coming soon: on-chain layer (exchange netflow, whale alerts, MVRV, unlocks) once there's a dedicated data source.",
    subLoading: "loading…",
    rangePos: "Range position",
    zonePremium: "Premium",
    zoneDiscount: "Discount",
    zoneEquilibrium: "Equilibrium",
    obUp: "up",
    obDown: "down",
    heatmapTitle: "Liquidation heatmap · estimate (leverage model)",
    heatWeak: "weak",
    heatStrong: "strong",
    heatLongs: "longs ↓",
    heatShorts: "shorts ↑",
    searchPlaceholder: "Search coin (name or ticker)…",
    favorites: "Favorites",
    nothingFound: "Nothing found.",
    favRemove: "Remove from favorites",
    favAdd: "Add to favorites",
    favMax: "Max of {max} favorites",
    layers: {
      orderBlocks: { label: "Order Blocks", help: "Order blocks — zones where smart money positioned (the last candle before a strong move). They become support (demand) or resistance (supply)." },
      fvg: { label: "Imbalance", help: "Imbalance / FVG (Fair Value Gap) — a 3-candle gap where price moved too fast. It tends to be filled later (a magnet)." },
      liquidity: { label: "Liquidity", help: "Liquidity zones — clusters of stops (equal highs/lows). They act as magnets; price tends to reach for them." },
      zones: { label: "Zones", help: "Premium/Discount — the expensive half (premium, sell zone) and the cheap half (discount, buy zone) of the range, with equilibrium in the middle." },
      equal: { label: "EQH/EQL", help: "EQH/EQL — equal highs and equal lows: regions with liquidity stacked just above/below." },
      structure: { label: "BOS/CHoCH", help: "BOS = break of structure (trend continuation); CHoCH = change of character (possible reversal)." },
      volumeProfile: { label: "Volume Profile", help: "POC (price with the most traded volume) and Value Area (the 70%-of-volume band) — magnets and support/resistance, computed from candle volume." },
      cvd: { label: "CVD / Volume Delta", help: "Cumulative volume delta (aggressive buyer − seller) from Binance candles, in a panel below the chart. Rising = buyers in control; diverging from price is the most valuable signal." },
      liquidations: { label: "Liquidations", help: "Estimated heatmap of liquidation pockets (leverage model over the candles). Hot zones act as price magnets." },
      htf: { label: "HTF (higher TF)", help: "Levels from the HIGHER timeframe (order blocks and liquidity) projected onto the current chart — in fuchsia. Trading with the higher timeframe is the #1 Smart Money principle; a level that coincides with the HTF carries far more weight." },
    },
    readingHelp: {
      structure: "Direction set by the sequence of highs and lows. BOS = break (continuation); CHoCH = change of character (possible reversal).",
      internal: "Structure at a lower degree (short term). When it diverges from the main one, it often precedes pivots or pullbacks.",
      zone: "Where price sits in the range: Discount (cheap, smart-money buy zone), Premium (expensive, sell zone), or Equilibrium.",
      liqAbove: "Liquidity pool = a cluster of stops above price. A likely magnet — price tends to reach for it before continuing.",
      liqBelow: "Liquidity pool = a cluster of stops below price. A likely magnet — price tends to reach for it before continuing.",
      obAbove: "Supply order block above price — a zone where sellers tend to react (possible resistance).",
      obBelow: "Demand order block below price — a zone where buyers tend to react (possible support).",
      sweep: "Stop hunt: price sweeps a region of stops and reverses. A classic sign of smart-money manipulation before the real move.",
    },
  },
};

const MESSAGES: Record<Locale, Dict> = { pt: PT, en: EN };

/** Hook de tradução: `const { t, locale, setLocale } = useT()`. */
export function useT() {
  const { locale, setLocale, isEn } = useLocale();
  return { t: MESSAGES[locale], locale, setLocale, isEn };
}
