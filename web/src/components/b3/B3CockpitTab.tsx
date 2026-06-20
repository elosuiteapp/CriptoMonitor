import { useEffect, useMemo, useState } from "react";

import { fetchB3Chart, fetchB3Fundamentals, fetchB3Overview, type B3Candle, type B3Fund, type B3Overview, type B3Quote } from "../../lib/b3";
import B3Chart from "./B3Chart";
import { Cell, fmtAssetPrice, fmtBRL, fmtBig, fmtNum, fmtPct, fmtVol, selicAA, toneCls } from "./B3Shared";

function WatchCard({ q, active, onClick }: { q: B3Quote; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors ${
        active ? "border-primary bg-primary/10" : "border-border hover:bg-muted dark:bg-card/40"
      }`}
    >
      <span className="text-xs font-semibold text-foreground">{q.symbol}</span>
      <span className="num text-sm text-foreground">{fmtNum(q.price, q.kind === "index" ? 0 : 2)}</span>
      <span className={`num text-[11px] font-medium ${toneCls(q.changePct)}`}>{fmtPct(q.changePct)}</span>
    </button>
  );
}

/** Cockpit Principal da B3: macro BR + watchlist + gráfico + fundamentos do ativo. */
export default function B3CockpitTab({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [ov, setOv] = useState<B3Overview | null>(null);
  const [loading, setLoading] = useState(true);
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
    fetchB3Chart(asset).then((c) => {
      if (alive) {
        setCandles(c);
        setChartLoading(false);
      }
    });
    fetchB3Fundamentals(asset).then((f) => alive && setFund(f));
    return () => {
      alive = false;
    };
  }, [asset]);

  const selQuote = useMemo(() => ov?.quotes.find((q) => q.symbol === asset) ?? null, [ov, asset]);
  const ibov = ov?.quotes.find((q) => q.symbol === "IBOV");
  const dollar = ov?.quotes.find((q) => q.symbol === "USD/BRL");
  const stocks = ov?.quotes.filter((q) => q.kind === "stock") ?? [];

  if (loading) return <div className="h-24 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />;
  if (!ov) return <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Dados da B3 indisponíveis no momento.</div>;

  return (
    <div className="space-y-4">
      {/* Macro BR + índice/dólar */}
      <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Macro BR & mercado</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="IBOV" value={fmtNum(ibov?.price ?? null, 0)} sub={fmtPct(ibov?.changePct ?? null)} tone={ibov?.changePct} />
          <Cell label="Dólar (USD/BRL)" value={fmtNum(dollar?.price ?? null)} sub={fmtPct(dollar?.changePct ?? null)} tone={dollar?.changePct} />
          <Cell label="Selic (a.a.)" value={selicAA(ov.macro.selic) != null ? `${selicAA(ov.macro.selic)!.toFixed(2)}%` : "—"} sub="taxa básica" />
          <Cell label="IPCA (mês)" value={ov.macro.ipca != null ? `${ov.macro.ipca.toFixed(2)}%` : "—"} sub="inflação" />
        </div>
      </div>

      {/* Watchlist */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Ações</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {ibov && <WatchCard q={ibov} active={asset === "IBOV"} onClick={() => onAsset("IBOV")} />}
          {dollar && <WatchCard q={dollar} active={asset === "USD/BRL"} onClick={() => onAsset("USD/BRL")} />}
          {stocks.map((q) => (
            <WatchCard key={q.symbol} q={q} active={asset === q.symbol} onClick={() => onAsset(q.symbol)} />
          ))}
        </div>
      </div>

      {/* Ativo selecionado */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-foreground">{asset}</span>
            {selQuote?.name && selQuote.name !== asset && <span className="ml-2 text-xs text-muted-foreground">{selQuote.name}</span>}
            <div className="num text-3xl font-bold text-foreground">{selQuote ? fmtAssetPrice(asset, selQuote.price) : "—"}</div>
          </div>
          <span className={`text-sm font-semibold ${toneCls(selQuote?.changePct)}`}>
            {fmtPct(selQuote?.changePct ?? null)} · dia{selQuote?.volume != null ? ` · vol ${fmtVol(selQuote.volume)}` : ""}
          </span>
        </div>

        {chartLoading ? (
          <div className="mt-3 h-72 animate-pulse rounded-xl bg-muted/40" />
        ) : candles.length < 2 ? (
          <div className="mt-3 grid h-72 place-items-center text-sm text-muted-foreground">Sem candles para {asset}.</div>
        ) : (
          <div className="mt-3">
            <B3Chart candles={candles} />
          </div>
        )}
      </div>

      {/* Fundamentos */}
      {fund && (fund.pe != null || fund.marketCap != null) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Cell label="P/L" value={fund.pe != null ? fund.pe.toFixed(1) : "—"} sub="preço / lucro" />
          <Cell label="LPA" value={fund.eps != null ? fmtBRL(fund.eps) : "—"} sub="lucro por ação" />
          <Cell label="Valor de mercado" value={fmtBig(fund.marketCap)} />
          {fund.range52 && <Cell label="Faixa 52 sem." value={fund.range52} />}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">Fonte: Yahoo Finance + Banco Central (BCB) · fundamentos via brapi.dev.</p>
    </div>
  );
}
