import { useMemo } from "react";

import Card from "../../ui/Card";
import InfoTip from "../../InfoTip";
import { BLOCK_LINES } from "../../../lib/bot/constants";
import type { OrderRow, BotPosition } from "../../../lib/bot/types";

/** ACERTO POR BLOCO (Robô 2.0): reconstrói dos trades fechados (bot_orders) + histórico de blocos (block_hist).
 *  Pra cada trade: no instante da ENTRADA, cada bloco CONCORDOU (saldo a favor) ou DISCORDOU da direção? E o
 *  trade GANHOU? Agrega: acerto quando concordou × quando discordou; o SPREAD é o edge real do bloco (régua p/
 *  calibrar os pesos com DADO). Janela = o que o block_hist cobre (~1 dia, cresce). Front-only, não toca no robô. */
export default function BlockAccuracy({ orders, positions }: {
  orders: OrderRow[];
  positions: BotPosition[];
}) {
  const blockPerf = useMemo(() => {
    const histByAsset: Record<string, number[][]> = {};
    for (const p of positions) if (Array.isArray(p.block_hist) && p.block_hist.length) histByAsset[p.asset] = (p.block_hist as number[][]).slice().sort((a, b) => a[0] - b[0]);
    const BLK = BLOCK_LINES.filter((b) => b.id !== "wforce");
    const acc: Record<string, { aN: number; aW: number; dN: number; dW: number }> = {};
    for (const b of BLK) acc[b.id] = { aN: 0, aW: 0, dN: 0, dW: 0 };
    const closes = orders.filter((o) => (o.engine ?? "smc") === "confluence2" && o.action === "close" && o.ok && o.pnl != null);
    let matched = 0;
    for (const cl of closes) {
      const open = orders.filter((o) => o.inst_id === cl.inst_id && (o.engine ?? "smc") === "confluence2" && o.action === "open" && o.ok && new Date(o.created_at).getTime() < new Date(cl.created_at).getTime()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (!open?.side || !cl.inst_id) continue;
      const asset = cl.inst_id.replace(/USDT$|USD$|-SWAP$/i, "");
      const hist = histByAsset[asset];
      if (!hist) continue;
      const et = Math.floor(new Date(open.created_at).getTime() / 1000);
      let pt: number[] | null = null;
      for (const p of hist) { if (p[0] <= et) pt = p; else break; }
      if (!pt) continue;
      matched++;
      const won = (cl.pnl ?? 0) > 0;
      const isLong = open.side === "buy";
      for (const b of BLK) {
        const saldo = Number(pt[b.idx]) || 0;
        if ((isLong && saldo > 8) || (!isLong && saldo < -8)) { acc[b.id].aN++; if (won) acc[b.id].aW++; }
        else if ((isLong && saldo < -8) || (!isLong && saldo > 8)) { acc[b.id].dN++; if (won) acc[b.id].dW++; }
      }
    }
    const rows = BLK.map((b) => {
      const a = acc[b.id];
      const aw = a.aN ? Math.round((100 * a.aW) / a.aN) : null;
      const dw = a.dN ? Math.round((100 * a.dW) / a.dN) : null;
      return { id: b.id, label: b.label, color: b.color, aN: a.aN, aw, dN: a.dN, dw, spread: aw != null && dw != null ? aw - dw : null };
    }).sort((x, y) => (y.spread ?? -999) - (x.spread ?? -999));
    return { rows, matched };
  }, [orders, positions]);

  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">🎯 Acerto por bloco <span className="font-normal text-muted-foreground">— Robô 2.0</span></h2>
          <span className="text-[10px] text-muted-foreground">{blockPerf.matched} trade{blockPerf.matched === 1 ? "" : "s"} medido{blockPerf.matched === 1 ? "" : "s"} · janela ~1 dia, cresce</span>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">Quando o bloco <b>concordou</b> com a direção do trade (na entrada), quantos % ganharam × quando <b>discordou</b>. O <b>spread</b> (concordou − discordou) é o edge real: alto = o bloco prevê e merece mais peso; ≈0 ou negativo = ruído, candidato a menos peso.</p>
        {blockPerf.matched < 3 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-4 text-center text-[11px] text-muted-foreground">Ainda coletando — precisa de trades fechados COM o histórico de blocos (que começou a gravar hoje). Enche ao longo do dia; volte em algumas horas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 text-left font-semibold">Bloco</th>
                  <th className="py-1 text-right font-semibold">concordou (n) <InfoTip text="Nº de trades em que o bloco concordou com a direção" /></th>
                  <th className="py-1 text-right font-semibold">acerto ✓ <InfoTip text="% de acerto dos trades quando o bloco concordou" /></th>
                  <th className="py-1 text-right font-semibold">acerto ✗ <InfoTip text="% de acerto quando o bloco discordou" /></th>
                  <th className="py-1 text-right font-semibold">spread <InfoTip text="concordou − discordou (pontos %); o edge do bloco" /></th>
                </tr>
              </thead>
              <tbody>
                {blockPerf.rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="py-1.5"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: r.color }} />{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.aN}</td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">{r.aw != null ? `${r.aw}%` : "—"}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.dw != null ? `${r.dw}%` : "—"}</td>
                    <td className={`py-1.5 text-right font-bold tabular-nums ${r.spread == null ? "text-muted-foreground" : r.spread >= 15 ? "text-emerald-500" : r.spread <= 0 ? "text-rose-500" : "text-foreground"}`}>{r.spread != null ? `${r.spread >= 0 ? "+" : ""}${r.spread}pp` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">Amostra pequena no começo — <b>não calibre peso ainda</b>; espere ~1 semana pra ter confiança (tipo o que fizemos com as paredes, n=65). Spread verde forte (≥15pp) = candidato a MAIS peso; ≤0 = candidato a MENOS. Janela limitada a ~1 dia (o histórico de blocos); dá pra tornar permanente depois se precisar de amostra maior.</p>
      </Card>
  );
}
