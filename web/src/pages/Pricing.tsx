import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useLocale, type Locale } from "../hooks/useLocale";
import { openPaddleCheckout, paddleConfigured } from "../lib/paddle";
import { supabase } from "../lib/supabase";
import LangToggle from "../components/ui/LangToggle";

type Slug = "free" | "pro" | "expert";
type Cycle = "monthly" | "annual";

// Desconto de lançamento do plano anual. MANTER em sincronia com asaas-checkout
// (ANNUAL_DISCOUNT) — o preço exibido aqui tem que ser o preço cobrado lá.
const ANNUAL_DISCOUNT = 0.30;

interface DbPlan {
  slug: Slug;
  price_cents: number;
  price_usd_cents: number;
  paddle_price_id: string | null;
}

// Copy de marketing por idioma (preço vem do banco). Recursos refletem o gating real.
const COPY: Record<Locale, {
  title: string; subtitle: string; back: string;
  perMonth: string; perYear: string; freePrice: string;
  monthly: string; annual: string; annualBadge: string; save: string; perMonthEq: string;
  launch: string; launchNote: string; cancelAnytime: string;
  freeBtn: string; subscribe: string; redirecting: string; usdSoon: string; payNote: string;
  plans: Record<Slug, { name: string; tag?: string; features: string[] }>;
}> = {
  pt: {
    title: "Planos",
    subtitle: "O cockpit completo de decisões do trader.",
    back: "← Voltar",
    perMonth: "/mês",
    perYear: "/ano",
    freePrice: "Grátis",
    monthly: "Mensal",
    annual: "Anual",
    annualBadge: "30% OFF",
    save: "economize",
    perMonthEq: "equivale a",
    launch: "🚀 Lançamento — 30% OFF no plano anual",
    launchNote: "Desconto de lançamento por tempo limitado — garanta esse valor agora.",
    cancelAnytime: "cancele quando quiser",
    freeBtn: "Plano gratuito",
    subscribe: "Assinar",
    redirecting: "Redirecionando…",
    usdSoon: "Pagamento em dólar (Paddle) em breve.",
    payNote: "Pagamento via Pix e cartão (Asaas)",
    plans: {
      free: { name: "Free", features: ["Somente Bitcoin (BTC)", "Preço + Fear & Greed atualizados a cada 1h", "1 análise de IA por dia", "Sem alertas e sem histórico"] },
      pro: { name: "Pro", tag: "Mais popular", features: ["20 ativos em tempo real (5 min)", "Gamma, opções e volatilidade · Macro & Correlações completo", "Cockpit de varejo: funding, CVD, long/short, liquidações e squeeze", "Camadas de opções no gráfico · 10 análises de IA/dia", "Alertas in-app e push · histórico de 30 dias"] },
      expert: { name: "Expert", features: ["Tudo do Pro", "Leitura do Mercado: viés, convicção e alvos numa síntese só (exclusivo)", "Institucional × varejo: quem compra à vista vs quem alavanca (ETFs, opções e liquidez do book)", "Camadas avançadas no gráfico: CVD, funding, pressão do book e heatmap de liquidações", "Smart Money & On-chain · 100 moedas", "Relatórios diários · 30 análises de IA/dia · histórico completo"] },
    },
  },
  en: {
    title: "Pricing",
    subtitle: "The trader's full decision cockpit.",
    back: "← Back",
    perMonth: "/mo",
    perYear: "/yr",
    freePrice: "Free",
    monthly: "Monthly",
    annual: "Annual",
    annualBadge: "30% OFF",
    save: "save",
    perMonthEq: "that's",
    launch: "🚀 Launch — 30% OFF on the annual plan",
    launchNote: "Limited-time launch discount — lock in this rate now.",
    cancelAnytime: "cancel anytime",
    freeBtn: "Free plan",
    subscribe: "Subscribe",
    redirecting: "Redirecting…",
    usdSoon: "USD checkout (Paddle) coming soon.",
    payNote: "Billed in USD via Paddle",
    plans: {
      free: { name: "Free", features: ["Bitcoin (BTC) only", "Price + Fear & Greed, updated hourly", "1 AI analysis per day", "No alerts, no history"] },
      pro: { name: "Pro", tag: "Most popular", features: ["20 assets in real time (5 min)", "Gamma, options & volatility · full Macro & Correlations", "Retail cockpit: funding, CVD, long/short, liquidations & squeeze", "Options layers on the chart · 10 AI analyses/day", "In-app & push alerts · 30-day history"] },
      expert: { name: "Expert", features: ["Everything in Pro", "Market Read: bias, conviction & liquidity targets in one synthesis (exclusive)", "Institutional vs retail: spot buyers vs leverage (ETFs, options & book liquidity)", "Advanced chart layers: CVD, funding, book pressure & liquidation heatmap", "Smart Money & On-chain · 100 coins", "Daily reports · 30 AI analyses/day · full history"] },
    },
  },
};

const ORDER: Slug[] = ["free", "pro", "expert"];

