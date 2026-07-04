import { getLocale, useLocale, type Locale } from "../hooks/useLocale";

/**
 * Dicionário central de strings do app (PT/EN). A interface `Dict` garante, em
 * tempo de compilação, que toda chave exista nos dois idiomas (paridade).
 *
 * Uso: `const { t } = useT();` → `t.tabs.cockpit`. A migração é incremental —
 * componentes ainda em PT puro vão sendo movidos pra cá aos poucos (ver memory
 * [[i18n-plan]]). Sem libs externas (react-i18next etc.) pra não pesar o bundle.
 */
export interface Dict {
  common: { loading: string; soon: string; manage: string; retry: string };
  header: { newsletter: string; alerts: string; admin: string; loadingPlan: string; planError: string };
  tabs: { cockpit: string; smart: string; indicators: string; macro: string; reports: string };
  modules: { menuTitle: string; soon: string; moreSoon: string; forexLocked: string; tooltip: string };
  account: { plan: string; editProfile: string; signOut: string; incomplete: string; incompleteShort: string };
  asset: { gammaTip: string; lockedTip: string; favorite: string; unfavorite: string };
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
  locked: { availableOn: string; unlock: string; viewOn: string }; // {plan} interpolado
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
    cbPremTitle: string;
    cbPremTip: string;
    cbPremBuy: string;
    cbPremSell: string;
    cbPremFlat: string;
    subLoading: string; // "carregando…" do subgráfico
    rangePos: string;
    zonePremium: string;
    zoneDiscount: string;
    zoneEquilibrium: string;
    obUp: string; // marcador do gráfico "OB alta"
    obDown: string;
    heatmapTitle: string;
    strongHigh: string; // topo forte (defendido) — LuxAlgo strong/weak
    weakHigh: string;
    strongLow: string;
    weakLow: string;
    sweptTag: string; // tag "varrida" no sweep de liquidez
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
      swings: { label: string; help: string };
      prevLevels: { label: string; help: string };
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
  tf: { m15: string; h1: string; h4: string; d1: string; w1: string; mo1: string };
  chartType: { candles: string; bars: string; line: string; area: string };
  layerToggles: {
    title: string;
    availableOn: string; // "· disponível no {tier}"
    items: {
      gex: { label: string; desc: string };
      zeroGamma: { label: string; desc: string };
      maxPain: { label: string; desc: string };
      volumeProfile: { label: string; desc: string };
      vwap: { label: string; desc: string };
      orderbookWalls: { label: string; desc: string };
      funding: { label: string; desc: string };
      cvd: { label: string; desc: string };
      bookPressure: { label: string; desc: string };
      liquidations: { label: string; desc: string };
      bookHeatmap: { label: string; desc: string };
    };
  };
  book: {
    title: string;
    unavailable: string;
    sideBuyer: string;
    sideSeller: string;
    sideBalanced: string;
    buy: string;
    sell: string;
    band2pct: string;
    near: string; // "Perto (±0,5%):"
    buyerWord: string;
    sellerWord: string;
    balancedWord: string;
    institutional: string;
    source: string;
  };
  whaleWalls: {
    title: string;
    tip: string;
    support: string;
    resistance: string;
    balanced: string;
    weighted: string;
    unavailable: string;
    divBuy: string; // baleias defendem suporte, mas pressão geral é vendedora
    divSell: string; // baleias montam teto, mas pressão geral é compradora
    aligned: string; // paredes e pressão concordam
  };
  notif: {
    title: string;
    markRead: string;
    clear: string;
    empty: string;
    pushBlocked: string;
    pushActive: string;
    pushOffer: string;
    disable: string;
    enable: string;
  };
  news: { general: string; forAsset: string; none: string; moreOnPro: string };
  strips: {
    awaiting: string;
    fundingCexTitle: string;
    fundingTip: string;
    current: string;
    perYear: string;
    liqRealizedShort: string;
    liqRealizedFull: string;
    shorts: string;
    longs: string;
    cvdRetail: string;
    fundingLabel: string;
  };
  macroGlobal: {
    title: string;
    tip: string;
    riskOn: string;
    riskOff: string;
    neutral: string;
    fedNetLiq: string;
    triPrefix: string;
    triSuffix: string;
    tideRising: string;
    tideFalling: string;
    tide: string; // "maré"
    conditions: string;
    condLoose: string;
    condTight: string;
    hySpread: string;
    hyTight: string;
    hyWide: string;
    realYield: string;
    costOfMoney: string;
    curve: string;
    curveInverted: string;
    curveNormal: string;
    m2sub: string;
    footer: string;
  };
  onchain: {
    title: string;
    tip: string;
    cyclePos: string;
    cycleBottom: string;
    cycleCheap: string;
    cycleNeutral: string;
    cycleHot: string;
    cycleTop: string;
    zCapitulation: string;
    zDiscount: string;
    zNeutral: string;
    zElevated: string;
    zEuphoria: string;
    realizedTitle: string;
    reserveRisk: string;
    networkTitle: string;
    hashrate: string;
    nextDiff: string;
    mempool: string;
    feeFast: string;
    inProfit: string;
    atLoss: string;
    footer: string;
  };
  gammaChart: {
    partialHist: string; // "histórico parcial: {label} (enche até {days}d)"
    accumulating: string; // "{days}"
    regimePos: string;
    regimeNeg: string;
    legendNote: string;
    zeroPoint: string;
    noProfile: string;
    loadingOi: string;
    noOi: string;
    oiIntro1: string; // "Contratos"
    oiIntroRaw: string; // "crus"
    oiIntro2: string; // "em aberto (vencimento mais próximo) —"
    oiIntroTwoBars: string; // "duas barras por strike"
    oiIntro3: string; // ": put à esquerda (suporte)…condensa cada strike numa barra só. Cor cheia ="
    oiIntroWall: string; // "muro de OI"
    oiIntro4: string; // "."
    puts: string;
    calls: string;
    wall: string; // "muro"
    expiryPrefix: string; // "venc."
    oiInContracts: string;
    readRight: string; // "direita do Ponto Zero"
    readLong: string; // "comprados em gamma"
    readRightTail: string; // "(vendem altas/compram quedas → preço tende a grudar);"
    readLeft: string; // "esquerda"
    readShort: string; // "vendidos"
    readTail: string; // "(movimentos amplificam). O preço costuma ser puxado para as paredes (Put/Call) e para o Max Pain."
    readAt: string; // "À" / "To the"
    readToLeft: string; // "à" / "to the"
  };
  disclaimer: string;
  gauge: { noData: string };
  errorBoundary: { brokeIn: string; thisSection: string; retry: string };
  aiButton: { cta: string; unlimited: string; todayOf: string };
  placeholder: { titleSuffix: string; comingSoon: string; correspondingPlan: string; adminPreview: string; backToCrypto: string };
  accountDrawer: {
    welcomeTitle: string;
    accountTitle: string;
    welcomeSub: string;
    accountSub: string;
    closeAria: string;
    plan: string;
    chosePlan: string; // "{plan}"
    monthly: string;
    annualOff: string;
    perYear: string;
    perMonth: string;
    redirecting: string;
    subscribe: string; // "{plan}"
    payNote: string;
    changePlan: string;
    downgradeConfirmPre: string; // "Rebaixar para o"
    downgradeConfirmMid: string; // "? Acesso garantido até"
    downgradeConfirmPost: string; // ", sem nova cobrança."
    yesDowngrade: string;
    back: string;
    downgrade: string;
    profile: string;
    fullName: string;
    namePlaceholder: string;
    phone: string;
    cpf: string;
    cpfNote: string;
    email: string;
    saving: string;
    save: string;
    saveError: string;
    saved: string;
    cpfRequired: string;
    checkoutUnavailable: string;
    checkoutFail: string;
    cancelFail: string;
    downgradeOk: string;
    statusNoRenew: string; // "{date}"
    statusPastDue: string;
    statusRenews: string; // "{date}"
    statusFree: string;
    tagPopular: string;
    proFeatures: [string, string, string];
    expertFeatures: [string, string, string];
  };
  pages: {
    backCockpit: string;
    notFound: { title: string; sub: string; back: string };
    alerts: {
      title: string;
      sub: string;
      metricPrice: string;
      metricFunding: string;
      metricRegime: string;
      gatedPre: string;
      gatedAnd: string;
      gatedPost: string;
      seePlans: string;
      asset: string;
      metric: string;
      whenRegime: string;
      regimeNeg: string;
      regimePos: string;
      condition: string;
      above: string;
      below: string;
      valuePct: string;
      valueUsd: string;
      create: string;
      yourAlerts: string;
      none: string;
      delete: string;
      createFail: string;
    };
    analysis: {
      title: string; // "O que está acontecendo" (+ · {asset})
      generate: string;
      generating: string;
      unlimited: string;
      countOf: string; // "Análise {used} de {limit} hoje"
      noneA: string;
      noneB: string; // " para o copiloto narrar o cenário de {asset}."
      aiAt: string; // "Análise de IA · {date}"
      genFail: string;
    };
    b3Analysis: { noneB: string }; // reusa analysis.* + noneB próprio
    newsletter: { subA: string; subStrong: string; subB: string; empty: string; read: string };
    newsletterEdition: {
      notFound: string;
      seeAll: string;
      fullTitle: string; // "Edição completa no plano {tier}"
      fullSub: string; // "…{tier}…"
      subscribe: string; // "Assinar {tier}"
      allEditions: string;
    };
  };
}

