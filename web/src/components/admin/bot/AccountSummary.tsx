import type { Dispatch, SetStateAction } from "react";

import Card from "../../ui/Card";
import { num } from "../../../lib/bot/format";
import type { Config, BotPosition } from "../../../lib/bot/types";

/** Resumo da conta — quanto está rendendo agora e o que já foi realizado. */
export default function AccountSummary({ totalEq, hasLivePnl, openPnl, quote, pnlSummary, selMonth, setSelMonth, openPositions, cfg, isFut }: {
  totalEq: string | null;
  hasLivePnl: boolean;
  openPnl: number;
  quote: string;
  pnlSummary: { day: { pnl: number; trades: number; wins: number }; months: { month: string; pnl: number; trades: number; wins: number }[] } | null;
  selMonth: string;
  setSelMonth: Dispatch<SetStateAction<string>>;
  openPositions: BotPosition[];
  cfg: Config | null;
  isFut: boolean;
}) {
  // Saldo do dia/mês (RPC bot_pnl_summary, fuso BRT): mês vigente por padrão; seletor navega meses.
  const MONTHS_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_PT[Number(m) - 1] ?? m}/${y.slice(2)}`; };
  const curMonth = selMonth || pnlSummary?.months[0]?.month || "";
  const monthData = pnlSummary?.months.find((m) => m.month === curMonth) ?? null;

  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Resumo da conta (demo)</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patrimônio total</div>
            <div className="num text-2xl font-bold text-foreground">{totalEq != null ? `US$ ${num(totalEq)}` : "—"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">PnL aberto agora</div>
            <div className={`num text-2xl font-bold ${!hasLivePnl ? "text-muted-foreground" : openPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{hasLivePnl ? `${openPnl >= 0 ? "+" : ""}${num(openPnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">soma das posições em aberto</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do dia</div>
            <div className={`num text-2xl font-bold ${!pnlSummary || !pnlSummary.day.trades ? "text-muted-foreground" : pnlSummary.day.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{pnlSummary && pnlSummary.day.trades ? `${pnlSummary.day.pnl >= 0 ? "+" : ""}${num(pnlSummary.day.pnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{pnlSummary && pnlSummary.day.trades ? `${pnlSummary.day.wins}/${pnlSummary.day.trades} no verde · hoje` : "sem trades hoje"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="mb-0.5 flex items-center justify-between gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo do mês</span>
              {pnlSummary && pnlSummary.months.length > 0 && (
                <select value={curMonth} onChange={(e) => setSelMonth(e.target.value)} className="rounded border border-border/70 bg-background/60 px-1 py-0.5 text-[10px] text-foreground focus:outline-none" title="escolher mês">
                  {pnlSummary.months.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
                </select>
              )}
            </div>
            <div className={`num text-2xl font-bold ${!monthData || !monthData.trades ? "text-muted-foreground" : monthData.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{monthData && monthData.trades ? `${monthData.pnl >= 0 ? "+" : ""}${num(monthData.pnl)} ${quote}` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">{monthData && monthData.trades ? `${monthData.wins}/${monthData.trades} no verde` : "sem trades no mês"}</div>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</div>
            <div className={`text-lg font-bold ${openPositions.length ? "text-foreground" : "text-muted-foreground"}`}>{openPositions.length ? `${openPositions.length} rodando` : "Fora do mercado"}</div>
            <div className="text-[10px] text-muted-foreground">{cfg?.enabled ? "robô ligado" : "robô desligado"}</div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{isFut ? "Futuros: long e short com margem em " : "Opera com capital em "}{quote}; saldos pré-existentes ficam intocados.</p>
      </Card>
  );
}
