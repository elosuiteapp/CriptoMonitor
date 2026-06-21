import { useMemo, useState } from "react";

import { b3Sector, type B3Funds, type B3Quote } from "../../lib/b3";
import { B3AssetIcon, fmtMult, fmtNum, fmtPct, fmtPctRaw, toneCls } from "./B3Shared";

type SortKey = "symbol" | "price" | "changePct" | "d30" | "dy" | "pl" | "pvp" | "roe";
type Dir = "asc" | "desc";

interface Row {
  symbol: string;
  name: string;
  kind: B3Quote["kind"];
  sector: string;
  price: number | null;
  changePct: number | null;
  d30: number | null;
  dy: number | null;
  pl: number | null;
  pvp: number | null;
  roe: number | null;
}

const COLS: { key: SortKey; label: string; help?: string }[] = [
  { key: "symbol", label: "Ativo" },
  { key: "price", label: "Preço" },
  { key: "changePct", label: "Dia" },
  { key: "d30", label: "30d" },
  { key: "dy", label: "DY" },
  { key: "pl", label: "P/L" },
  { key: "pvp", label: "P/VP" },
  { key: "roe", label: "ROE" },
];

/** Ordena com nulos sempre por último, independentemente da direção. */
function cmp(a: number | null, b: number | null, dir: Dir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

/** Screener da B3: watchlist com fundamentos, filtro por setor e ordenação por coluna. */
export default function B3Screener({ quotes, funds, asset, onAsset }: { quotes: B3Quote[]; funds: B3Funds; asset: string; onAsset: (s: string) => void }) {
  const [sector, setSector] = useState<string>("Todos");
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "dy", dir: "desc" });

  const rows = useMemo<Row[]>(
    () =>
      quotes
        .filter((q) => q.kind === "stock")
        .map((q) => {
          const f = funds[q.symbol];
          return {
            symbol: q.symbol,
            name: q.name,
            kind: q.kind,
            sector: b3Sector(q.symbol),
            price: q.price,
            changePct: q.changePct,
            d30: q.d30 ?? null,
            dy: f?.dy ?? null,
            pl: f?.pl ?? null,
            pvp: f?.pvp ?? null,
            roe: f?.roe ?? null,
          };
        }),
    [quotes, funds],
  );

  const sectors = useMemo(() => ["Todos", ...Array.from(new Set(rows.map((r) => r.sector))).sort()], [rows]);

  const view = useMemo(() => {
    const filtered = sector === "Todos" ? rows : rows.filter((r) => r.sector === sector);
    const { key, dir } = sort;
    return filtered.slice().sort((a, b) => {
      if (key === "symbol") return dir === "asc" ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      return cmp(a[key], b[key], dir);
    });
  }, [rows, sector, sort]);

  const setSortKey = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "symbol" ? "asc" : "desc" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Ações · screener</h3>
        <div className="flex flex-wrap gap-1">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                sector === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card dark:bg-card/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSortKey(c.key)}
                  className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground ${c.key === "symbol" ? "text-left" : "text-right"}`}
                >
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr
                key={r.symbol}
                onClick={() => onAsset(r.symbol)}
                className={`cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-muted ${asset === r.symbol ? "bg-primary/10" : ""}`}
              >
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
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Clique no cabeçalho para ordenar; nas pílulas para filtrar por setor. Preço/retorno: Yahoo · fundamentos: Fundamentus. DY≥6% e ROE≥15% destacados.
      </p>
    </div>
  );
}
