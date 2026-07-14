import { num } from "../../../lib/bot/format";
import type { Config, BotPosition } from "../../../lib/bot/types";

/** Posições abertas — o que o robô tem em aberto AGORA, com PnL ao vivo e fechar por moeda. */
export default function OpenPositions({ openPositions, flatAssets, livePos, cfg, quote, busy, connected, isFut, closeAsset, pxDec }: {
  openPositions: BotPosition[];
  flatAssets: string[];
  livePos: Record<string, { uPnl: number; markPx: number }>;
  cfg: Config | null;
  quote: string;
  busy: string | null;
  connected: boolean;
  isFut: boolean;
  closeAsset: (asset: string, instId: string | null) => void;
  pxDec: (v: number | null | undefined) => number;
}) {
  return (
        <div className="rounded-xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Posições abertas</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${openPositions.length ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{openPositions.length ? `${openPositions.length} rodando` : "nenhuma aberta"}</span>
          </div>
          {openPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma posição aberta — o robô está <strong>fora do mercado</strong> em todas as moedas.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {openPositions.map((p) => {
                const live = p.inst_id ? livePos[p.inst_id] : undefined;
                const long = p.position === "long";
                const pdec = pxDec(p.entry_px);
                const mark = live?.markPx ?? null;
                const movePct = p.entry_px && mark ? ((mark - p.entry_px) / p.entry_px) * 100 * (long ? 1 : -1) : null;
                return (
                  <div key={p.asset} className={`rounded-lg border p-3 ${long ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.06]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">{p.asset}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${p.engine === "confluence2" ? "bg-sky-500/15 text-sky-600 dark:text-sky-400" : "bg-violet-500/15 text-violet-600 dark:text-violet-400"}`} title="robô que abriu esta posição">{p.engine === "confluence2" ? "Robô 2.0" : "Robô v28"}</span>
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${long ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/20 text-rose-600 dark:text-rose-400"}`}>{long ? "▲ LONG" : "▼ SHORT"}{isFut && cfg?.leverage ? ` ${cfg.leverage}x` : ""}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold"><span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />rodando</span>{p.ctrend && <span className="rounded bg-amber-500/15 px-1 py-0.5 text-amber-600 dark:text-amber-400" title="Aberta contra a tendência — stop curto e tamanho reduzido">contra-tend.</span>}</div>
                    {live ? (
                      <div className={`num mt-1 text-lg font-bold ${live.uPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{live.uPnl >= 0 ? "+" : ""}{num(live.uPnl)} {quote}{movePct != null && <span className="ml-1 text-[11px] font-medium">({live.uPnl >= 0 ? "+" : ""}{movePct.toFixed(2)}%)</span>}</div>
                    ) : (
                      <div className="mt-1 text-[11px] text-muted-foreground">PnL ao vivo indisponível</div>
                    )}
                    <div className="mt-1 text-[10px] text-muted-foreground">entrada <span className="num">{p.entry_px != null ? num(p.entry_px, pdec) : "—"}</span>{mark ? <> · agora <span className="num">{num(mark, pdec)}</span></> : null}{p.adds != null && p.adds > 0 && <span className="ml-1 text-amber-500">· 🔺{p.adds}x</span>}{p.stop_px != null && <span className="ml-1 text-rose-500/80" title="Nível de stop de risco (fecha se furar)"> · stop <span className="num">{num(p.stop_px, pdec)}</span></span>}</div>
                    {p.last_bias != null && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">viés atual <span className={`num font-semibold ${p.last_bias > 0 ? "text-emerald-600 dark:text-emerald-400" : p.last_bias < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>{p.last_bias >= 0 ? "+" : ""}{p.last_bias}</span></div>
                    )}
                    <button onClick={() => closeAsset(p.asset, p.inst_id)} disabled={busy !== null || !connected} className="mt-2 w-full rounded-md bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-50 dark:text-rose-400">{busy === "close" + p.asset ? "Fechando…" : "✕ Fechar agora"}</button>
                  </div>
                );
              })}
            </div>
          )}
          {flatAssets.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">Fora do mercado: <span className="font-medium text-foreground">{flatAssets.join(" · ")}</span></p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">Cada moeda opera sozinha (consenso de 5 timeframes; a tendência 4H+1D manda no lado). PnL ao vivo da Binance demo; “rodando” = posição aberta agora.</p>
        </div>
  );
}
