import Card from "../../ui/Card";
import InfoTip from "../../InfoTip";
import { num } from "../../../lib/bot/format";
import { ENGINE_NAME } from "../../../lib/bot/constants";
import type { Config, BotPosition, ShadowOpen } from "../../../lib/bot/types";

/** Posições abertas de TODOS os robôs, identificadas: as REAIS (conta demo, do motor vivo, com PnL ao vivo
 *  e botão de fechar) + as de PAPEL (sombra) de cada robô, com o preço atual e o move % ao vivo. */
export default function OpenPositions({ openPositions, flatAssets, livePos, shadowOpen, spotByAsset, cfg, quote, busy, connected, isFut, closeAsset, pxDec }: {
  openPositions: BotPosition[];
  flatAssets: string[];
  livePos: Record<string, { uPnl: number; markPx: number }>;
  shadowOpen: ShadowOpen[];
  spotByAsset: Record<string, number>;
  cfg: Config | null;
  quote: string;
  busy: string | null;
  connected: boolean;
  isFut: boolean;
  closeAsset: (asset: string, instId: string | null) => void;
  pxDec: (v: number | null | undefined) => number;
}) {
  const nada = openPositions.length === 0 && shadowOpen.length === 0;
  return (
        <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Posições abertas <span className="font-normal text-muted-foreground">— todos os robôs</span></h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${nada ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"}`}>{nada ? "nenhuma aberta" : `${openPositions.length} real · ${shadowOpen.length} papel`}</span>
          </div>

          {nada && (
            <p className="text-sm text-muted-foreground">Nenhuma posição aberta — todos os robôs estão <strong>fora do mercado</strong> agora.</p>
          )}

          {/* REAIS — conta demo (só o motor vivo opera de verdade); com PnL ao vivo e botão de fechar. */}
          {openPositions.length > 0 && (
            <>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reais · conta demo <InfoTip text="Posições que existem de fato na Binance testnet — só o robô VIVO abre estas." /></h3>
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
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400" title="robô que abriu esta posição">{ENGINE_NAME[p.engine ?? "smc"] ?? p.engine}</span>
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
            </>
          )}

          {/* PAPEL — posição SIMULADA de cada robô-sombra (não usa dinheiro), com move % ao vivo pelo preço atual. */}
          {shadowOpen.length > 0 && (
            <div className={openPositions.length > 0 ? "mt-4" : ""}>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Papel · sombras <InfoTip text="Posições SIMULADAS (não usam dinheiro) de cada robô-sombra — servem só para medir o desempenho de cada estratégia." /></h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shadowOpen.map((s) => {
                  const long = s.position === "long";
                  const spot = spotByAsset[s.asset];
                  const pdec = pxDec(s.entry_px);
                  const movePct = s.entry_px && spot ? ((spot - s.entry_px) / s.entry_px) * 100 * (long ? 1 : -1) : null;
                  return (
                    <div key={`${s.engine}-${s.asset}`} className={`rounded-lg border border-dashed p-2.5 ${long ? "border-emerald-500/30 bg-emerald-500/[0.04]" : "border-rose-500/30 bg-rose-500/[0.04]"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">{s.asset}</span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary" title="robô-sombra dono desta posição de papel">{ENGINE_NAME[s.engine] ?? s.engine}</span>
                        </span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${long ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/20 text-rose-600 dark:text-rose-400"}`}>{long ? "▲ LONG" : "▼ SHORT"}</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">entrada <span className="num">{s.entry_px != null ? num(s.entry_px, pdec) : "—"}</span>{spot ? <> · agora <span className="num">{num(spot, pdec)}</span></> : null}</span>
                        {movePct != null && <span className={`num text-sm font-bold ${movePct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{movePct >= 0 ? "+" : ""}{movePct.toFixed(2)}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {flatAssets.length > 0 && (
            <p className="mt-3 text-[11px] text-muted-foreground">Fora do mercado (real): <span className="font-medium text-foreground">{flatAssets.join(" · ")}</span></p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground"><b>Reais</b> = conta demo da Binance (PnL ao vivo em {quote}); só o robô VIVO opera. <b>Papel</b> = posição simulada de cada robô-sombra pra medir desempenho (o move % é pelo preço atual). “rodando” = aberta agora.</p>
        </Card>
  );
}
