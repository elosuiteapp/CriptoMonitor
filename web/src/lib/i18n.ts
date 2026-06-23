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
};

const MESSAGES: Record<Locale, Dict> = { pt: PT, en: EN };

/** Hook de tradução: `const { t, locale, setLocale } = useT()`. */
export function useT() {
  const { locale, setLocale, isEn } = useLocale();
  return { t: MESSAGES[locale], locale, setLocale, isEn };
}
