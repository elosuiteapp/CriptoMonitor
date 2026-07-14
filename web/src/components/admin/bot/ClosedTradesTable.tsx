import { num } from "../../../lib/bot/format";
import type { ClosedTrade } from "../../../lib/bot/trades";

const durLabel = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}` : `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`);

/** Trades encerrados — round-trips fechados (pelo robô ou por você), com resultado realizado. */
export default function ClosedTradesTable({ fClosedTrades, closedTrades, pnlByAsset, quote, pxDec }: {
  fClosedTrades: ClosedTrade[];
  closedTrades: ClosedTrade[];
  pnlByAsset: [string, number][];
  quote: string;
  pxDec: (v: number | null | undefined) => number;
}) {
  return (
      <div className="overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Trades encerrados <span className="text-xs font-normal text-muted-foreground">· receita realizada</span></h2>
          {pnlByAsset.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {pnlByAsset.map(([a, v]) => (
                <span key={a} className={`num rounded px-1.5 py-0.5 font-semibold ${v >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>{a} {v >= 0 ? "+" : ""}{num(v)}</span>
              ))}
            </span>
          )}
        </div>
        {fClosedTrades.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{closedTrades.length === 0 ? "Nenhum trade encerrado ainda. Quando o robô sair de uma posição (ou você fechar), o resultado aparece aqui." : "Nenhum trade encerrado no filtro atual."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 font-medium">Fechado</th><th className="px-4 py-2 font-medium">Ativo</th><th className="px-4 py-2 font-medium">Direção</th><th className="px-4 py-2 text-right font-medium">Entrada → Saída</th><th className="px-4 py-2 text-right font-medium">Tam.</th><th className="px-4 py-2 text-right font-medium">Duração</th><th className="px-4 py-2 font-medium">Motivo</th><th className="px-4 py-2 text-right font-medium">Resultado</th><th className="px-4 py-2 font-medium">Por</th></tr>
              </thead>
              <tbody>
                {fClosedTrades.map((t) => {
                  const pdec = pxDec(t.exit ?? t.entry);
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="num whitespace-nowrap px-4 py-2 text-muted-foreground">{new Date(t.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-2 font-semibold text-foreground">{t.asset}</td>
                      <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${t.wasLong ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{t.wasLong ? "long" : "short"}</span></td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right text-muted-foreground" title={t.estimated ? "≈ reconstruído da ordem de abertura (o fill do fechamento não retornou da corretora)" : undefined}>{t.estimated ? "≈ " : ""}{t.entry != null ? num(t.entry, pdec) : "—"} <span className="text-muted-foreground/50">→</span> <span className="text-foreground">{t.exit != null ? num(t.exit, pdec) : "—"}</span></td>
                      <td className="num px-4 py-2 text-right text-foreground">{t.sz != null ? num(t.sz, 6) : "—"}</td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right text-muted-foreground" title={t.openAt ? `aberto ${new Date(t.openAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : undefined}>{durLabel(t.durMin)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted-foreground" title={t.note || undefined}>{t.reason}</td>
                      <td className="num whitespace-nowrap px-4 py-2 text-right">{t.pnl != null ? <span className={`font-semibold ${t.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`} title={t.estimated ? "≈ estimado (reconstruído da abertura)" : undefined}>{t.estimated ? "≈ " : ""}{t.pnl >= 0 ? "+" : ""}{num(t.pnl)} {quote}{t.pct != null && <span className="ml-1 text-[11px] font-normal">({t.pct >= 0 ? "+" : ""}{t.pct.toFixed(2)}%)</span>}</span> : <span className="text-muted-foreground" title="sem preço de entrada nem PnL salvos — não deu pra reconstruir">—</span>}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.source === "auto" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{t.source === "auto" ? "robô" : "manual"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[10px] text-muted-foreground">Cada linha é um trade que <strong>já fechou</strong> (abriu → fechou). Entrada = preço médio (reconstruído do PnL; com <strong>≈</strong> = recuperado da ordem de abertura quando a corretora não devolveu o fill). <strong>Motivo</strong>: 🎯 alvo na liquidez · 🛡️ trailing (lucro travado) · 🛑 stop · ↩ reversão do robô · ✋ manual.</p>
          </div>
        )}
      </div>
  );
}
