import { useEffect, useMemo, useState } from "react";

import { b3Sector, isFii, type B3FiiFunds, type B3Funds, type B3Quote } from "../../lib/b3";
import { B3AssetIcon, fmtMult, fmtNum, fmtPct, fmtPctRaw, toneCls } from "./B3Shared";

type Dir = "asc" | "desc";

/** Ordena com nulos sempre por último, independentemente da direção. */
function cmp(a: number | null, b: number | null, dir: Dir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

// ── Linhas (uma forma para ação, outra para FII) ──
interface StockRow {
  symbol: string; name: string; kind: B3Quote["kind"]; sector: string;
  price: number | null; changePct: number | null; d30: number | null;
  dy: number | null; pl: number | null; pvp: number | null; roe: number | null;
}
interface FiiRow {
  symbol: string; name: string; segmento: string;
  price: number | null; changePct: number | null;
  dy: number | null; pvp: number | null; capRate: number | null; vacancia: number | null;
}

const STOCK_COLS = [
  { key: "symbol", label: "Ativo" },
  { key: "price", label: "Preço" },
  { key: "changePct", label: "Dia" },
  { key: "d30", label: "30d" },
  { key: "dy", label: "DY" },
  { key: "pl", label: "P/L" },
  { key: "pvp", label: "P/VP" },
  { key: "roe", label: "ROE" },
] as const;
const FII_COLS = [
  { key: "symbol", label: "FII" },
  { key: "price", label: "Cota" },
  { key: "changePct", label: "Dia" },
  { key: "dy", label: "DY" },
  { key: "pvp", label: "P/VP" },
  { key: "capRate", label: "Cap Rate" },
  { key: "vacancia", label: "Vacância" },
] as const;
type StockKey = (typeof STOCK_COLS)[number]["key"];
type FiiKey = (typeof FII_COLS)[number]["key"];

/** Screener da B3: alterna Ações × FIIs. Cada um com seus indicadores, filtro (setor/segmento)
 *  e ordenação por coluna. Clicar numa linha seleciona o ativo (mesmas ferramentas). */
export default function B3Screener({
  quotes,
  funds,
  fiis,
  asset,
  onAsset,
}: {
  quotes: B3Quote[];
  funds: B3Funds;
  fiis: B3FiiFunds;
  asset: string;
  onAsset: (s: string) => void;
}) {
  const [view, setView] = useState<"acoes" | "fiis">(isFii(asset) ? "fiis" : "acoes");
  useEffect(() => setView(isFii(asset) ? "fiis" : "acoes"), [asset]);
  const [group, setGroup] = useState("Todos");
  const [sortS, setSortS] = useState<{ key: StockKey; dir: Dir }>({ key: "dy", dir: "desc" });
  const [sortF, setSortF] = useState<{ key: FiiKey; dir: Dir }>({ key: "dy", dir: "desc" });

  const stockRows = useMemo<StockRow[]>(
    () =>
      quotes
        .filter((q) => q.kind === "stock")
        .map((q) => {
          const f = funds[q.symbol];
          return { symbol: q.symbol, name: q.name, kind: q.kind, sector: b3Sector(q.symbol), price: q.price, changePct: q.changePct, d30: q.d30 ?? null, dy: f?.dy ?? null, pl: f?.pl ?? null, pvp: f?.pvp ?? null, roe: f?.roe ?? null };
        }),
    [quotes, funds],
  );
  const fiiRows = useMemo<FiiRow[]>(
    () =>
      quotes
        .filter((q) => q.kind === "fii")
        .map((q) => {
          const f = fiis[q.symbol];
          return { symbol: q.symbol, name: q.name, segmento: f?.segmento ?? "—", price: q.price, changePct: q.changePct, dy: f?.dy ?? null, pvp: f?.pvp ?? null, capRate: f?.capRate ?? null, vacancia: f?.vacancia ?? null };
        }),
    [quotes, fiis],
  );

  const isFiiView = view === "fiis";
  const groups = useMemo(() => {
    const vals = isFiiView ? fiiRows.map((r) => r.segmento) : stockRows.map((r) => r.sector);
    return ["Todos", ...Array.from(new Set(vals.filter((v) => v && v !== "—"))).sort()];
  }, [isFiiView, fiiRows, stockRows]);

  // Reset do filtro ao trocar de visão (setores ≠ segmentos).
  useEffect(() => setGroup("Todos"), [view]);

  const stockView = useMemo(() => {
    const filtered = group === "Todos" ? stockRows : stockRows.filter((r) => r.sector === group);
    const { key, dir } = sortS;
    return filtered.slice().sort((a, b) => (key === "symbol" ? (dir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol)) : cmp(a[key], b[key], dir)));
  }, [stockRows, group, sortS]);
  const fiiView = useMemo(() => {
    const filtered = group === "Todos" ? fiiRows : fiiRows.filter((r) => r.segmento === group);
    const { key, dir } = sortF;
    return filtered.slice().sort((a, b) => (key === "symbol" ? (dir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol)) : cmp(a[key], b[key], dir)));
  }, [fiiRows, group, sortF]);

  const setStockSort = (key: StockKey) => setSortS((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "symbol" ? "asc" : "desc" }));
  const setFiiSort = (key: FiiKey) => setSortF((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "symbol" ? "asc" : "desc" }));
  const arrowS = (key: StockKey) => (sortS.key === key ? (sortS.dir === "asc" ? " ▲" : " ▼") : "");
  const arrowF = (key: FiiKey) => (sortF.key === key ? (sortF.dir === "asc" ? " ▲" : " ▼") : "");

  const tabCls = (on: boolean) => `rounded-md px-3 py-1 text-xs font-medium transition-colors ${on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Screener</h3>
          <div className="flex gap-1 rounded-lg border border-border bg-background p-0.5">
            <button onClick={() => setView("acoes")} className={tabCls(!isFiiView)}>Ações</button>
            <button onClick={() => setView("fiis")} className={tabCls(isFiiView)}>FIIs</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {groups.map((s) => (
            <button
              key={s}
              onClick={() => setGroup(s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${group === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card dark:bg-card/60">
        {isFiiView ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                {FII_COLS.map((c) => (
                  <th key={c.key} onClick={() => setFiiSort(c.key)} className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground ${c.key === "symbol" ? "text-left" : "text-right"}`}>
                    {c.label}
                    {arrowF(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fiiView.map((r) => (
                <tr key={r.symbol} onClick={() => onAsset(r.symbol)} className={`cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted ${asset === r.symbol ? "bg-primary/10" : ""}`}>
                  <td className="px-3 py-2 font-semibold text-foreground">
                    <span className="flex items-center gap-2">
                      <B3AssetIcon symbol={r.symbol} kind="fii" />
                      {r.symbol}
                      <span className="hidden text-[10px] font-normal text-muted-foreground lg:inline">{r.segmento}</span>
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-right text-foreground">{fmtNum(r.price, 2)}</td>
                  <td className={`num px-3 py-2 text-right ${toneCls(r.changePct)}`}>{fmtPct(r.changePct)}</td>
                  <td className={`num px-3 py-2 text-right ${r.dy != null && r.dy >= 9 ? "text-emerald-500" : "text-foreground"}`}>{fmtPctRaw(r.dy)}</td>
                  <td className={`num px-3 py-2 text-right ${r.pvp != null && r.pvp < 1 ? "text-emerald-500" : "text-foreground"}`}>{fmtMult(r.pvp)}</td>
                  <td className="num px-3 py-2 text-right text-foreground">{fmtPctRaw(r.capRate)}</td>
                  <td className={`num px-3 py-2 text-right ${r.vacancia != null && r.vacancia > 15 ? "text-rose-500" : "text-foreground"}`}>{fmtPctRaw(r.vacancia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                {STOCK_COLS.map((c) => (
                  <th key={c.key} onClick={() => setStockSort(c.key)} className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground ${c.key === "symbol" ? "text-left" : "text-right"}`}>
                    {c.label}
                    {arrowS(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockView.map((r) => (
                <tr key={r.symbol} onClick={() => onAsset(r.symbol)} className={`cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted ${asset === r.symbol ? "bg-primary/10" : ""}`}>
                  <td className="px-3 py-2 font-semibold text-foreground">
                    <span className="flex items-center gap-2">
                      <B3AssetIcon symbol={r.symbol} kind={r.kind} />
                      {r.symbol}
                      <span className="hidden text-[10px] font-normal text-muted-foreground lg:inline">{r.sector}</span>
                    </span>
                  </td>
                  <td className="num px-3 py-2 text-right text-foreground">{fmtNum(r.price, 2)}</td>
                  <td className={`num px-3 py-2 text-right ${toneCls(r.changePct)}`}>{fmtPct(r.changePct)}</td>
                  <td className={`num px-3 py-2 text-right ${toneCls(r.d30)}`}>{fmtPct(r.d30)}</td>
                  <td className={`num px-3 py-2 text-right ${r.dy != null && r.dy >= 6 ? "text-emerald-500" : "text-foreground"}`}>{fmtPctRaw(r.dy)}</td>
                  <td className="num px-3 py-2 text-right text-foreground">{r.pl != null ? r.pl.toFixed(1) : "—"}</td>
                  <td className="num px-3 py-2 text-right text-foreground">{fmtMult(r.pvp)}</td>
                  <td className={`num px-3 py-2 text-right ${r.roe != null && r.roe >= 15 ? "text-emerald-500" : "text-foreground"}`}>{fmtPctRaw(r.roe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {isFiiView
          ? "FIIs: clique no cabeçalho p/ ordenar, nas pílulas p/ filtrar por segmento. DY≥9% e P/VP<1 destacados; vacância>15% em vermelho."
          : "Ações: clique no cabeçalho p/ ordenar, nas pílulas p/ filtrar por setor. DY≥6% e ROE≥15% destacados."}{" "}
        Preço: Yahoo · fundamentos: Fundamentus.
      </p>
    </div>
  );
}
