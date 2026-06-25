// Painel "Leitura da ação" — o que o investidor de bolsa olha (força relativa vs
// IBOV, médias, suporte/resistência, volume). Foco da aba p/ ações; o SMC/ICT fica
// como camada avançada abaixo. Tudo dos candles diários (sem fonte paga).
import type { ReactNode } from "react";

import type { StockRead } from "../../lib/b3StockRead";
import { fmtBRL, fmtVol } from "./B3Shared";

const pp = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-3">
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export default function B3StockReadPanel({ asset, read }: { asset: string; read: StockRead }) {
  const { rel, ma, vol, support, resistance, beta } = read;
  const hasAny = rel || ma || vol || support || resistance;
  if (!hasAny) return null;

  const relTone = rel?.verdict === "outperform" ? "text-emerald-500" : rel?.verdict === "underperform" ? "text-rose-500" : "text-muted-foreground";
  const relWord = rel?.verdict === "outperform" ? "Bate o IBOV" : rel?.verdict === "underperform" ? "Fica atrás do IBOV" : "Anda com o IBOV";
  const trendTone = ma?.trend.startsWith("alta") ? "text-emerald-500" : ma?.trend.startsWith("baixa") ? "text-rose-500" : "text-muted-foreground";
  const volTone = !vol ? "" : vol.ratio >= 1.15 ? "text-sky-500" : vol.ratio <= 0.85 ? "text-muted-foreground" : "text-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card dark:bg-card/60 dark:shadow-glow">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Leitura da ação · {asset}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {/* Força relativa vs IBOV */}
        <Block title="Força relativa vs IBOV">
          {rel ? (
            <>
              <div className={`text-sm font-semibold ${relTone}`}>{relWord}</div>
              <div className="mt-1 space-y-0.5">
                {rel.windows.map((w) => (
                  <div key={w.label} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{w.label}</span>
                    <span className="num text-foreground">
                      {pct(w.assetPct)} <span className="text-muted-foreground">vs {pct(w.ibovPct)}</span>{" "}
                      <span className={w.rs >= 0 ? "text-emerald-500" : "text-rose-500"}>{pp(w.rs)}pp</span>
                    </span>
                  </div>
                ))}
              </div>
              {beta != null && (
                <div className="mt-1.5 flex items-center justify-between border-t border-border/50 pt-1.5 text-[11px]">
                  <span className="text-muted-foreground">Beta (1 ano)</span>
                  <span className="num text-foreground">
                    {beta.toFixed(2)} <span className="text-muted-foreground">· {beta >= 1.1 ? "amplifica o IBOV" : beta <= 0.9 ? "mais defensivo" : "anda com o IBOV"}</span>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Histórico insuficiente.</div>
          )}
        </Block>

        {/* Tendência por médias */}
        <Block title="Tendência (médias)">
          {ma ? (
            <>
              <div className={`text-sm font-semibold capitalize ${trendTone}`}>
                {ma.trend}
                {ma.cross && <span className={`ml-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${ma.cross === "golden" ? "border-emerald-500/40 text-emerald-500" : "border-rose-500/40 text-rose-500"}`}>{ma.cross === "golden" ? "golden cross" : "death cross"}</span>}
              </div>
              <div className="num mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                <div>MM20 {ma.mm20 != null ? fmtBRL(ma.mm20) : "—"} · preço {ma.price > (ma.mm20 ?? Infinity) ? "acima" : "abaixo"}</div>
                <div>MM50 {ma.mm50 != null ? fmtBRL(ma.mm50) : "—"} · MM200 {ma.mm200 != null ? fmtBRL(ma.mm200) : "—"}</div>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Histórico insuficiente.</div>
          )}
        </Block>

        {/* Suporte & Resistência */}
        <Block title="Suporte & Resistência">
          <div className="space-y-1 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-rose-500">Resistência</span>
              <span className="num text-foreground">{resistance ? `${fmtBRL(resistance.price)} (${pct(resistance.distPct)})` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-emerald-500">Suporte</span>
              <span className="num text-foreground">{support ? `${fmtBRL(support.price)} (${pct(support.distPct)})` : "—"}</span>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Pivôs recentes (topos/fundos).</p>
        </Block>

        {/* Volume vs média */}
        <Block title="Volume vs média">
          {vol ? (
            <>
              <div className={`text-sm font-semibold ${volTone}`}>{vol.ratio.toFixed(1)}× a média</div>
              <div className="text-xs capitalize text-muted-foreground">{vol.label}</div>
              <div className="num mt-1 text-[11px] text-muted-foreground">hoje {fmtVol(vol.last)} · média {fmtVol(vol.avg20)}</div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Sem volume.</div>
          )}
        </Block>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Força relativa = retorno do ativo menos o do IBOV (pp = pontos percentuais). Educacional — não é recomendação.</p>
    </div>
  );
}
