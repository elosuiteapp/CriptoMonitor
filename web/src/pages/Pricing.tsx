import { Link } from "react-router-dom";

interface PlanCol {
  name: string;
  price: string;
  highlight?: boolean;
  features: string[];
}

const PLANS: PlanCol[] = [
  {
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
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="mb-8 text-center">
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">Planos</h1>
        <p className="mt-1 text-slate-500">O cockpit completo de decisões do trader.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`rounded-2xl border p-6 ${
              p.highlight ? "border-accent bg-accent/5" : "border-ink-600 bg-ink-800/60"
            }`}
          >
            <h2 className="text-lg font-semibold text-white">{p.name}</h2>
            <div className="mt-1 text-2xl font-bold text-white">{p.price}</div>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-signal-green">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              disabled
              className="mt-6 w-full cursor-not-allowed rounded-lg border border-ink-500 py-2 text-sm font-semibold text-slate-500"
              title="Checkout disponível na Fase 5"
            >
              {p.name === "Free" ? "Plano atual" : "Em breve"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-600">
        Pagamento via PIX e cartão (Mercado Pago) — integração na Fase 5.
      </p>
    </div>
  );
}