export default function Pricing() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const { locale, isEn } = useLocale();
  const t = COPY[locale];
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select("slug, price_cents, price_usd_cents, paddle_price_id")
      .then(({ data }) => setPlans((data as DbPlan[]) ?? []));
  }, []);

  const fmt = (cents: number) => (isEn ? `$${Math.round(cents / 100)}` : `R$ ${Math.round(cents / 100)}`);

  // Bloco de preço por plano/ciclo. Anual = 12 meses com 30% OFF (arredonda para real
  // inteiro — igual ao charge no asaas-checkout).
  function priceBlock(slug: Slug) {
    const p = plans.find((x) => x.slug === slug);
    const m = isEn ? p?.price_usd_cents ?? 0 : p?.price_cents ?? 0;
    if (slug === "free" || !m) return { main: t.freePrice, unit: "", annual: false, eq: "", struck: "", save: "" };
    if (cycle === "monthly") return { main: fmt(m), unit: t.perMonth, annual: false, eq: "", struck: "", save: "" };
    const annualReais = Math.round((m / 100) * 12 * (1 - ANNUAL_DISCOUNT));
    const annualCents = annualReais * 100;
    return {
      main: fmt(annualCents),
      unit: t.perYear,
      annual: true,
      eq: `${t.perMonthEq} ${fmt(Math.round(annualCents / 12))}${t.perMonth}`,
      struck: fmt(m * 12),
      save: `${t.save} ${fmt(m * 12 - annualCents)}`,
    };
  }

  async function subscribe(slug: "pro" | "expert") {
    if (!session) {
      navigate("/login");
      return;
    }
    setError(null);
    setBusy(slug);
    try {
      if (isEn) {
        const plan = plans.find((p) => p.slug === slug);
        if (!paddleConfigured() || !plan?.paddle_price_id) throw new Error(t.usdSoon);
        await openPaddleCheckout({ priceId: plan.paddle_price_id, email: user?.email, userId: user!.id });
      } else {
        const { data, error } = await supabase.functions.invoke("asaas-checkout", { body: { plan_slug: slug, cycle } });
        if (error) throw error;
        if (data?.url) window.location.href = data.url as string;
        else throw new Error(data?.error || "checkout indisponível");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar checkout");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">{t.back}</Link>
        <LangToggle />
      </div>

      {/* Cabeçalho */}
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {t.launch}
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t.title}</h1>
        <p className="mt-2 text-muted-foreground">{t.subtitle}</p>
      </div>

      {/* Alternador Mensal / Anual */}
      <div className="mt-7 flex justify-center">
        <div className="inline-flex items-center rounded-full border border-border bg-card p-1 dark:bg-card/60">
          {(["monthly", "annual"] as const).map((cy) => {
            const on = cycle === cy;
            return (
              <button
                key={cy}
                onClick={() => setCycle(cy)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${on ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                {cy === "monthly" ? t.monthly : t.annual}
                {cy === "annual" && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-primary-foreground/20 text-primary-foreground" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>
                    {t.annualBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards */}
      <div className="mt-8 grid items-start gap-5 md:grid-cols-3">
        {ORDER.map((slug) => {
          const c = t.plans[slug];
          const highlight = slug === "pro";
          const pb = priceBlock(slug);
          return (
            <div
              key={slug}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all ${
                highlight
                  ? "border-primary/60 bg-primary/[0.06] shadow-xl shadow-primary/10 md:-translate-y-1.5"
                  : "border-border bg-card dark:bg-card/60"
              }`}
            >
              {c.tag && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                  {c.tag}
                </span>
              )}
              <h2 className="text-lg font-semibold text-foreground">{c.name}</h2>

              {/* Preço */}
              <div className="mt-3 min-h-[72px]">
                <div className="flex items-baseline gap-1.5">
                  <span className="num text-3xl font-bold text-foreground">{pb.main}</span>
                  {pb.unit && <span className="text-sm text-muted-foreground">{pb.unit}</span>}
                </div>
                {pb.annual && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="text-muted-foreground line-through">{pb.struck}</span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-600 dark:text-emerald-400">{pb.save}</span>
                    <span className="w-full text-muted-foreground">{pb.eq}</span>
                  </div>
                )}
              </div>

              {/* Recursos */}
              <ul className="mt-4 flex-1 space-y-2.5 text-sm text-muted-foreground">
                {c.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="mt-px text-emerald-600 dark:text-emerald-400">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {slug === "free" ? (
                <button
                  disabled
                  className="mt-6 w-full cursor-not-allowed rounded-lg border border-border py-2.5 text-sm font-semibold text-muted-foreground"
                >
                  {t.freeBtn}
                </button>
              ) : (
                <button
                  onClick={() => subscribe(slug as "pro" | "expert")}
                  disabled={busy !== null}
                  className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  {busy === slug ? t.redirecting : t.subscribe}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="mt-7 space-y-1 text-center text-xs text-muted-foreground">
        <p>{t.launchNote}</p>
        <p>{t.payNote} · {t.cancelAnytime}</p>
      </div>
    </div>
  );
}
