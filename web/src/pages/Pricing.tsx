import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

interface PlanCol {
  slug: "free" | "pro" | "expert";
  name: string;
  price: string;
  highlight?: boolean;
  features: string[];
}

const PLANS: PlanCol[] = [
  {
    slug: "free",
    name: "Free",
    price: "R$ 0",
    features: [
      "Apenas BTC",
      "Preço + Fear & Greed (30 min)",
      "1 análise de IA por dia (Haiku)",
      "Sem alertas · sem histórico",
    ],
  },
  {
    slug: "pro",
    name: "Pro",
    price: "R$ 59/mês",
    highlight: true,
    features: [
      "BTC, ETH e SOL",
      "10 fontes em tempo real (5 min)",
      "Gráfico com camadas + Módulo Gamma",
      "10 análises/dia (Sonnet)",
      "Alertas por e-mail · histórico 30 dias",
    ],
  },
  {
    slug: "expert",
    name: "Expert",
    price: "R$ 149/mês",
    features: [
      "Tudo do Pro + acesso antecipado",
      "Análises ilimitadas (Fable 5)",
      "Relatório diário automático",
      "Alertas por e-mail + WhatsApp",
      "Histórico completo",
    ],
  },
];

export default function Pricing() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(slug: "pro" | "expert") {
    if (!session) {
      navigate("/login");
      return;
    }
    setError(null);
    setBusy(slug);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan_slug: slug },
      });
      if (error) throw error;
      if (data?.init_point) window.location.href = data.init_point;
      else throw new Error("checkout indisponível");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao iniciar checkout");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-8 text-center">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Planos</h1>
        <p className="mt-1 text-muted-foreground">O cockpit completo de decisões do trader.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`rounded-2xl border p-6 ${
              p.highlight ? "border-primary bg-primary/5" : "border-border bg-card dark:bg-card/60"
            }`}
          >
            <h2 className="text-lg font-semibold text-foreground">{p.name}</h2>
            <div className="mt-1 text-2xl font-bold text-foreground num">{p.price}</div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {p.slug === "free" ? (
              <button
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-lg border border-border py-2 text-sm font-semibold text-muted-foreground"
              >
                Plano gratuito
              </button>
            ) : (
              <button
                onClick={() => subscribe(p.slug as "pro" | "expert")}
                disabled={busy !== null}
                className="mt-6 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === p.slug ? "Redirecionando…" : "Assinar"}
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Pagamento via PIX e cartão (Mercado Pago).
      </p>
    </div>
  );
}
