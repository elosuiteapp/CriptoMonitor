import Card from "../../ui/Card";
import { num } from "../../../lib/bot/format";
import { assetOf } from "../../../lib/bot/trades";
import type { OrderRow, BotPosition } from "../../../lib/bot/types";

/** Execuções — TODAS as ordens enviadas (robô + manuais numa tabela só; use o filtro Origem). */
export default function ExecutionsTable({ filtered, botOrders, manualOrders, orders, positions, busy, pxDec, cancelOrder, deleteOrder }: {
  filtered: OrderRow[];
  botOrders: OrderRow[];
  manualOrders: OrderRow[];
  orders: OrderRow[];
  positions: BotPosition[];
  busy: string | null;
  pxDec: (v: number | null | undefined) => number;
  cancelOrder: (o: OrderRow) => void;
  deleteOrder: (o: OrderRow) => void;
}) {
  // Tabela de execuções reusável (mesmo layout p/ robô e manual).
  const ordersTable = (rows: OrderRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Lado</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Preço</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Situação</th><th className="px-4 py-2 font-medium">Por</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const a = assetOf(o) || null;
            const hasPos = positions.some((x) => x.asset === a && x.position !== "flat");
            const tipo = o.action === "open" ? "Abertura" : o.action === "add" ? "Adição" : o.action === "close" ? "Saída" : "Manual";
            return (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-2 font-semibold text-foreground">{a ?? "—"}</td>
                <td className="px-4 py-2 text-[11px] text-muted-foreground" title={o.note ?? undefined}>{tipo}{o.note ? " ℹ️" : ""}</td>
                <td className={`px-4 py-2 font-medium ${o.side === "buy" ? "text-emerald-500" : "text-rose-500"}`}>{o.side === "buy" ? "compra" : "venda"}</td>
                <td className="num px-4 py-2 text-right text-foreground">{o.sz}</td>
                <td className="num px-4 py-2 text-right text-foreground">{o.avg_px != null ? num(o.avg_px, pxDec(o.avg_px)) : "—"}</td>
                <td className="num px-4 py-2 text-right">{o.pnl != null ? <span className={o.pnl >= 0 ? "text-emerald-500" : "text-rose-500"} title="resultado realizado no fechamento">{o.pnl >= 0 ? "+" : ""}{num(o.pnl)}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2">
                  {!o.ok ? (
                    <span className="text-rose-500" title={o.result?.data?.[0]?.sMsg ?? o.result?.msg ?? ""}>erro</span>
                  ) : o.action === "close" ? (
                    <span className="text-[10px] text-muted-foreground">saída ok</span>
                  ) : (() => {
                    const closedAfter = orders.some((x) => x.inst_id === o.inst_id && x.action === "close" && x.ok && new Date(x.created_at) > new Date(o.created_at));
                    return hasPos && !closedAfter
                      ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />posição aberta</span>
                      : <span className="text-[10px] text-muted-foreground">encerrada</span>;
                  })()}
                </td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${o.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{o.source === "auto" ? "robô" : "manual"}</span></td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {o.ord_type === "limit" && o.ok && o.result?.data?.[0]?.ordId && (
                    <button onClick={() => cancelOrder(o)} disabled={busy !== null} className="mr-3 text-[11px] text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400">cancelar</button>
                  )}
                  <button onClick={() => deleteOrder(o)} disabled={busy !== null} className="text-[11px] text-muted-foreground hover:text-rose-500 hover:underline disabled:opacity-50" title={!o.ok ? "Remove a ordem com erro do histórico (não afeta a posição)" : hasPos ? `Fecha a posição de ${a} e remove a ordem` : "Remove do histórico"}>
                    {o.ok && hasPos ? "cancelar" : "excluir"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
      <Card className="overflow-hidden hover:border-foreground/15 hover:shadow-card-hover">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Execuções <span className="text-xs font-normal text-muted-foreground">· toda ordem enviada à corretora</span></h2>
          <span className="text-[11px] text-muted-foreground">{botOrders.length} do robô · {manualOrders.length} manuais</span>
        </div>
        {filtered.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{orders.length ? "Nenhuma ordem no filtro atual." : "Nenhuma ordem enviada ainda."}</p>
        ) : ordersTable(filtered)}
        <p className="px-4 py-2 text-[10px] text-muted-foreground"><strong>Resultado</strong> só aparece na <strong>Saída</strong> (o lucro/prejuízo é do trade inteiro, não de cada compra/venda) — o consolidado está em “Trades encerrados” acima. Passe o mouse no <strong>Tipo</strong> pra ver a nota da ordem. PnL ao vivo das posições abertas está em “Posições abertas”.</p>
      </Card>
  );
}
