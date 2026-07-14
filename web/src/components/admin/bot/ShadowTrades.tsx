import { useMemo, useState } from "react";

import Card from "../../ui/Card";
import InfoTip from "../../InfoTip";
import { ENGINE_NAME, FEE_RT, BOT_ENGINES } from "../../../lib/bot/constants";
import { num } from "../../../lib/bot/format";
import type { ShadowTrade } from "../../../lib/bot/types";

const REASON_LABEL: Record<string, string> = { stop: "stop", confluência: "saída", reversão: "virou" };
const dstr = (s: string) => { try { return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return s; } };

/** Ordens de PAPEL (trades fechados) de cada robô-sombra, filtrável por robô — o histórico que mostra
 *  como cada estratégia vem operando. Resultado em % LÍQUIDO de taxa (bruto − 0,12%/RT). */
export default function ShadowTrades({ shadowTrades, pxDec }: {
  shadowTrades: ShadowTrade[];
  pxDec: (v: number | null | undefined) => number;
}) {
  const [robo, setRobo] = useState("confluence2_tec"); // começa no Robô 3.0 (o mais novo)
  const withTrades = useMemo(() => {
    const set = new Set(shadowTrades.map((t) => t.engine));
    return BOT_ENGINES.filter((e) => set.has(e.eng));
  }, [shadowTrades]);
  const rows = useMemo(() => shadowTrades.filter((t) => robo === "all" || t.engine === robo).slice(0, 40), [shadowTrades, robo]);

  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">Ordens dos robôs <span className="font-normal text-muted-foreground">— papel</span> <InfoTip text="Trades FECHADOS (round-trips) de cada robô-sombra. Resultado em % líquido de taxa (bruto − 0,12%/round-trip)." /></h2>
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5 text-[11px]">
            <button onClick={() => setRobo("all")} className={`rounded-md px-2 py-0.5 font-semibold transition-colors ${robo === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Todos</button>
            {withTrades.map((e) => (
              <button key={e.eng} onClick={() => setRobo(e.eng)} className={`rounded-md px-2 py-0.5 font-semibold transition-colors ${robo === e.eng ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{e.name}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4 text-center text-[11px] text-muted-foreground">Nenhum trade fechado ainda {robo !== "all" ? `pelo ${ENGINE_NAME[robo] ?? robo}` : ""} — enche conforme os robôs abrem e fecham operações.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {robo === "all" && <th className="py-1 text-left font-semibold">Robô</th>}
                  <th className="py-1 text-left font-semibold">Ativo</th>
                  <th className="py-1 text-left font-semibold">Lado</th>
                  <th className="py-1 text-right font-semibold">entrada → saída</th>
                  <th className="py-1 text-right font-semibold">líquido % <InfoTip text="PnL do trade − 0,12% (taxa+slippage do round-trip)" /></th>
                  <th className="py-1 text-left font-semibold">saída</th>
                  <th className="py-1 text-right font-semibold">fechado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const long = t.side === "long";
                  const net = t.pnl_pct != null ? t.pnl_pct - FEE_RT : null;
                  const pdec = pxDec(t.entry_px);
                  return (
                    <tr key={`${t.engine}-${t.closed_at}-${i}`} className="border-t border-border/40">
                      {robo === "all" && <td className="py-1.5 font-medium text-foreground">{ENGINE_NAME[t.engine] ?? t.engine}</td>}
                      <td className="py-1.5 font-semibold text-foreground">{t.asset}</td>
                      <td className="py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${long ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{long ? "▲ long" : "▼ short"}</span></td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{t.entry_px != null ? num(t.entry_px, pdec) : "—"} → {t.exit_px != null ? num(t.exit_px, pdec) : "—"}</td>
                      <td className={`py-1.5 text-right tabular-nums font-semibold ${net != null && net > 0 ? "text-emerald-500" : net != null && net < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{net != null ? `${net >= 0 ? "+" : ""}${net.toFixed(2)}` : "—"}</td>
                      <td className="py-1.5 text-[10px] text-muted-foreground">{t.reason ? (REASON_LABEL[t.reason] ?? t.reason) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums text-[10px] text-muted-foreground">{dstr(t.closed_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">Papel (sombra) — nenhum dinheiro real. Mostra os últimos 40 trades do robô escolhido. O desempenho somado está no card <b>Desempenho dos robôs</b>.</p>
      </Card>
  );
}
