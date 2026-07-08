import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useLocale, type Locale } from "../hooks/useLocale";
import { useProfile } from "../hooks/useProfile";
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

// Modelo FREE + PRO (decisão 06/jul, sql/110): Free = vitrine AO VIVO dos 3 mercados;
// Pro = tudo liberado. Planos-módulo/Expert viraram legado (sellable=false, fora daqui).
const ORDER = ["free", "pro"] as const;
type Slug = (typeof ORDER)[number];

const COPY: Record<Locale, {
  title: string; subtitle: string; back: string;
  perMonth: string; perYear: string; freePrice: string;
  monthly: string; annual: string; annualBadge: string; save: string; perMonthEq: string;
  note: string; cancelAnytime: string;
  freeBtn: string; subscribe: string; redirecting: string; usdSoon: string; payNote: string;
  cpfTitle: string; cpfDesc: string; cpfPh: string; cpfSaveBtn: string; cpfCancelBtn: string; cpfInvalid: string;
  plans: Record<Slug, { name: string; tag?: string; features: string[] }>;
}> = {
  pt: {
    title: "Planos",
    subtitle: "Simples assim: Free pra acompanhar ao vivo, Pro pra operar com tudo.",
    back: "← Voltar",
    perMonth: "/mês", perYear: "/ano", freePrice: "Grátis",
    monthly: "Mensal", annual: "Anual", annualBadge: "mais barato", save: "economize", perMonthEq: "equivale a",
    note: "O plano anual sai mais barato. Pagamento via Pix e cartão (Asaas).",
    cancelAnytime: "cancele quando quiser",
    freeBtn: "Plano atual", subscribe: "Assinar", redirecting: "Redirecionando…",
    usdSoon: "Pagamento em dólar (Paddle) em breve.", payNote: "Pagamento via Pix e cartão (Asaas)",
    cpfTitle: "Falta só o seu CPF",
    cpfDesc: "O Asaas exige CPF (ou CNPJ) para emitir a cobrança em reais. Informe uma vez e seguimos direto pro pagamento.",
    cpfPh: "000.000.000-00",
    cpfSaveBtn: "Continuar",
    cpfCancelBtn: "Cancelar",
    cpfInvalid: "CPF/CNPJ inválido — confira os números.",
    plans: {
      free: { name: "Free", features: ["Dados AO VIVO, sem delay", "Cripto: cockpit do BTC em tempo real + camadas (gamma, VP, CVD varejo)", "Básico de cada mercado (Cripto, B3, Forex)", "1 análise de IA por dia", "Newsletter semanal completa"] },
      pro: { name: "Pro", tag: "Tudo liberado", features: ["Cripto + B3 + Forex, tudo liberado", "20 ativos cripto em tempo real + gamma, opções e fluxo completo", "Smart Money & On-chain (SMC) nos 3 mercados", "Leitura do mercado, Macro e institucional × varejo", "30 análises de IA por dia + relatórios e alertas"] },
    },
  },
  en: {
    title: "Pricing",
    subtitle: "Simple: Free to follow live, Pro to trade with everything.",
    back: "← Back",
    perMonth: "/mo", perYear: "/yr", freePrice: "Free",
    monthly: "Monthly", annual: "Annual", annualBadge: "cheaper", save: "save", perMonthEq: "that's",
    note: "The annual plan is cheaper. Billed in USD via Paddle.",
    cancelAnytime: "cancel anytime",
    freeBtn: "Current plan", subscribe: "Subscribe", redirecting: "Redirecting…",
    usdSoon: "USD checkout (Paddle) coming soon.", payNote: "Billed in USD via Paddle",
    cpfTitle: "One last thing: your tax ID",
    cpfDesc: "Asaas requires a CPF/CNPJ to issue the BRL charge. Enter it once and we'll take you straight to checkout.",
    cpfPh: "000.000.000-00",
    cpfSaveBtn: "Continue",
    cpfCancelBtn: "Cancel",
    cpfInvalid: "Invalid CPF/CNPJ — please check the digits.",
    plans: {
      free: { name: "Free", features: ["LIVE data, no delay", "Crypto: real-time BTC cockpit + layers (gamma, VP, retail CVD)", "Basics of every market (Crypto, B3, Forex)", "1 AI analysis per day", "Full weekly newsletter"] },
      pro: { name: "Pro", tag: "Everything unlocked", features: ["Crypto + B3 + Forex, all unlocked", "20 crypto assets in real time + gamma, options and full flow", "Smart Money & On-chain (SMC) across all 3 markets", "Market read, Macro and institutional vs retail", "30 AI analyses per day + reports and alerts"] },
    },
  },
};

export default function Pricing() {
  const { session, user } = useAuth();
  const navigate = useNavigate();
  const { locale, isEn } = useLocale();
  const t = COPY[locale];
  const { save: saveProfileCpf } = useProfile(user);
  const [plans, setPlans] = useState<DbPlan[]>([]);
  const [cycle, setCycle] = useState<Cycle>("annual");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Modal de CPF: o asaas-checkout exige CPF/CNPJ no perfil. Se faltar, coletamos aqui
  // mesmo (sem mandar o usuário pro perfil e voltar) e retomamos o checkout.
  const [cpfFor, setCpfFor] = useState<Slug | null>(null);
  const [cpfInput, setCpfInput] = useState("");
  const [cpfSaving, setCpfSaving] = useState(false);
  const [cpfError, setCpfError] = useState<string | null>(null);

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
        const { data, error } = await supabase.functions.invoke("asaas-checkout", {
          body: { plan_slug: slug, cycle, returnUrl: `${window.location.origin}/obrigado` },
        });
        if (error) throw error;
        if (data?.code === "cpf_required") { setCpfError(null); setCpfInput(""); setCpfFor(slug); return; }
        if (data?.url) window.location.href = data.url as string;
        else throw new Error(data?.error || "checkout indisponível");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar checkout");
    } finally {
      setBusy(null);
    }
  }

  // Salva o CPF no perfil e retoma o checkout do plano que o pediu.
  async function saveCpfAndRetry() {
    const digits = cpfInput.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) { setCpfError(t.cpfInvalid); return; }
    setCpfSaving(true);
    setCpfError(null);
    const { error } = await saveProfileCpf({ cpf: digits });
    setCpfSaving(false);
    if (error) { setCpfError(error instanceof Error ? error.message : t.cpfInvalid); return; }
    const slug = cpfFor;
    setCpfFor(null);
    if (slug) await subscribe(slug);
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
      <div className="mx-auto mt-8 grid max-w-3xl items-start gap-5 sm:grid-cols-2">
        {ORDER.map((slug) => {
          const c = t.plans[slug];
          const highlight = slug === "pro";
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

      {/* Modal de CPF (aparece quando o checkout retorna cpf_required) */}
      {cpfFor && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => !cpfSaving && setCpfFor(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground">{t.cpfTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.cpfDesc}</p>
            <input
              autoFocus
              inputMode="numeric"
              value={cpfInput}
              onChange={(e) => setCpfInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveCpfAndRetry()}
              placeholder={t.cpfPh}
              className="num mt-4 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
            {cpfError && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{cpfError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCpfFor(null)}
                disabled={cpfSaving}
                className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {t.cpfCancelBtn}
              </button>
              <button
                onClick={saveCpfAndRetry}
                disabled={cpfSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {cpfSaving ? "…" : t.cpfSaveBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
