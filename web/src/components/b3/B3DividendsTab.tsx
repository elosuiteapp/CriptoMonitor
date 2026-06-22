import { useEffect, useMemo, useState } from "react";

import { B3_ASSETS, B3_FIIS, fetchB3Dividends, fetchB3FiisAll, fetchB3Proventos, fetchB3FundamentalsAll, isFii, type B3Dividend, type B3FiiFunds, type B3Funds, type B3ProventosData } from "../../lib/b3";
import { B3AssetIcon, Cell, fmtBRL, fmtPctRaw, toneCls } from "./B3Shared";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const YEAR_S = 365.25 * 86400;
const fmtDate = (epoch: number | null) => (epoch ? new Date(epoch * 1000).toLocaleDateString("pt-BR") : "a definir");

const TYPE_STYLE: Record<string, string> = {
  Dividendo: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  JCP: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  Rendimento: "border-sky-500/40 text-sky-600 dark:text-sky-400",
};
function TypeBadge({ type }: { type: string }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TYPE_STYLE[type] ?? "border-border text-muted-foreground"}`}>{type}</span>;
}

interface Derived {
  dy12m: number | null; // dividend yield 12 meses (%)
  paid12m: number; // R$/ação pagos nos últimos 12 meses
  count12m: number; // nº de proventos nos últimos 12 meses
  last: B3Dividend | null;
  monthFreq: number[]; // 12 posições — nº de anos com pagamento naquele mês
  yearsObserved: number;
  byYear: { year: number; total: number }[];
  typicalMonths: number[]; // índices de meses "que costuma pagar"
}

function derive(divs: B3Dividend[], price: number | null): Derived | null {
  if (!divs.length) return null;
  const nowS = divs[divs.length - 1].date > 0 ? Math.max(...divs.map((d) => d.date), Date.now() / 1000) : Date.now() / 1000;
  const cut12 = nowS - YEAR_S;
  const last12 = divs.filter((d) => d.date >= cut12);
  const paid12m = last12.reduce((s, d) => s + d.amount, 0);
  const dy12m = price && price > 0 ? (paid12m / price) * 100 : null;

  // Sazonalidade: nº de ANOS distintos que pagaram em cada mês (não conta 2x no mesmo ano).
  const monthYears: Set<number>[] = Array.from({ length: 12 }, () => new Set<number>());
  const yearTotals = new Map<number, number>();
  for (const d of divs) {
    const dt = new Date(d.date * 1000);
    monthYears[dt.getUTCMonth()].add(dt.getUTCFullYear());
    yearTotals.set(dt.getUTCFullYear(), (yearTotals.get(dt.getUTCFullYear()) ?? 0) + d.amount);
  }
  const monthFreq = monthYears.map((s) => s.size);
  const years = new Set(divs.map((d) => new Date(d.date * 1000).getUTCFullYear()));
  const yearsObserved = years.size;
  const byYear = [...yearTotals.entries()].map(([year, total]) => ({ year, total })).sort((a, b) => a.year - b.year);
  // "costuma pagar" = mês presente em >=40% dos anos observados (e ao menos 2x).
  const thr = Math.max(2, Math.ceil(yearsObserved * 0.4));
  const typicalMonths = monthFreq.map((f, i) => (f >= thr ? i : -1)).filter((i) => i >= 0);

  return { dy12m, paid12m, count12m: last12.length, last: divs[divs.length - 1], monthFreq, yearsObserved, byYear, typicalMonths };
}

/** Heatmap 12 meses — intensidade pela frequência de pagamento (sazonalidade de proventos). */
function MonthHeatmap({ freq, max }: { freq: number[]; max: number }) {
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
      {MONTHS.map((m, i) => {
        const intensity = max > 0 ? freq[i] / max : 0;
        const on = freq[i] > 0;
        return (
          <div
            key={m}
            className={`rounded-lg border p-2 text-center ${on ? "border-emerald-500/40" : "border-border/60"}`}
            style={on ? { backgroundColor: `rgba(16,185,129,${0.12 + intensity * 0.5})` } : undefined}
            title={`${freq[i]} ano(s) com pagamento em ${m}`}
          >
            <div className={`text-[10px] font-medium uppercase ${on ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{m}</div>
            <div className={`num text-xs font-semibold ${on ? "text-foreground" : "text-muted-foreground/50"}`}>{freq[i] || "—"}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Barras de proventos por ano (R$/ação). CSS puro, leve. */
function YearBars({ byYear }: { byYear: { year: number; total: number }[] }) {
  const rows = byYear.slice(-7);
  const max = Math.max(...rows.map((r) => r.total), 0.0001);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.year} className="flex items-center gap-2">
          <span className="num w-10 shrink-0 text-xs text-muted-foreground">{r.year}</span>
          <div className="h-5 flex-1 overflow-hidden rounded-md bg-muted/40">
            <div className="flex h-full items-center justify-end rounded-md bg-emerald-500/70 px-2" style={{ width: `${Math.max(8, (r.total / max) * 100)}%` }}>
              <span className="num text-[10px] font-semibold text-white">{fmtBRL(r.total)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Aba Dividendos & Proventos — DY, sazonalidade ("meses pagando"), histórico e ranking. */
export default function B3DividendsTab({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [data, setData] = useState<{ price: number | null; dividends: B3Dividend[] } | null>(null);
  const [proventos, setProventos] = useState<B3ProventosData>({ past: [], upcoming: [] });
  const [funds, setFunds] = useState<B3Funds>({});
  const [fiis, setFiis] = useState<B3FiiFunds>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    setProventos({ past: [], upcoming: [] });
    fetchB3Dividends(asset).then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    fetchB3Proventos(asset, isFii(asset) ? "fii" : "stock").then((p) => alive && setProventos(p));
    return () => {
      alive = false;
    };
  }, [asset]);

  useEffect(() => {
    let alive = true;
    fetchB3FundamentalsAll().then((f) => alive && setFunds(f));
    fetchB3FiisAll().then((f) => alive && setFiis(f));
    return () => {
      alive = false;
    };
  }, []);

  const d = useMemo(() => (data ? derive(data.dividends, data.price) : null), [data]);
  const maxFreq = d ? Math.max(...d.monthFreq, 1) : 1;
  // Histórico: prefere StatusInvest (tem tipo); cai pro Yahoo se vier vazio.
  const history = useMemo<{ date: number; amount: number; type: string }[]>(() => {
    if (proventos.past.length) return proventos.past.slice().reverse();
    return (data?.dividends ?? []).slice().reverse().map((dv) => ({ date: dv.date, amount: dv.amount, type: "" }));
  }, [proventos, data]);

  const fiiView = isFii(asset);

  // Ranking de pagadoras (por DY do Fundamentus) — adapta entre FIIs e ações.
  const ranking = useMemo(() => {
    if (fiiView) {
      return B3_FIIS.filter((a) => fiis[a.symbol]?.dy != null && (fiis[a.symbol]!.dy as number) > 0)
        .map((a) => ({ symbol: a.symbol, name: a.name, dy: fiis[a.symbol]!.dy as number, kind: "fii" as const }))
        .sort((a, b) => b.dy - a.dy);
    }
    return B3_ASSETS.filter((a) => a.kind === "stock" && funds[a.symbol]?.dy != null && (funds[a.symbol]!.dy as number) > 0)
      .map((a) => ({ symbol: a.symbol, name: a.name, dy: funds[a.symbol]!.dy as number, kind: "stock" as const }))
      .sort((a, b) => b.dy - a.dy);
  }, [funds, fiis, fiiView]);

  // Paga proventos? (ação ou FII — exclui índice/dólar)
  const paysDiv = !asset.startsWith("^") && !asset.includes("/") && asset !== "IBOV" && asset !== "USD/BRL";
  const typicalLabel = d && d.typicalMonths.length ? d.typicalMonths.map((i) => MONTHS[i]).join(" · ") : null;

  return (
    <div className="space-y-4">
      {/* Resumo do ativo */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card backdrop-blur-md dark:bg-card/60 dark:shadow-glow">
        <div className="mb-3 flex items-center gap-2">
          <B3AssetIcon symbol={asset} />
          <h3 className="text-sm font-semibold text-foreground">Dividendos · {asset}</h3>
        </div>
        {!paysDiv ? (
          <p className="text-sm text-muted-foreground">Selecione uma ação ou FII — índice e dólar não pagam proventos.</p>
        ) : loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-muted/40" />
        ) : !d ? (
          <p className="text-sm text-muted-foreground">Sem histórico de proventos para {asset} (ou ativo não distribui dividendos).</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cell label="Dividend Yield (12m)" value={<span className={d.dy12m && d.dy12m >= 6 ? "text-emerald-500" : "text-foreground"}>{fmtPctRaw(d.dy12m)}</span>} sub="proventos 12m / preço" />
              <Cell label="Pago por ação (12m)" value={fmtBRL(d.paid12m)} sub={`${d.count12m} pagamento(s)`} />
              <Cell label="Último provento" value={fmtBRL(d.last?.amount ?? null)} sub={d.last ? new Date(d.last.date * 1000).toLocaleDateString("pt-BR") : "—"} />
              <Cell label="Costuma pagar em" value={<span className="text-sm">{typicalLabel ?? "irregular"}</span>} sub={`${d.yearsObserved} anos observados`} />
            </div>
            {typicalLabel && (
              <p className="mt-3 border-t border-border/60 pt-3 text-sm text-foreground">
                {asset} costuma distribuir proventos em <strong>{typicalLabel}</strong>. DY de {fmtPctRaw(d.dy12m)} nos últimos 12 meses.
              </p>
            )}
          </>
        )}
      </div>

      {/* Agenda de proventos (provisionados futuros — data-com / pagamento) */}
      {paysDiv && proventos.upcoming.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            📅 Agenda de proventos
            <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">provisionado</span>
          </h3>
          <p className="mb-3 text-[11px] text-muted-foreground">Já declarados, ainda a pagar. Para receber, ter o ativo até a <strong>data-com</strong>.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium">Data-com</th>
                  <th className="px-3 py-2 text-left font-medium">Pagamento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {proventos.upcoming.map((u, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2"><TypeBadge type={u.type} /></td>
                    <td className="num px-3 py-2 text-foreground">{fmtDate(u.exDate)}</td>
                    <td className="num px-3 py-2 text-foreground">{fmtDate(u.payDate)}</td>
                    <td className="num px-3 py-2 text-right font-semibold text-foreground">{fmtBRL(u.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Fonte: StatusInvest. Educacional — não é recomendação.</p>
        </div>
      )}

      {/* Sazonalidade + por ano */}
      {paysDiv && d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
            <h3 className="mb-1 text-sm font-semibold text-foreground">Meses que costuma pagar</h3>
            <p className="mb-3 text-[11px] text-muted-foreground">Quanto mais escuro, mais anos pagaram naquele mês.</p>
            <MonthHeatmap freq={d.monthFreq} max={maxFreq} />
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Proventos por ano (R$/ação)</h3>
            {d.byYear.length ? <YearBars byYear={d.byYear} /> : <p className="text-sm text-muted-foreground">Sem dados anuais.</p>}
          </div>
        </div>
      )}

      {/* Histórico */}
      {paysDiv && history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card dark:bg-card/60">
          <h3 className="px-4 py-3 text-sm font-semibold text-foreground">Histórico de proventos</h3>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card dark:bg-card/95">
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Data-com</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-right font-medium">Valor por ação</th>
                </tr>
              </thead>
              <tbody>
                {history.map((dv, i) => (
                  <tr key={`${dv.date}-${i}`} className="border-b border-border/50 last:border-0">
                    <td className="num px-4 py-2 text-foreground">{new Date(dv.date * 1000).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2"><TypeBadge type={dv.type} /></td>
                    <td className="num px-4 py-2 text-right text-foreground">{fmtBRL(dv.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            {proventos.past.length ? "Fonte: StatusInvest (data-com + tipo Dividendo/JCP/Rendimento)." : "Fonte: Yahoo Finance (por data ex). Tipo indisponível para este ativo."}
          </p>
        </div>
      )}

      {/* Ranking de pagadoras */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Ranking de pagadoras · {fiiView ? "FIIs" : "Ações"} · Dividend Yield</h3>
        {ranking.length === 0 ? (
          <div className="h-24 animate-pulse rounded-2xl border border-border bg-card dark:bg-card/60" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card dark:bg-card/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Ativo</th>
                  <th className="px-3 py-2 text-right font-medium">Dividend Yield</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.symbol}
                    onClick={() => onAsset(r.symbol)}
                    className={`cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted ${asset === r.symbol ? "bg-primary/10" : ""}`}
                  >
                    <td className="num px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <B3AssetIcon symbol={r.symbol} kind={r.kind} />
                        <span className="font-semibold text-foreground">{r.symbol}</span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">{r.name}</span>
                      </span>
                    </td>
                    <td className={`num px-3 py-2 text-right font-semibold ${toneCls(r.dy)}`}>{fmtPctRaw(r.dy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">DY 12 meses (Fundamentus). Clique para abrir o ativo. Educacional — não é recomendação.</p>
      </div>
    </div>
  );
}