const PT: Dict = {
  common: { loading: "Carregando…", soon: "Em breve", manage: "gerenciar", retry: "Tentar de novo" },
  header: {
    newsletter: "Newsletter",
    alerts: "Alertas",
    admin: "Admin",
    loadingPlan: "Carregando plano…",
    planError: "Não foi possível carregar seu plano. Verifique a conexão (extensões/adblock podem bloquear) e tente de novo.",
  },
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
    favorite: "Favoritar (recebe alerta de mudança de leitura)",
    unfavorite: "Remover dos favoritos",
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
  locked: { availableOn: "Disponível no plano {plan}.", unlock: "Desbloquear no {plan} →", viewOn: "Ver no {plan} →" },
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
    onchainSoon: "A camada on-chain acima usa dados grátis (desbloqueios de tokens, liquidez de stablecoins, atividade de rede). Métricas de valuation on-chain (MVRV, SOPR, netflow de exchanges) exigem fonte paga e ficam fora por enquanto.",
    cbPremTitle: "Fluxo institucional (prêmio Coinbase)",
    cbPremTip: "Diferença de preço da Coinbase (institucional dos EUA) vs Binance (varejo global). Prêmio positivo = institucional comprando com mais apetite; negativo = vendendo. Sinal real de fluxo institucional — grátis. Só nas moedas listadas na Coinbase.",
    cbPremBuy: "institucional comprando",
    cbPremSell: "institucional vendendo",
    cbPremFlat: "equilibrado",
    subLoading: "carregando…",
    rangePos: "Posição no range",
    zonePremium: "Premium",
    zoneDiscount: "Discount",
    zoneEquilibrium: "Equilíbrio",
    obUp: "alta",
    obDown: "baixa",
    heatmapTitle: "Heatmap de liquidações · estimativa (modelo de alavancagem)",
    strongHigh: "Strong High (defendido)",
    weakHigh: "Weak High (tende a romper)",
    strongLow: "Strong Low (defendido)",
    weakLow: "Weak Low (tende a romper)",
    sweptTag: "varrida",
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
      swings: { label: "HH/HL/LH/LL", help: "Rótulos dos pivôs de swing: HH topo mais alto · HL fundo mais alto (alta) · LH topo mais baixo · LL fundo mais baixo (baixa). Deixam a estrutura legível no gráfico." },
      prevLevels: { label: "Máx/Mín D-S-M", help: "Máxima e mínima do dia (PDH/PDL, azul), semana (PWH/PWL, índigo) e mês (PMH/PML, teal) ANTERIORES — ímãs clássicos de liquidez: o preço costuma buscá-los e reagir neles. Zona SMC colada num desses níveis fica mais forte (aparece na confluência)." },
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
  tf: { m15: "15M", h1: "1H", h4: "4H", d1: "1D", w1: "1S", mo1: "1Mês" },
  chartType: { candles: "Velas", bars: "Barras", line: "Linha", area: "Área" },
  layerToggles: {
    title: "Camadas:",
    availableOn: "disponível no {tier}",
    items: {
      gex: { label: "Opções (Call/Put Wall)", desc: "Strikes com maior gama (GEX): Call Wall = teto/resistência, Put Wall = piso/suporte onde os dealers tendem a segurar o preço." },
      zeroGamma: { label: "Zero Gamma", desc: "Nível onde o gama dos dealers vira de positivo para negativo. Acima: dealers amortecem (mercado mais calmo). Abaixo: amplificam (mais volátil)." },
      maxPain: { label: "Max Pain", desc: "Preço onde o maior volume de opções expira sem valor. Perto do vencimento o preço tende a gravitar para cá (efeito ímã)." },
      volumeProfile: { label: "Volume Profile (POC)", desc: "POC = preço com maior volume negociado no período (ímã de liquidez); VA High/Low delimitam 70% do volume." },
      vwap: { label: "VWAP D-S-M", desc: "VWAP ancorado (preço médio ponderado por volume) do dia, semana e mês — o benchmark que as mesas institucionais usam pra medir execução. Preço acima = compradores no controle desde a âncora; o nível atrai reteste e reação. As âncoras mudam com o timeframe (intraday: dia+semana; diário: semana+mês)." },
      orderbookWalls: { label: "Paredes do book", desc: "Grandes ordens no livro (Binance+Coinbase): paredes de compra = suporte, de venda = resistência." },
      funding: { label: "Funding", desc: "Taxa de financiamento dos perpétuos: positiva = comprados pagam (otimismo alavancado), negativa = vendidos pagam." },
      cvd: { label: "CVD", desc: "Cumulative Volume Delta: fluxo agressor líquido (compras a mercado − vendas a mercado). Varejo (Binance+OKX) × institucional (Coinbase)." },
      bookPressure: { label: "Pressão do book", desc: "Pressão do book no tempo: liquidez parada bid − ask perto do preço (±2%). Verde = book comprador (mais compra), vermelho = vendedor. Diferente do CVD (fluxo executado) — a leitura forte é cruzar os dois." },
      liquidations: { label: "Liquidações (heatmap + barras)", desc: "Heatmap estimado de zonas de liquidação (magnet zones, modelo de alavancagem) + barras de liquidações realizadas embaixo." },
      bookHeatmap: { label: "Heatmap de book", desc: "Liquidez parada REAL do order book (Binance+Coinbase+OKX somadas) ao longo do tempo, estilo Bookmap: escala térmica única — quanto mais quente/claro, maior a liquidez parada ali. O lado vem da posição: abaixo do preço = compra (suporte), acima = venda (resistência). ≠ do heatmap de liquidação (estimado): aqui é ordem limite de verdade. Cobre as últimas 48h (1 coluna ≈ 2 min); em TF alto (1D+) vira uma faixa recente — veja melhor em 15M/1H/4H." },
    },
  },
  book: {
    title: "Pressão do book (bid × ask)",
    unavailable: "Indisponível neste ciclo.",
    sideBuyer: "Book mais comprador",
    sideSeller: "Book mais vendedor",
    sideBalanced: "Book equilibrado",
    buy: "compra",
    sell: "venda",
    band2pct: "±2% do preço",
    near: "Perto (±0,5%):",
    buyerWord: "comprador",
    sellerWord: "vendedor",
    balancedWord: "equilibrado",
    institutional: "Institucional",
    source: "Fonte:",
  },
  whaleWalls: {
    title: "Paredes fortes (baleias)",
    tip: "Soma só as ordens GRANDES do book (baleias, acima do filtro do ativo), ponderadas pela proximidade do preço: suporte (compra, abaixo) × resistência (venda, acima). Diferente da pressão, que soma todo o book. O sinal forte é quando as duas DIVERGEM. SPOOFÁVEL — inclina as chances, não prevê.",
    support: "suporte",
    resistance: "resist.",
    balanced: "equilibrado",
    weighted: "ponderado por proximidade",
    unavailable: "Sem paredes relevantes neste ciclo.",
    divBuy: "⚠ baleias defendendo o suporte, mas a pressão geral está vendedora",
    divSell: "⚠ baleias montando teto, mas a pressão geral está compradora",
    aligned: "paredes e pressão concordam",
  },
  notif: {
    title: "Notificações",
    markRead: "Marcar lidas",
    clear: "Limpar",
    empty: "Nenhuma notificação ainda. Crie alertas para ser avisado aqui.",
    pushBlocked: "Notificações bloqueadas no navegador.",
    pushActive: "Notificações do navegador ativas.",
    pushOffer: "Receber alertas no navegador (mesmo com o app fechado).",
    disable: "Desativar",
    enable: "Ativar",
  },
  news: { general: "Notícias gerais do mercado", forAsset: "Notícias · {asset}", none: "Sem notícias recentes.", moreOnPro: "Mais notícias no plano Pro." },
  strips: {
    awaiting: "aguardando coleta",
    fundingCexTitle: "Funding CEX (faixa temporal)",
    fundingTip: "Funding dos perpétuos (agregado de exchanges, intervalo de 8h). Acima do zero (verde) = comprados pagando vendidos (otimismo alavancado); abaixo (vermelho) = vendidos pagando. Faixas longas no mesmo lado = posicionamento esticado. O anualizado é o custo de carregar a posição por 1 ano.",
    current: "atual",
    perYear: "/ano",
    liqRealizedShort: "Liquidações realizadas (5 min)",
    liqRealizedFull: "Liquidações realizadas (5 min) · últimas ~12h",
    shorts: "shorts",
    longs: "longs",
    cvdRetail: "CVD do varejo",
    fundingLabel: "Funding",
  },
  macroGlobal: {
    title: "🌊 Liquidez & Macro Global",
    tip: "A 'maré' que move o ciclo: liquidez líquida do Fed (balanço − reverse repo − conta do Tesouro) e condições financeiras. Maré subindo + condições frouxas = vento a favor de ativos de risco.",
    riskOn: "Risk-on · vento a favor",
    riskOff: "Risk-off · vento contra",
    neutral: "Neutro",
    fedNetLiq: "Liquidez líquida do Fed",
    triPrefix: "US$ ",
    triSuffix: " tri",
    tideRising: "subindo",
    tideFalling: "caindo",
    tide: "maré",
    conditions: "Condições (NFCI)",
    condLoose: "frouxas · risk-on",
    condTight: "apertadas · risk-off",
    hySpread: "HY spread",
    hyTight: "apertado · apetite",
    hyWide: "abrindo · cautela",
    realYield: "Juros reais 10Y",
    costOfMoney: "custo do dinheiro",
    curve: "Curva 2s10s",
    curveInverted: "invertida · alerta",
    curveNormal: "normal",
    m2sub: "massa monetária",
    footer: "Fonte: FRED (Fed de St. Louis) · net liquidity = balanço do Fed − reverse repo − conta do Tesouro · atualiza diariamente.",
  },
  onchain: {
    title: "On-chain · valor (ciclo)",
    tip: "Métricas on-chain de valuation do BTC (bitcoin-data.com, grátis) — posição no ciclo de mercado. MVRV-Z = preço vs custo médio da rede; SOPR <1 = quem move moedas está no prejuízo; NUPL = lucro/prejuízo não realizado; Puell = receita dos mineradores vs média. Atualiza diariamente. Educacional.",
    cyclePos: "Posição no ciclo",
    cycleBottom: "Fundo / descontado",
    cycleCheap: "Barato",
    cycleNeutral: "Neutro",
    cycleHot: "Aquecido",
    cycleTop: "Euforia / topo",
    zCapitulation: "capitulação",
    zDiscount: "descontado",
    zNeutral: "neutro",
    zElevated: "elevado",
    zEuphoria: "euforia",
    realizedTitle: "BTC vs preço realizado",
    reserveRisk: "Reserve Risk",
    networkTitle: "Saúde da rede BTC",
    hashrate: "Hashrate",
    nextDiff: "Próx. ajuste",
    mempool: "Mempool",
    feeFast: "Taxa rápida",
    inProfit: "holders no lucro",
    atLoss: "holders no prejuízo",
    footer: "Fonte: bitcoin-data.com (on-chain grátis) · market-wide (BTC) · atualiza ~diário. Educacional — não é recomendação.",
  },
  gammaChart: {
    partialHist: "histórico parcial: {label} (enche até {days}d)",
    accumulating: "Acumulando histórico de níveis (a cada 5 min) — janela de {days} dias.",
    regimePos: "regime + (calmo)",
    regimeNeg: "regime − (volátil)",
    legendNote: "· fundo = spot vs Zero Gamma · ↑/↓ = parede fora da janela (valor real ao lado)",
    zeroPoint: "Ponto Zero",
    noProfile: "Sem perfil de opções suficiente para desenhar a curva.",
    loadingOi: "Carregando open interest…",
    noOi: "Sem dados de open interest por strike.",
    oiIntro1: "Contratos",
    oiIntroRaw: "crus",
    oiIntro2: "em aberto (vencimento mais próximo) —",
    oiIntroTwoBars: "duas barras por strike",
    oiIntro3: ": put à esquerda (suporte) e call à direita (resistência), cada uma com a quantidade. Diferente do GEX, que pondera pelo gama e condensa cada strike numa barra só. Cor cheia =",
    oiIntroWall: "muro de OI",
    oiIntro4: " — um muro é barreira (suporte/resistência), não ímã: o preço resiste a atravessá-lo e, se romper, o movimento pode acelerar. Ímã de verdade é o Max Pain, perto do vencimento.",
    puts: "Puts",
    calls: "Calls",
    wall: "muro",
    expiryPrefix: "venc.",
    oiInContracts: "OI em contratos",
    readRight: "direita do Ponto Zero",
    readLong: "os dealers ficam comprados em gamma",
    readRightTail: "(vendem altas/compram quedas → preço tende a grudar);",
    readLeft: "esquerda",
    readShort: "ficam vendidos",
    readTail: "(movimentos amplificam). O preço costuma ser puxado para as paredes (Put/Call) e para o Max Pain.",
    readAt: "À",
    readToLeft: "à",
  },
  disclaimer:
    "As informações e leituras desta plataforma têm caráter educacional e informativo. Não constituem recomendação de compra ou venda, aconselhamento financeiro ou de investimento. Quem decide é sempre você.",
  gauge: { noData: "sem dado" },
  errorBoundary: { brokeIn: "Algo quebrou ao renderizar {label}.", thisSection: "esta seção", retry: "Tentar de novo" },
  aiButton: { cta: "O que está acontecendo?", unlimited: "ilimitado", todayOf: "{used} de {limit} hoje" },
  placeholder: {
    titleSuffix: "Módulo {label} — em construção",
    comingSoon: "Em breve:",
    correspondingPlan: "Será liberado com o plano correspondente.",
    adminPreview: "Você está vendo este preview por ser administrador.",
    backToCrypto: "Voltar ao módulo Crypto",
  },
  accountDrawer: {
    welcomeTitle: "Bem-vindo ao OrbeView 🎉",
    accountTitle: "Sua conta",
    welcomeSub: "Finalize seu cadastro e escolha seu plano.",
    accountSub: "Plano, assinatura e dados do perfil.",
    closeAria: "Fechar (ESC)",
    plan: "Plano",
    chosePlan: "Você escolheu o {plan} — é só confirmar abaixo.",
    monthly: "Mensal",
    annualOff: "Anual −30%",
    perYear: "/ano",
    perMonth: "/mês",
    redirecting: "Redirecionando…",
    subscribe: "Assinar {plan}",
    payNote: "Pix, boleto ou cartão (Asaas) · cancele quando quiser",
    changePlan: "Trocar de plano",
    downgradeConfirmPre: "Rebaixar para o",
    downgradeConfirmMid: "? Acesso garantido até",
    downgradeConfirmPost: ", sem nova cobrança.",
    yesDowngrade: "Sim, rebaixar",
    back: "Voltar",
    downgrade: "Rebaixar para o Free",
    profile: "Perfil",
    fullName: "Nome completo",
    namePlaceholder: "Seu nome",
    phone: "Telefone / WhatsApp",
    cpf: "CPF",
    cpfNote: "Necessário para pagamento em reais (Pix/cartão).",
    email: "E-mail",
    saving: "Salvando…",
    save: "Salvar",
    saveError: "Não foi possível salvar.",
    saved: "Perfil atualizado ✓",
    cpfRequired: "Informe seu CPF no perfil abaixo e tente de novo.",
    checkoutUnavailable: "checkout indisponível",
    checkoutFail: "Falha ao iniciar o checkout.",
    cancelFail: "Falha ao cancelar.",
    downgradeOk: "Você volta ao Free ao fim do período já pago — o acesso fica garantido até lá.",
    statusNoRenew: "Não renova. Acesso até {date}.",
    statusPastDue: "Pagamento em atraso — regularize para manter o acesso.",
    statusRenews: "Renova automaticamente em {date}.",
    statusFree: "Você está no plano gratuito.",
    tagPopular: "Mais popular",
    proFeatures: ["20 ativos · dados a cada 5 min", "Gamma, volatilidade e camadas no gráfico", "Alertas e relatórios diários por IA"],
    expertFeatures: ["Tudo do Pro", "Smart Money & On-chain · 100 moedas", "Arquivo completo · 30 análises de IA/dia"],
  },
  pages: {
    backCockpit: "← Voltar ao cockpit",
    notFound: {
      title: "Página não encontrada",
      sub: "O endereço que você acessou não existe ou foi movido.",
      back: "Voltar ao início",
    },
    alerts: {
      title: "Alertas",
      sub: "Você é avisado no sistema (sino + pop-up na tela) e, se permitir, por notificação do navegador — mesmo com o app fechado.",
      metricPrice: "Preço (US$)",
      metricFunding: "Funding (%)",
      metricRegime: "Regime de gamma",
      gatedPre: "Alertas estão disponíveis nos planos ",
      gatedAnd: " e ",
      gatedPost: ". ",
      seePlans: "Ver planos →",
      asset: "Ativo",
      metric: "Métrica",
      whenRegime: "Quando o regime virar",
      regimeNeg: "Negativo (movimentos amplificados)",
      regimePos: "Positivo (volatilidade amortecida)",
      condition: "Condição",
      above: "acima de",
      below: "abaixo de",
      valuePct: "Valor (%)",
      valueUsd: "Valor (US$)",
      create: "Criar alerta",
      yourAlerts: "Seus alertas",
      none: "Nenhum alerta criado.",
      delete: "Excluir",
      createFail: "Falha ao criar alerta",
    },
    analysis: {
      title: "O que está acontecendo",
      generate: "Gerar análise",
      generating: "Gerando…",
      unlimited: "Plano com análises ilimitadas",
      countOf: "Análise {used} de {limit} hoje",
      noneA: "Nenhuma análise gerada ainda. Clique em ",
      noneB: " para o copiloto narrar o cenário de {asset}.",
      aiAt: "Análise de IA · {date}",
      genFail: "Falha ao gerar análise",
    },
    b3Analysis: { noneB: " para a IA narrar o cenário de {asset} (fundamentos, dividendos, técnico e macro)." },
    newsletter: {
      subA: "A leitura semanal do mercado — gamma, fluxo e liquidez traduzidos. Edições completas liberadas para ",
      subStrong: "qualquer conta",
      subB: "; gerada automaticamente pela IA toda semana.",
      empty: "Nenhuma edição publicada ainda — em breve.",
      read: "Ler edição →",
    },
    newsletterEdition: {
      notFound: "Edição não encontrada.",
      seeAll: "Ver todas as edições →",
      fullTitle: "Edição completa no plano {tier}",
      fullSub: "Sua leitura completa libera no plano {tier} — junto com o cockpit completo, Smart Money e o arquivo da newsletter.",
      subscribe: "Assinar {tier}",
      allEditions: "← Todas as edições",
    },
  },
};

