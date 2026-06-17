import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useLocale, type Locale } from "../hooks/useLocale";
import { openPaddleCheckout, paddleConfigured } from "../lib/paddle";
import { supabase } from "../lib/supabase";
import LangToggle from "../components/ui/LangToggle";

type Slug = "free" | "pro" | "expert";

interface DbPlan {
  slug: Slug;
  price_cents: number;
  price_usd_cents: number;
  paddle_price_id: string | null;
}

// Copy de marketing por idioma (preço vem do banco). Recursos refletem o gating real.
const COPY: Record<Locale, {
  title: string; subtitle: string; back: string; per: string;
  freeBtn: string; subscribe: string; redirecting: string; usdSoon: string; payNote: string;
  plans: Record<Slug, { name: string; tag?: string; features: string[] }>;
}> = {
  pt: {
    title: "Planos",
    subtitle: "O cockpit completo de decisões do trader.",
    back: "← Voltar",
    per: "/mês",
    freeBtn: "Plano gratuito",
    subscribe: "Assinar",
    redirecting: "Redirecionando…",
    usdSoon: "Pagamento em dólar (Paddle) em breve.",
    payNote: "Pagamento via Pix e cartão (Asaas).",
    plans: {
      free: { name: "Free", features: ["Apenas BTC", "Preço + Fear & Greed (30 min)", "1 análise de IA por dia", "Sem alertas · sem histórico"] },
      pro: { name: "Pro", tag: "Mais popular", features: ["20 moedas em tempo real (5 min)", "Gamma, funding, CVD, liquidações, volatilidade e macro", "Camadas no gráfico", "10 análises de IA/dia · alertas por e-mail", "Histórico de 30 dias"] },
      expert: { name: "Expert", features: ["Tudo do Pro", "Smart Money & On-chain · 100 moedas", "Unlocks, stablecoins e atividade de rede", "Relatórios diários · 30 análises de IA/dia", "Alertas por e-mail + WhatsApp · histórico completo"] },
    },
  },
  en: {
    title: "Pricing",
    subtitle: "The trader's full decision cockpit.",
    back: "← Back",
    per: "/mo",
    freeBtn: "Free plan",
    subscribe: "Subscribe",
    redirecting: "Redirecting…",
    usdSoon: "USD checkout (Paddle) coming soon.",
    payNote: "Billed in USD via Paddle.",
    plans: {
      free: { name: "Free", features: ["BTC only", "Price + Fear & Greed (30 min)", "1 AI analysis per day", "No alerts · no history"] },
      pro: { name: "Pro", tag: "Most popular", features: ["20 coins in real time (5 min)", "Gamma, funding, CVD, liquidations, volatility & macro", "Chart layers", "10 AI analyses/day · email alerts", "30-day history"] },
      expert: { name: "Expert", features: ["Everything in Pro", "Smart Money & On-chain · 100 coins", "Unlocks, stablecoins & network activity", "Daily reports · 30 AI analyses/day", "Email + WhatsApp alerts · full history"] },
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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("plans")
      .select("slug, price_cents, price_usd_cents, paddle_price_id")
      .then(({ data }) => setPlans((data as DbPlan[]) ?? []));
  }, []);

  const priceLabel = (slug: Slug): string => {
    const p = plans.find((x) => x.slug === slug);
    const cents = isEn ? p?.price_usd_cents ?? 0 : p?.price_cents ?? 0;
    if (!cents) return isEn ? "$0" : "R$ 0";
    const v = cents / 100;
    return isEn ? `$${v.toFixed(0)}` : `R$ ${v.toFixed(0)}`;
  };

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
        const { data, error } = await supabase.functions.invoke("asaas-checkout", { body: { plan_slug: slug } });
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
      <div className="mb-8 text-center">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            {t.back}
          </Link>
          <LangToggle />
        </div>
        <h1 className="mt-2 text-3xl font-bold text-foreground">{t.title}</h1>
        <p className="mt-1 text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((slug) => {
          const c = t.plans[slug];
          const highlight = slug === "pro";
          return (
            <div
              key={slug}
              className={`relative rounded-2xl border p-6 ${highlight ? "border-primary bg-primary/5" : "border-border bg-card dark:bg-card/60"}`}
            >
              {c.tag && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  {c.tag}
                </span>
              )}
              <h2 className="text-lg font-semibold text-foreground">{c.name}</h2>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="num text-2xl font-bold text-foreground">{priceLabel(slug)}</span>
                {slug !== "free" && <span className="text-sm text-muted-foreground">{t.per}</span>}
              </div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {c.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {slug === "free" ? (
                <button
                  disabled
                  className="mt-6 w-full cursor-not-allowed rounded-lg border border-border py-2 text-sm font-semibold text-muted-foreground"
                >
                  {t.freeBtn}
                </button>
              ) : (
                <button
                  onClick={() => subscribe(slug as "pro" | "expert")}
                  disabled={busy !== null}
                  className="mt-6 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy === slug ? t.redirecting : t.subscribe}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <p className="mt-6 text-center text-xs text-muted-foreground">{t.payNote}</p>
    </div>
  );
}
