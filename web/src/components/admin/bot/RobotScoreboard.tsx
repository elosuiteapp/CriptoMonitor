import { useMemo } from "react";

import Card from "../../ui/Card";
import InfoTip from "../../InfoTip";
import { FEE_RT, BOT_ENGINES } from "../../../lib/bot/constants";
import { num } from "../../../lib/bot/format";
import type { OrderRow, BotPosition } from "../../../lib/bot/types";

/** Desempenho de TODAS as variantes (vivo + sombras) — régua HONESTA: líquido de taxa (0,12%/RT).
 *  REAL (conta demo, PnL em USDT, carimbado por engine) + PAPEL (sombra, % por trade). Só o motor VIVO
 *  opera real; o v28 carrega o histórico real de quando era o vivo. O papel roda p/ os dois sempre. */
export default function RobotScoreboard({ shadowTrades, orders, positions, liveEngine, quote }: {
  shadowTrades: { engine: string; asset: string; side: string; pnl_pct: number | null; closed_at: string }[];
  orders: OrderRow[];
  positions: BotPosition[];
  liveEngine: string | undefined;
  quote: string;
}) {
  // Placar de TODAS as variantes (vivo + sombras) com a RÉGUA HONESTA: PnL LÍQUIDO DE TAXA.
  // A auditoria (memória conf2-3day-verdict) provou que o bruto-% MENTE — a taxa taker/slippage
  // come o edge. FEE_RT = 0,12%/round-trip (0,06%/lado, igual ao bot-backtest). Papel = comparação
  // justa (mesma unidade %); o real em USDT (conta demo) entra só onde há ordens carimbadas por engine.
  const engineBoard = useMemo(() => {
    const liveEng = liveEngine ?? "smc";
    return BOT_ENGINES.map((e) => {
      const tr = shadowTrades.filter((t) => t.engine === e.eng);
      const wins = tr.filter((t) => (Number(t.pnl_pct) || 0) > 0).length;
      const gross = tr.reduce((s, t) => s + (Number(t.pnl_pct) || 0), 0);
      const net = gross - tr.length * FEE_RT;                         // líquido = bruto − nº de trades × taxa RT
      const realCloses = orders.filter((o) => o.action === "close" && o.pnl != null && (o.engine ?? "smc") === e.eng);
      const realPnl = realCloses.reduce((s, o) => s + (Number(o.pnl) || 0), 0);
      const openNow = positions.filter((p) => p.position && p.position !== "flat" && (p.engine ?? "smc") === e.eng).length;
      return { ...e, live: e.eng === liveEng, trades: tr.length, win: tr.length ? Math.round((wins / tr.length) * 100) : 0, gross, net, avgNet: tr.length ? net / tr.length : 0, realTrades: realCloses.length, realPnl, openNow };
    }).sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.net - a.net);   // VIVO no topo, depois por líquido desc
  }, [orders, positions, shadowTrades, liveEngine]);

  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Desempenho dos robôs <span className="font-normal text-muted-foreground">— líquido de taxa</span></h2>
          <span className="text-[10px] text-muted-foreground">papel (%) · líquido = bruto − 0,12%/trade · o ● VIVO também opera real</span>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">A régua da auditoria: o <b>líquido</b> é o que conta — a taxa comeu o edge do 2.0 no bruto. O <b>Robô 3.0</b> = segue a MAIORIA do bloco Técnico (≥3 de 5 indicadores), sem veto de zona — trend-follower puro; a reversão no topo/fundo vem quando o técnico vira.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 text-left font-semibold">Robô</th>
                <th className="py-1 text-right font-semibold">trades</th>
                <th className="py-1 text-right font-semibold">acerto</th>
                <th className="py-1 text-right font-semibold">bruto % <InfoTip text="PnL bruto somado no papel, SEM taxa" /></th>
                <th className="py-1 text-right font-semibold">líquido % <InfoTip text="bruto − 0,12%/trade (a régua que vale)" /></th>
                <th className="py-1 text-right font-semibold">méd/trade <InfoTip text="líquido médio por trade" /></th>
                <th className="py-1 text-right font-semibold">real {quote} <InfoTip text="PnL real na conta demo (só engines com ordens carimbadas)" /></th>
              </tr>
            </thead>
            <tbody>
              {engineBoard.map((e) => (
                <tr key={e.eng} className={`border-t border-border/40 ${e.live ? "bg-emerald-500/[0.06]" : ""}`}>
                  <td className="py-1.5">
                    <span className="font-semibold text-foreground">{e.name}</span>
                    {e.live && <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">● VIVO</span>}
                    {e.openNow > 0 && <span className="ml-1 text-[9px] text-muted-foreground">· {e.openNow} aberta{e.openNow === 1 ? "" : "s"}</span>}
                    <div className="text-[10px] font-normal text-muted-foreground">{e.desc}</div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{e.trades}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{e.trades ? `${e.win}%` : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${e.gross > 0 ? "text-emerald-500" : e.gross < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{e.trades ? `${e.gross >= 0 ? "+" : ""}${e.gross.toFixed(1)}` : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${e.net > 0 ? "text-emerald-500" : e.net < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{e.trades ? `${e.net >= 0 ? "+" : ""}${e.net.toFixed(1)}` : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${e.avgNet > 0 ? "text-emerald-500" : e.avgNet < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{e.trades ? `${e.avgNet >= 0 ? "+" : ""}${e.avgNet.toFixed(2)}` : "—"}</td>
                  <td className={`py-1.5 text-right tabular-nums ${e.realPnl > 0 ? "text-emerald-500" : e.realPnl < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{e.realTrades ? `${e.realPnl >= 0 ? "+" : ""}${num(e.realPnl)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground"><b>Papel</b> = todas as variantes simuladas nas mesmas moedas (régua justa). <b>Líquido</b> desconta 0,12%/trade (taker 0,04% + slippage 0,02%, os dois lados). <b>Real {quote}</b> = conta demo, só onde há ordens carimbadas por engine (o ● VIVO + histórico do v28). Troque o vivo em <b>Configuração → Motor do robô</b>.</p>
      </Card>
  );
}
