import type { Dispatch, SetStateAction } from "react";

import type { OrderRow } from "../../../lib/bot/types";
import type { ClosedTrade } from "../../../lib/bot/trades";

/** Filtros — moeda / origem / resultado / status / período (valem p/ KPIs, trades e execuções). */
export default function OrdersFilters({ fAsset, setFAsset, fSource, setFSource, fResult, setFResult, fStatus, setFStatus, fFrom, setFFrom, fTo, setFTo, orderAssets, filtered, fClosedTrades }: {
  fAsset: string;
  setFAsset: Dispatch<SetStateAction<string>>;
  fSource: string;
  setFSource: Dispatch<SetStateAction<string>>;
  fResult: string;
  setFResult: Dispatch<SetStateAction<string>>;
  fStatus: string;
  setFStatus: Dispatch<SetStateAction<string>>;
  fFrom: string;
  setFFrom: Dispatch<SetStateAction<string>>;
  fTo: string;
  setFTo: Dispatch<SetStateAction<string>>;
  orderAssets: string[];
  filtered: OrderRow[];
  fClosedTrades: ClosedTrade[];
}) {
  const filtersOn = fAsset !== "all" || fStatus !== "all" || fSource !== "all" || fResult !== "all" || !!fFrom || !!fTo;
  const clearFilters = () => { setFAsset("all"); setFStatus("all"); setFSource("all"); setFResult("all"); setFFrom(""); setFTo(""); };
  // Períodos rápidos (hoje / 7d / 30d) — datas locais no formato do input date.
  const dstr = (d: Date) => d.toLocaleDateString("en-CA");
  const quickRange = (days: number) => { const to = new Date(); const from = new Date(); from.setDate(to.getDate() - (days - 1)); setFFrom(dstr(from)); setFTo(dstr(to)); };

  return (
      <div className="rounded-xl border border-border bg-card p-3 dark:bg-card/60">
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filtros</span>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Moeda
            <select value={fAsset} onChange={(e) => setFAsset(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todas</option>
              {orderAssets.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem
            <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todas</option>
              <option value="auto">Robô</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado
            <select value={fResult} onChange={(e) => setFResult(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todos</option>
              <option value="win">No verde</option>
              <option value="loss">No vermelho</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
              <option value="all">Todos</option>
              <option value="ok">OK</option>
              <option value="erro">Erro</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">De
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
            <button onClick={() => quickRange(1)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">Hoje</button>
            <button onClick={() => quickRange(7)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">7d</button>
            <button onClick={() => quickRange(30)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">30d</button>
            <button onClick={() => { setFFrom(""); setFTo(""); }} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">Tudo</button>
          </div>
          {filtersOn && (
            <button onClick={clearFilters} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">Limpar filtros</button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">{fClosedTrades.length} trades · {filtered.length} ordens{filtersOn ? " (filtradas)" : ""}</span>
        </div>
      </div>
  );
}
