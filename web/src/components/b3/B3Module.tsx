import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3Fundamentals, fetchB3Overview, type B3Candle, type B3Fund, type B3Overview, type B3Quote } from "../../lib/b3";
import B3Chart from "./B3Chart";

const fmtBRL = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: dec }));
const fmtNum = (n: number | null, dec = 2) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }));
const fmtPct = (n: number | null) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
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
const toneCls = (n: number | null | undefined) => (n == null ? "text-muted-foreground" : n >= 0 ? "text-emerald-500" : "text-rose-500");
// Selic diária (BCB série 11) → efetiva anual aproximada.
const selicAA = (daily: number | null) => (daily == null ? null : (Math.pow(1 + daily / 100, 252) - 1) * 100);

function MacroCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function WatchCard({ q, active, onClick }: { q: B3Quote; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
        active ? "border-primary bg-primary/10" : "border-border hover:bg-muted dark:bg-card/40"
      }`}
    >
      <span className="text-xs font-semibold text-foreground">{q.symbol}</span>
      <span className="num text-sm text-foreground">{q.kind === "currency" ? fmtNum(q.price) : fmtNum(q.price, q.kind === "index" ? 0 : 2)}</span>
      <span className={`num text-[11px] font-medium ${toneCls(q.changePct)}`}>{fmtPct(q.changePct)}</span>
    </button>
  );
}

/** Módulo B3 (admin-only). Watchlist (IBOV/dólar/ações) + macro BR + gráfico + fundamentos.
 *  Dados via edge b3-data (Yahoo+BCB, grátis). Isolado do módulo cripto. */
export default function B3Module() {
  const [ov, setOv] = useState<B3Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("PETR4");
  const [candles, setCandles] = useState<B3Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [fund, setFund] = useState<B3Fund | null>(null);

  useEffect(() => {
    let alive = true;
    fetchB3Overview().then((o) => {
      if (!alive) return;
      setOv(o);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setChartLoading(true);
    setFund(null);
    fetchB3Chart(selected).then((c) => {
      if (alive) {
        setCandles(c);
        setChartLoading(false);
      }
    });
    fetchB3Fundamentals(selected).then((f) => alive && setFund(f));
    return () => {
      alive = false;
    };
  }, [selected]);

  const selQuote = useMemo(() => ov?.quotes.find((q) => q.symbol === selected) ?? null, [ov, selected]);
  const ibov = ov?.quotes.find((q) => q.symbol === "IBOV");
  const dollar = ov?.quotes.find((q) => q.symbol === "USD/BRL");
  const stocks = ov?.quotes.filter((q) => q.kind === "stock") ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          🇧🇷 B3 · Ações
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
        </h2>
        <p className="text-xs text-muted-foreground">Bolsa brasileira — índice, dólar, ações, macro e fundamentos. Em construção (fluxo de investidor a caminho).</p>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />
      ) : !ov ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Dados da B3 indisponíveis no momento.</div>
      ) : (
        <>
          {/* Macro BR + índice/dólar */}
          <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
            <h3 className="mb-2 text-sm font-semibold text-foreground">Macro BR & mercado</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MacroCell label="IBOV" value={fmtNum(ibov?.price ?? null, 0)} sub={fmtPct(ibov?.changePct ?? null)} />
              <MacroCell label="Dólar (USD/BRL)" value={fmtNum(dollar?.price ?? null)} sub={fmtPct(dollar?.changePct ?? null)} />
              <MacroCell label="Selic (a.a.)" value={selicAA(ov.macro.selic) != null ? `${selicAA(ov.macro.selic)!.toFixed(2)}%` : "—"} sub="taxa básica" />
              <MacroCell label="IPCA (mês)" value={ov.macro.ipca != null ? `${ov.macro.ipca.toFixed(2)}%` : "—"} sub="inflação" />
            </div>
          </div>

          {/* Watchlist de ações */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Ações</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {ibov && <WatchCard q={ibov} active={selected === "IBOV"} onClick={() => setSelected("IBOV")} />}
              {dollar && <WatchCard q={dollar} active={selected === "USD/BRL"} onClick={() => setSelected("USD/BRL")} />}
              {stocks.map((q) => (
                <WatchCard key={q.symbol} q={q} active={selected === q.symbol} onClick={() => setSelected(q.symbol)} />
              ))}
            </div>
          </div>

          {/* Ativo selecionado: cabeçalho + gráfico + fundamentos */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <span className="text-sm font-semibold text-foreground">{selected}</span>
                {selQuote?.name && selQuote.name !== selected && <span className="ml-2 text-xs text-muted-foreground">{selQuote.name}</span>}
                <div className="num text-3xl font-bold text-foreground">
                  {selQuote ? (selected === "USD/BRL" ? fmtBRL(selQuote.price, 4) : selected === "IBOV" ? fmtNum(selQuote.price, 0) : fmtBRL(selQuote.price)) : "—"}
                </div>
              </div>
              <span className={`text-sm font-semibold ${toneCls(selQuote?.changePct)}`}>
                {fmtPct(selQuote?.changePct ?? null)} · dia{selQuote?.volume != null ? ` · vol ${fmtVol(selQuote.volume)}` : ""}
              </span>
            </div>

            {chartLoading ? (
              <div className="mt-3 h-72 animate-pulse rounded-xl bg-muted/40" />
            ) : candles.length < 2 ? (
              <div className="mt-3 grid h-72 place-items-center text-sm text-muted-foreground">Sem candles para {selected}.</div>
            ) : (
              <div className="mt-3">
                <B3Chart candles={candles} />
              </div>
            )}
          </div>

          {/* Fundamentos (ações com dado da brapi) */}
          {fund && (fund.pe != null || fund.marketCap != null) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MacroCell label="P/L" value={fund.pe != null ? fund.pe.toFixed(1) : "—"} sub="preço / lucro" />
              <MacroCell label="LPA" value={fund.eps != null ? fmtBRL(fund.eps) : "—"} sub="lucro por ação" />
              <MacroCell label="Valor de mercado" value={fmtBig(fund.marketCap)} />
              {fund.range52 && <MacroCell label="Faixa 52 sem." value={fund.range52} />}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Fonte: Yahoo Finance + Banco Central (BCB) · fundamentos via brapi.dev. Próximo: fluxo de investidor (estrangeiro) e Boletim Focus via dadosdemercado.
          </p>
        </>
      )}
    </section>
  );
}