const EN: Dict = {
  common: { loading: "Loading…", soon: "Soon", manage: "manage", retry: "Try again" },
  header: {
    newsletter: "Newsletter",
    alerts: "Alerts",
    admin: "Admin",
    loadingPlan: "Loading plan…",
    planError: "Couldn't load your plan. Check your connection (extensions/adblock may block it) and try again.",
  },
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
    favorite: "Add to favorites (get market-read change alerts)",
    unfavorite: "Remove from favorites",
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
  locked: { availableOn: "Available on the {plan} plan.", unlock: "Unlock with {plan} →", viewOn: "View on {plan} →" },
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
    onchainSoon: "The on-chain layer above uses free data (token unlocks, stablecoin liquidity, network activity). On-chain valuation metrics (MVRV, SOPR, exchange netflow) require a paid source and are out of scope for now.",
    cbPremTitle: "Institutional flow (Coinbase premium)",
    cbPremTip: "Price gap of Coinbase (US institutions) vs Binance (global retail). Positive premium = institutions buying with more appetite; negative = selling. A real, free institutional-flow signal. Only on Coinbase-listed coins.",
    cbPremBuy: "institutions buying",
    cbPremSell: "institutions selling",
    cbPremFlat: "balanced",
    subLoading: "loading…",
    rangePos: "Range position",
    zonePremium: "Premium",
    zoneDiscount: "Discount",
    zoneEquilibrium: "Equilibrium",
    obUp: "up",
    obDown: "down",
    heatmapTitle: "Liquidation heatmap · estimate (leverage model)",
    strongHigh: "Strong High (defended)",
    weakHigh: "Weak High (likely to break)",
    strongLow: "Strong Low (defended)",
    weakLow: "Weak Low (likely to break)",
    sweptTag: "swept",
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
      swings: { label: "HH/HL/LH/LL", help: "Swing pivot labels: HH higher high · HL higher low (uptrend) · LH lower high · LL lower low (downtrend). They make structure readable on the chart." },
      prevLevels: { label: "Prev D-W-M H/L", help: "PREVIOUS day (PDH/PDL, blue), week (PWH/PWL, indigo) and month (PMH/PML, teal) highs and lows — classic liquidity magnets: price tends to seek and react at them. An SMC zone sitting on one of these levels is stronger (shows up in confluence)." },
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
  tf: { m15: "15m", h1: "1h", h4: "4h", d1: "1D", w1: "1W", mo1: "1M" },
  chartType: { candles: "Candles", bars: "Bars", line: "Line", area: "Area" },
  layerToggles: {
    title: "Layers:",
    availableOn: "available on {tier}",
    items: {
      gex: { label: "Options (Call/Put Wall)", desc: "Strikes with the most gamma (GEX): Call Wall = ceiling/resistance, Put Wall = floor/support where dealers tend to hold price." },
      zeroGamma: { label: "Zero Gamma", desc: "Level where dealer gamma flips from positive to negative. Above: dealers dampen (calmer market). Below: they amplify (more volatile)." },
      maxPain: { label: "Max Pain", desc: "Price where the most options expire worthless. Near expiry, price tends to gravitate here (magnet effect)." },
      volumeProfile: { label: "Volume Profile (POC)", desc: "POC = price with the most traded volume in the period (liquidity magnet); VA High/Low bound 70% of volume." },
      vwap: { label: "VWAP D-W-M", desc: "Anchored VWAP (volume-weighted average price) for the day, week, and month — the benchmark institutional desks measure execution against. Price above = buyers in control since the anchor; the level attracts retests and reactions. Anchors adapt to the timeframe (intraday: day+week; daily: week+month)." },
      orderbookWalls: { label: "Order-book walls", desc: "Large resting orders (Binance+Coinbase): buy walls = support, sell walls = resistance." },
      funding: { label: "Funding", desc: "Perpetuals funding rate: positive = longs pay (leveraged optimism), negative = shorts pay." },
      cvd: { label: "CVD", desc: "Cumulative Volume Delta: net aggressive flow (market buys − market sells). Retail (Binance+OKX) vs institutional (Coinbase)." },
      bookPressure: { label: "Order-book pressure", desc: "Order-book pressure over time: resting bid − ask liquidity near price (±2%). Green = buy-side book (more bids), red = sell-side. Unlike CVD (executed flow) — the strong read is to cross the two." },
      liquidations: { label: "Liquidations (heatmap + bars)", desc: "Estimated heatmap of liquidation zones (magnet zones, leverage model) + realized-liquidation bars below." },
      bookHeatmap: { label: "Book heatmap", desc: "REAL resting order-book liquidity (Binance+Coinbase+OKX summed) over time, Bookmap-style: a single thermal scale — the hotter/brighter, the more resting liquidity there. Side comes from position: below price = bids (support), above = asks (resistance). ≠ the liquidation heatmap (estimated): this is actual limit orders. Covers the last 48h (1 column ≈ 2 min); on high TF (1D+) it's a recent band — best seen on 15M/1H/4H." },
    },
  },
  book: {
    title: "Order-book pressure (bid × ask)",
    unavailable: "Unavailable this cycle.",
    sideBuyer: "Buy-leaning book",
    sideSeller: "Sell-leaning book",
    sideBalanced: "Balanced book",
    buy: "buy",
    sell: "sell",
    band2pct: "±2% of price",
    near: "Near (±0.5%):",
    buyerWord: "buy-side",
    sellerWord: "sell-side",
    balancedWord: "balanced",
    institutional: "Institutional",
    source: "Source:",
  },
  whaleWalls: {
    title: "Strong walls (whales)",
    tip: "Sums only the LARGE resting orders (whales, above the per-asset filter), weighted by how close they are to price: support (bids below) × resistance (asks above). Unlike pressure, which sums the whole book. The strong signal is when the two DIVERGE. SPOOFABLE — tilts the odds, not a prediction.",
    support: "support",
    resistance: "resist.",
    balanced: "balanced",
    weighted: "proximity-weighted",
    unavailable: "No relevant walls this cycle.",
    divBuy: "⚠ whales defending support, but overall pressure is selling",
    divSell: "⚠ whales building a ceiling, but overall pressure is buying",
    aligned: "walls and pressure agree",
  },
  notif: {
    title: "Notifications",
    markRead: "Mark read",
    clear: "Clear",
    empty: "No notifications yet. Create alerts to be notified here.",
    pushBlocked: "Notifications blocked in the browser.",
    pushActive: "Browser notifications active.",
    pushOffer: "Get alerts in the browser (even with the app closed).",
    disable: "Disable",
    enable: "Enable",
  },
  news: { general: "General market news", forAsset: "News · {asset}", none: "No recent news.", moreOnPro: "More news on the Pro plan." },
  strips: {
    awaiting: "awaiting data",
    fundingCexTitle: "CEX funding (over time)",
    fundingTip: "Perpetuals funding (aggregated across exchanges, 8h interval). Above zero (green) = longs paying shorts (leveraged optimism); below (red) = shorts paying. Long stretches on the same side = stretched positioning. The annualized value is the cost of carrying the position for 1 year.",
    current: "now",
    perYear: "/yr",
    liqRealizedShort: "Realized liquidations (5 min)",
    liqRealizedFull: "Realized liquidations (5 min) · last ~12h",
    shorts: "shorts",
    longs: "longs",
    cvdRetail: "Retail CVD",
    fundingLabel: "Funding",
  },
  macroGlobal: {
    title: "🌊 Liquidity & Global Macro",
    tip: "The 'tide' that drives the cycle: Fed net liquidity (balance sheet − reverse repo − Treasury account) and financial conditions. Rising tide + loose conditions = a tailwind for risk assets.",
    riskOn: "Risk-on · tailwind",
    riskOff: "Risk-off · headwind",
    neutral: "Neutral",
    fedNetLiq: "Fed net liquidity",
    triPrefix: "$",
    triSuffix: "T",
    tideRising: "rising",
    tideFalling: "falling",
    tide: "tide",
    conditions: "Conditions (NFCI)",
    condLoose: "loose · risk-on",
    condTight: "tight · risk-off",
    hySpread: "HY spread",
    hyTight: "tight · appetite",
    hyWide: "widening · caution",
    realYield: "Real yield 10Y",
    costOfMoney: "cost of money",
    curve: "2s10s curve",
    curveInverted: "inverted · warning",
    curveNormal: "normal",
    m2sub: "money supply",
    footer: "Source: FRED (St. Louis Fed) · net liquidity = Fed balance sheet − reverse repo − Treasury account · updates daily.",
  },
  onchain: {
    title: "On-chain · value (cycle)",
    tip: "On-chain BTC valuation metrics (bitcoin-data.com, free) — market-cycle position. MVRV-Z = price vs network cost basis; SOPR <1 = coins moving at a loss; NUPL = unrealized profit/loss; Puell = miner revenue vs average. Updates daily. Educational.",
    cyclePos: "Cycle position",
    cycleBottom: "Bottom / undervalued",
    cycleCheap: "Cheap",
    cycleNeutral: "Neutral",
    cycleHot: "Hot",
    cycleTop: "Euphoria / top",
    zCapitulation: "capitulation",
    zDiscount: "discounted",
    zNeutral: "neutral",
    zElevated: "elevated",
    zEuphoria: "euphoria",
    realizedTitle: "BTC vs realized price",
    reserveRisk: "Reserve Risk",
    networkTitle: "BTC network health",
    hashrate: "Hashrate",
    nextDiff: "Next adjust.",
    mempool: "Mempool",
    feeFast: "Fast fee",
    inProfit: "holders in profit",
    atLoss: "holders at a loss",
    footer: "Source: bitcoin-data.com (free on-chain) · market-wide (BTC) · updates ~daily. Educational — not advice.",
  },
  gammaChart: {
    partialHist: "partial history: {label} (fills to {days}d)",
    accumulating: "Accumulating level history (every 5 min) — {days}-day window.",
    regimePos: "regime + (calm)",
    regimeNeg: "regime − (volatile)",
    legendNote: "· background = spot vs Zero Gamma · ↑/↓ = wall outside the window (real value alongside)",
    zeroPoint: "Zero Point",
    noProfile: "Not enough options profile to draw the curve.",
    loadingOi: "Loading open interest…",
    noOi: "No open interest data by strike.",
    oiIntro1: "Raw open",
    oiIntroRaw: "contracts",
    oiIntro2: "(nearest expiry) —",
    oiIntroTwoBars: "two bars per strike",
    oiIntro3: ": put on the left (support) and call on the right (resistance), each with its size. Unlike GEX, which weights by gamma and condenses each strike into a single bar. Solid color =",
    oiIntroWall: "OI wall",
    oiIntro4: " — a wall is a barrier (support/resistance), not a magnet: price resists crossing it and, if it breaks, the move can accelerate. The real magnet is Max Pain, near expiry.",
    puts: "Puts",
    calls: "Calls",
    wall: "wall",
    expiryPrefix: "exp.",
    oiInContracts: "OI in contracts",
    readRight: "right of the Zero Point",
    readLong: "dealers are long gamma",
    readRightTail: "(sell rallies/buy dips → price tends to stick);",
    readLeft: "left",
    readShort: "they're short",
    readTail: "(moves amplify). Price tends to be pulled toward the walls (Put/Call) and the Max Pain.",
    readAt: "To the",
    readToLeft: "to the",
  },
  disclaimer:
    "The information and readings on this platform are educational and informational. They do not constitute a buy or sell recommendation, financial advice, or investment advice. You always make the decision.",
  gauge: { noData: "no data" },
  errorBoundary: { brokeIn: "Something broke while rendering {label}.", thisSection: "this section", retry: "Try again" },
  aiButton: { cta: "What's going on?", unlimited: "unlimited", todayOf: "{used} of {limit} today" },
  placeholder: {
    titleSuffix: "{label} module — under construction",
    comingSoon: "Coming soon:",
    correspondingPlan: "Unlocks with the corresponding plan.",
    adminPreview: "You're seeing this preview because you're an administrator.",
    backToCrypto: "Back to the Crypto module",
  },
  accountDrawer: {
    welcomeTitle: "Welcome to OrbeView 🎉",
    accountTitle: "Your account",
    welcomeSub: "Finish your sign-up and choose your plan.",
    accountSub: "Plan, subscription, and profile details.",
    closeAria: "Close (ESC)",
    plan: "Plan",
    chosePlan: "You chose {plan} — just confirm below.",
    monthly: "Monthly",
    annualOff: "Annual −30%",
    perYear: "/yr",
    perMonth: "/mo",
    redirecting: "Redirecting…",
    subscribe: "Subscribe to {plan}",
    payNote: "Secure card payment (Paddle) · cancel anytime",
    changePlan: "Change plan",
    downgradeConfirmPre: "Downgrade to",
    downgradeConfirmMid: "? Access guaranteed until",
    downgradeConfirmPost: ", with no new charge.",
    yesDowngrade: "Yes, downgrade",
    back: "Back",
    downgrade: "Downgrade to Free",
    profile: "Profile",
    fullName: "Full name",
    namePlaceholder: "Your name",
    phone: "Phone / WhatsApp",
    cpf: "CPF",
    cpfNote: "Required for payment in reais (Pix/card).",
    email: "Email",
    saving: "Saving…",
    save: "Save",
    saveError: "Couldn't save.",
    saved: "Profile updated ✓",
    cpfRequired: "Enter your CPF in the profile below and try again.",
    checkoutUnavailable: "checkout unavailable",
    checkoutFail: "Failed to start checkout.",
    cancelFail: "Failed to cancel.",
    downgradeOk: "You return to Free at the end of the period you've already paid — access is guaranteed until then.",
    statusNoRenew: "Won't renew. Access until {date}.",
    statusPastDue: "Payment overdue — settle it to keep access.",
    statusRenews: "Renews automatically on {date}.",
    statusFree: "You're on the free plan.",
    tagPopular: "Most popular",
    proFeatures: ["20 assets · data every 5 min", "Gamma, volatility, and chart layers", "AI alerts and daily reports"],
    expertFeatures: ["Everything in Pro", "Smart Money & On-chain · 100 coins", "Full archive · 30 AI analyses/day"],
  },
  pages: {
    backCockpit: "← Back to cockpit",
    notFound: {
      title: "Page not found",
      sub: "The address you went to doesn't exist or has moved.",
      back: "Back home",
    },
    alerts: {
      title: "Alerts",
      sub: "You're notified in-app (bell + on-screen pop-up) and, if you allow it, by browser notification — even with the app closed.",
      metricPrice: "Price (US$)",
      metricFunding: "Funding (%)",
      metricRegime: "Gamma regime",
      gatedPre: "Alerts are available on the ",
      gatedAnd: " and ",
      gatedPost: " plans. ",
      seePlans: "See plans →",
      asset: "Asset",
      metric: "Metric",
      whenRegime: "When the regime flips to",
      regimeNeg: "Negative (amplified moves)",
      regimePos: "Positive (dampened volatility)",
      condition: "Condition",
      above: "above",
      below: "below",
      valuePct: "Value (%)",
      valueUsd: "Value (US$)",
      create: "Create alert",
      yourAlerts: "Your alerts",
      none: "No alerts created.",
      delete: "Delete",
      createFail: "Failed to create alert",
    },
    analysis: {
      title: "What's going on",
      generate: "Generate analysis",
      generating: "Generating…",
      unlimited: "Plan with unlimited analyses",
      countOf: "Analysis {used} of {limit} today",
      noneA: "No analysis generated yet. Click ",
      noneB: " for the copilot to narrate the {asset} scenario.",
      aiAt: "AI analysis · {date}",
      genFail: "Failed to generate analysis",
    },
    b3Analysis: { noneB: " for the AI to narrate the {asset} scenario (fundamentals, dividends, technicals, and macro)." },
    newsletter: {
      subA: "The market's weekly read — gamma, flow, and liquidity decoded. Full editions unlocked for ",
      subStrong: "any account",
      subB: "; generated automatically by AI every week.",
      empty: "No editions published yet — coming soon.",
      read: "Read edition →",
    },
    newsletterEdition: {
      notFound: "Edition not found.",
      seeAll: "See all editions →",
      fullTitle: "Full edition on the {tier} plan",
      fullSub: "Your full read unlocks on the {tier} plan — along with the complete cockpit, Smart Money, and the newsletter archive.",
      subscribe: "Subscribe to {tier}",
      allEditions: "← All editions",
    },
  },
};

const MESSAGES: Record<Locale, Dict> = { pt: PT, en: EN };

/** Hook de tradução: `const { t, locale, setLocale } = useT()`. */
export function useT() {
  const { locale, setLocale, isEn } = useLocale();
  return { t: MESSAGES[locale], locale, setLocale, isEn };
}

/** Dicionário no idioma atual fora de componente React (helpers puros, class
 *  components). Quem renderiza reage via useT/useLocale. */
export function getT(): Dict {
  return MESSAGES[getLocale()];
}
