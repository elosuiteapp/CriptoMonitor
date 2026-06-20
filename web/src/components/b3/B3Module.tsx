import { useEffect, useState } from "react";

import { B3_FREE_TICKERS, B3_HAS_TOKEN, B3_WATCHLIST, fetchB3Quote, type B3Quote } from "../../lib/b3";
import B3Chart from "./B3Chart";

const LABEL: Record<string, string> = { "^BVSP": "IBOV" };
const label = (t: string) => LABEL[t] ?? t;

const fmtBRL = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }));
const fmtBig = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1e12) return `R$ ${(n / 1e12).toFixed(2)} tri`;
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(1)} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(1)} mi`;
  return `R$ ${n.toLocaleString("pt-BR")}`;
};
const fmtVol = (n: number | null) => {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} bi`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} mi`;
  return n.toLocaleString("pt-BR");
};

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 dark:bg-card/60">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Módulo B3 (admin-only, em construção). Cockpit de ações via brapi.dev:
 *  gráfico + cotação + fundamentos. IBOV/dólar/todas as ações com VITE_BRAPI_TOKEN. */
export default function B3Module() {
  const tickers = B3_HAS_TOKEN ? B3_WATCHLIST : B3_FREE_TICKERS;
  const [selected, setSelected] = useState(tickers[0]);
  const [q, setQ] = useState<B3Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchB3Quote(selected).then((r) => {
      if (!alive) return;
      setQ(r);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [selected]);

  const up = (q?.changePct ?? 0) >= 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            🇧🇷 B3 · Ações
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
          </h2>
          <p className="text-xs text-muted-foreground">Cockpit da bolsa brasileira — preço, fundamentos e candles. Em construção.</p>
        </div>
      </div>

      {/* Seletor de ativos */}
      <div className="flex flex-wrap gap-1.5">
        {tickers.map((t) => (
          <button
            key={t}
            onClick={() => setSelected(t)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {label(t)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-80 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />
      ) : !q ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">
          Não consegui carregar {label(selected)} pela brapi.{" "}
          {!B3_HAS_TOKEN && "Sem token, só PETR4/VALE3/ITUB4/MGLU3 estão disponíveis."}
        </div>
      ) : (
        <>
          {/* Cabeçalho de preço */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-sm font-semibold text-foreground">{label(q.symbol)}</span>
                <span className="ml-2 text-xs text-muted-foreground">{q.name}</span>
                <div className="num text-3xl font-bold text-foreground">{fmtBRL(q.price)}</div>
              </div>
              <span className={`text-sm font-semibold ${up ? "text-emerald-500" : "text-rose-500"}`}>
                {up ? "▲" : "▼"} {q.changePct != null ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%` : "—"} · dia
              </span>
            </div>
          </div>

          {/* Gráfico */}
          <div className="rounded-2xl border border-border bg-card p-2 dark:bg-card/60">
            <B3Chart candles={q.candles} />
          </div>

          {/* Fundamentos */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Card label="P/L" value={q.pe != null ? q.pe.toFixed(1) : "—"} sub="preço / lucro" />
            <Card label="LPA" value={q.eps != null ? fmtBRL(q.eps) : "—"} sub="lucro por ação" />
            <Card label="Valor de mercado" value={fmtBig(q.marketCap)} />
            <Card label="Volume (dia)" value={fmtVol(q.volume)} />
            <Card label="Máx/Mín (dia)" value={`${fmtBRL(q.low)} – ${fmtBRL(q.high)}`} />
            {q.fiftyTwoWeekRange && <Card label="Faixa 52 semanas" value={q.fiftyTwoWeekRange} />}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Fonte: brapi.dev. {B3_HAS_TOKEN ? "" : "Defina VITE_BRAPI_TOKEN (grátis em brapi.dev) para liberar IBOV, dólar e todas as ações. "}
            Próximo: macro BR (Selic/IPCA/câmbio via BCB) e fluxo de investidor (dadosdemercado).
          </p>
        </>
      )}
    </section>
  );
}
