import type { Dispatch, SetStateAction } from "react";

import Card from "../../ui/Card";
import type { BtTrade } from "../../../lib/bot/types";

/** Backtester — mede a expectância da estratégia em candles reais (expectância em R, win rate, PF, drawdown). */
export default function Backtester({ btAsset, setBtAsset, btDays, setBtDays, btBusy, runBacktest, btResult }: {
  btAsset: string;
  setBtAsset: Dispatch<SetStateAction<string>>;
  btDays: number;
  setBtDays: Dispatch<SetStateAction<number>>;
  btBusy: boolean;
  runBacktest: () => void;
  btResult: { params: Record<string, string | number>; metrics: Record<string, number>; trades?: BtTrade[]; equity?: number[] } | null;
}) {
  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">📈 Backtester · a estratégia dá lucro?</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-border bg-background p-0.5">
              {["BTC", "ETH", "SOL", "BNB", "AAVE"].map((a) => (
                <button key={a} onClick={() => setBtAsset(a)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors ${btAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a}</button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground">janela <input type="number" min="3" max="60" value={btDays} onChange={(e) => setBtDays(Number(e.target.value))} className="w-14 rounded border border-border bg-background px-2 py-0.5 num" /> dias</label>
            <button onClick={runBacktest} disabled={btBusy} className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50">{btBusy ? "Rodando…" : "Rodar backtest"}</button>
          </div>
        </div>
        {btResult ? (() => {
          const m = btResult.metrics, p = btResult.params;
          const hrs = m.avg_bars != null ? (m.avg_bars * 15) / 60 : null; // barras de 15m → horas
          const cards: { label: string; value: string; tone: "up" | "down" | ""; title?: string }[] = [
            { label: "Expectância (R/trade)", value: `${m.expectancy_r >= 0 ? "+" : ""}${m.expectancy_r}R`, tone: m.expectancy_r > 0 ? "up" : m.expectancy_r < 0 ? "down" : "", title: "R líquido médio por trade (1R = distância da entrada ao stop). Positivo = estratégia com edge no período." },
            { label: "Win rate", value: `${m.win_rate}%`, tone: "" },
            { label: "Profit factor", value: `${m.profit_factor}`, tone: m.profit_factor >= 1 ? "up" : "down", title: "Soma dos ganhos ÷ soma das perdas (em R). Acima de 1 = lucrativo." },
            { label: "Retorno (risco composto)", value: `${m.total_return_pct >= 0 ? "+" : ""}${m.total_return_pct}%`, tone: m.total_return_pct > 0 ? "up" : "down" },
            { label: "Max drawdown", value: `-${m.max_drawdown_pct}%`, tone: "down" },
            { label: "Trades", value: `${m.trades}`, tone: "" },
            { label: "Ganho / Perda médio", value: `+${m.avg_win_r}R / ${m.avg_loss_r}R`, tone: "" },
            { label: "Long / Short (win%)", value: `${m.longs}·${m.longs_win}% / ${m.shorts}·${m.shorts_win}%`, tone: "" },
            { label: "Exposição", value: m.exposure_pct != null ? `${m.exposure_pct}%` : "—", tone: "", title: "% do tempo com posição aberta. Baixa exposição com boa expectância = estratégia seletiva (bom)." },
            { label: "Duração média", value: hrs != null ? (hrs < 24 ? `${hrs.toFixed(1)}h` : `${(hrs / 24).toFixed(1)}d`) : "—", tone: "", title: "Tempo médio de cada trade (barras de 15m)." },
          ];
          // Curva de capital + saídas por motivo (amostra dos últimos 60 trades salvos pelo backtester)
          const eqs = btResult.equity ?? [];
          const sample = btResult.trades ?? [];
          const byReason = ["alvo", "stop", "reversão", "fim"].map((rz) => {
            const g = sample.filter((t) => t.reason === rz);
            return g.length ? { rz, n: g.length, win: Math.round((g.filter((t) => t.r > 0).length / g.length) * 100), r: Math.round(g.reduce((s, t) => s + t.r, 0) * 10) / 10 } : null;
          }).filter(Boolean) as { rz: string; n: number; win: number; r: number }[];
          const RZ_ICON: Record<string, string> = { alvo: "🎯", stop: "🛑", "reversão": "↩", fim: "🏁" };
          return (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {cards.map((c) => (
                  <div key={c.label} className="rounded-lg border border-border/70 bg-background/40 p-2.5" title={c.title}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                    <div className={`num text-lg font-bold ${c.tone === "up" ? "text-emerald-500" : c.tone === "down" ? "text-rose-500" : "text-foreground"}`}>{c.value}</div>
                  </div>
                ))}
              </div>
              {eqs.length > 1 && (() => {
                const min = Math.min(...eqs, 1), max = Math.max(...eqs, 1);
                const W = 600, H = 64, span = max - min || 1;
                const pts = eqs.map((v, i) => `${((i / (eqs.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(" ");
                const fin = eqs[eqs.length - 1];
                const y1 = H - ((1 - min) / span) * H; // linha do capital inicial (1.0)
                return (
                  <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-2.5">
                    <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span>Curva de capital (risco composto, trade a trade)</span>
                      <span className={`num font-bold normal-case ${fin >= 1 ? "text-emerald-500" : "text-rose-500"}`}>{fin >= 1 ? "+" : ""}{((fin - 1) * 100).toFixed(1)}%</span>
                    </div>
                    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none">
                      <line x1="0" y1={y1} x2={W} y2={y1} stroke="currentColor" className="text-border" strokeDasharray="4 4" strokeWidth="1" />
                      <polyline points={pts} fill="none" stroke={fin >= 1 ? "#10b981" : "#f43f5e"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </div>
                );
              })()}
              {byReason.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wide text-muted-foreground">Saídas</span>
                  {byReason.map((b) => (
                    <span key={b.rz} className={`num rounded px-1.5 py-0.5 font-semibold ${b.r >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`} title={`${b.n} trades fechados por ${b.rz} · ${b.win}% no verde · soma ${b.r >= 0 ? "+" : ""}${b.r}R`}>{RZ_ICON[b.rz]} {b.rz} {b.n} · {b.win}% · {b.r >= 0 ? "+" : ""}{b.r}R</span>
                  ))}
                  <span className="text-muted-foreground">(últimos {sample.length} trades)</span>
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">{p.asset} · {p.days}d · motor <strong>{p.engine ?? "SMC 15m"}</strong> · entrada {p.entry_mode ?? "smc"} · imbalance {p.imbalance}{p.imb_mode ? ` (${p.imb_mode})` : ""} · stop {p.stop} · alvo {p.target} · trailing {p.trailing}{p.trail_floor ? ` (piso ${p.trail_floor})` : ""} · técnico {p.ta_filter ?? "off"}{p.ta_scope ? `/${p.ta_scope}` : ""} · reversão {p.rev_mode ?? "off"} · risco {p.risk_pct}% · taxa+slip {p.fee_pct}+{p.slip_pct}%/lado · <strong>fluxo neutro (não backtestável)</strong>; fills no fechamento do candle. Educacional — não garante o futuro.</p>
            </>
          );
        })() : (
          <p className="text-sm text-muted-foreground">Escolha a moeda e a janela e clique <strong>Rodar backtest</strong> — o MESMO motor do robô roda sobre candles reais e mede se a estratégia teria dado lucro: <strong>expectância em R</strong>, win rate, profit factor e drawdown. Leva ~5-15s.</p>
        )}
      </Card>
  );
}
