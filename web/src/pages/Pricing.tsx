import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useLocale, type Locale } from "../hooks/useLocale";
import { openPaddleCheckout, paddleConfigured } from "../lib/paddle";
import { supabase } from "../lib/supabase";
import LangSwitch from "../components/ui/LangSwitch";

type Cycle = "monthly" | "annual";

interface DbPlan {
  slug: string;
  price_cents: number;
  price_annual_cents: number;
  price_usd_cents: number;
  price_usd_annual_cents: number;
  paddle_price_id: string | null;
}

// Planos vendáveis (Free não tem checkout). Modelo POR MÓDULO.
const ORDER = ["free", "mod_crypto", "mod_b3", "mod_forex", "complete"] as const;
type Slug = (typeof ORDER)[number];

const COPY: Record<Locale, {
  title: string; subtitle: string; back: string;
  perMonth: string; perYear: string; freePrice: string;
  monthly: string; annual: string; annualBadge: string; save: string; perMonthEq: string;
  note: string; cancelAnytime: string;
  freeBtn: string; subscribe: string; redirecting: string; usdSoon: string; payNote: string;
  plans: Record<Slug, { name: string; tag?: string; features: string[] }>;
}> = {
  pt: {
    title: "Planos",
    subtitle: "Escolha um mercado ou leve os três no Completo.",
    back: "← Voltar",
    perMonth: "/mês", perYear: "/ano", freePrice: "Grátis",
    monthly: "Mensal", annual: "Anual", annualBadge: "mais barato", save: "economize", perMonthEq: "equivale a",
    note: "O plano anual sai mais barato. Pagamento via Pix e cartão (Asaas).",
    cancelAnytime: "cancele quando quiser",
    freeBtn: "Plano atual", subscribe: "Assinar", redirecting: "Redirecionando…",
    usdSoon: "Pagamento em dólar (Paddle) em breve.", payNote: "Pagamento via Pix e cartão (Asaas)",
    plans: {
      free: { name: "Free", features: ["Vitrine ao vivo dos 3 módulos", "Cripto: cockpit do BTC + camadas (gamma, VP, CVD varejo)", "1 análise de IA por dia", "Newsletter semanal completa"] },
      mod_crypto: { name: "Cripto", features: ["20 ativos em tempo real", "Gamma, opções, volatilidade e Macro", "Fluxo: funding, CVD, long/short e liquidações", "Smart Money & On-chain + institucional × varejo", "Alertas e relatórios de IA"] },
      mod_b3: { name: "B3 · Ações", features: ["Ações e FIIs (IBOV, PETR, VALE…)", "Cockpit, dividendos e fluxo por investidor", "Smart Money (estrutura, zonas, liquidez)", "Leitura do mercado + relatórios de IA"] },
      mod_forex: { name: "Forex", features: ["Pares principais + força de moedas (DXY)", "Smart Money e leitura top-down", "COT/CFTC, carry e sessões", "Macro & correlações + relatórios de IA"] },
      complete: { name: "OrbeView Completo", tag: "Melhor valor", features: ["Cripto + B3 + Forex, tudo liberado", "3 mercados pelo preço de 2", "Toda a profundidade em cada mercado", "IA e alertas em todos os módulos"] },
    },
  },
  en: {
    title: "Pricing",
    subtitle: "Pick one market or get all three in Complete.",
    back: "← Back",
    perMonth: "/mo", perYear: "/yr", freePrice: "Free",
    monthly: "Monthly", annual: "Annual", annualBadge: "cheaper", save: "save", perMonthEq: "that's",
    note: "The annual plan is cheaper. Billed in USD via Paddle.",
    cancelAnytime: "cancel anytime",
    freeBtn: "Current plan", subscribe: "Subscribe", redirecting: "Redirecting…",
    usdSoon: "USD checkout (Paddle) coming soon.", payNote: "Billed in USD via Paddle",
    plans: {
      free: { name: "Free", features: ["Live showcase of all 3 modules", "Crypto: BTC cockpit + layers (gamma, VP, retail CVD)", "1 AI analysis per day", "Full weekly newsletter"] },
      mod_crypto: { name: "Crypto", features: ["20 assets in real time", "Gamma, options, volatility & Macro", "Flow: funding, CVD, long/short & liquidations", "Smart Money & On-chain + institutional vs retail", "Alerts and AI reports"] },
      mod_b3: { name: "B3 · Stocks", features: ["Stocks and REITs (IBOV, PETR, VALE…)", "Cockpit, dividends and investor flow", "Smart Money (structure, zones, liquidity)", "Market read + AI reports"] },
      mod_forex: { name: "Forex", features: ["Major pairs + currency strength (DXY)", "Smart Money and top-down read", "COT/CFTC, carry and sessions", "Macro & correlations + AI reports"] },
      complete: { name: "OrbeView Complete", tag: "Best value", features: ["Crypto + B3 + Forex, all unlocked", "3 markets for the price of 2", "The full depth in every market", "AI and alerts across all modules"] },
    },
  },
};

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
      .select("slug, price_cents, price_annual_cents, price_usd_cents, price_usd_annual_cents, paddle_price_id")
      .then(({ data }) => setPlans((data as DbPlan[]) ?? []));
  }, []);

  const fmt = (cents: number) => (isEn ? `$${Math.round(cents / 100)}` : `R$ ${Math.round(cents / 100)}`);

  // Preço por plano/ciclo. Anual = TOTAL/ano (price_annual_cents), com equivalente/mês e economia.
  function priceBlock(slug: Slug) {
    const p = plans.find((x) => x.slug === slug);
    const m = isEn ? p?.price_usd_cents ?? 0 : p?.price_cents ?? 0;
    const y = isEn ? p?.price_usd_annual_cents ?? 0 : p?.price_annual_cents ?? 0;
    if (slug === "free" || !m) return { main: t.freePrice, unit: "", annual: false, eq: "", struck: "", save: "" };
    if (cycle === "monthly") return { main: fmt(m), unit: t.perMonth, annual: false, eq: "", struck: "", save: "" };
    return {
      main: fmt(y), unit: t.perYear, annual: true,
      eq: `${t.perMonthEq} ${fmt(Math.round(y / 12))}${t.perMonth}`,
      struck: fmt(m * 12),
      save: `${t.save} ${fmt(m * 12 - y)}`,
    };
  }

  async function subscribe(slug: Slug) {
    if (!session) { navigate("/login"); return; }
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
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">{t.back}</Link>
        <LangSwitch />
      </div>

      <div className="mt-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t.title}</h1>
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
      <div className="mt-8 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {ORDER.map((slug) => {
          const c = t.plans[slug];
          const highlight = slug === "complete";
          const pb = priceBlock(slug);
          return (
            <div
              key={slug}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                highlight ? "border-primary/60 bg-primary/[0.06] shadow-xl shadow-primary/10 lg:-translate-y-1.5" : "border-border bg-card dark:bg-card/60"
              }`}
            >
              {c.tag && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                  {c.tag}
                </span>
              )}
              <h2 className="text-base font-semibold text-foreground">{c.name}</h2>

              <div className="mt-3 min-h-[68px]">
                <div className="flex items-baseline gap-1">
                  <span className="num text-2xl font-bold text-foreground">{pb.main}</span>
                  {pb.unit && <span className="text-xs text-muted-foreground">{pb.unit}</span>}
                </div>
                {pb.annual && (
                  <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                    <span className="text-muted-foreground">{pb.eq}</span>
                    <span className="text-muted-foreground"><span className="line-through">{pb.struck}</span> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{pb.save}</span></span>
                  </div>
                )}
              </div>

              <ul className="mt-3 flex-1 space-y-2 text-[13px] text-muted-foreground">
                {c.features.map((f) => (
                  <li key={f} className="flex gap-2"><span className="mt-px text-emerald-600 dark:text-emerald-400">✓</span><span>{f}</span></li>
                ))}
              </ul>

              {slug === "free" ? (
                <button disabled className="mt-5 w-full cursor-not-allowed rounded-lg border border-border py-2.5 text-sm font-semibold text-muted-foreground">
                  {t.freeBtn}
                </button>
              ) : (
                <button
                  onClick={() => subscribe(slug)}
                  disabled={busy !== null}
                  className={`mt-5 w-full rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    highlight ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
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

      <p className="mt-7 text-center text-xs text-muted-foreground">{t.note} · {t.cancelAnytime}</p>
    </div>
  );
}
