import type { Dispatch, SetStateAction } from "react";

import Card from "../../ui/Card";
import type { Learning } from "../../../lib/bot/types";
import Markdown from "../../Markdown";

/** Aprendizado do robô — hit-rate por sinal/moeda + relatório de IA (diagnóstico do próprio histórico). */
export default function LearningPanel({ learning, learnAsset, setLearnAsset, runLearn, busy }: {
  learning: Learning | null;
  learnAsset: string;
  setLearnAsset: Dispatch<SetStateAction<string>>;
  runLearn: () => void;
  busy: string | null;
}) {
  return (
      <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">🧠 Aprendizado do robô</h2>
          <button onClick={runLearn} disabled={busy !== null} className="rounded-md bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/25 disabled:opacity-50">{busy === "learn" ? "Analisando…" : "Gerar diagnóstico"}</button>
        </div>
        {learning?.data ? (() => {
          const d = learning.data!;
          const assetKeys = Object.keys(d.byAsset ?? {}).sort();
          const cur = learnAsset === "all" ? null : d.byAsset?.[learnAsset];
          // Geral usa overall + perSignal global; por-moeda usa o breakdown do ativo.
          const stat = learnAsset === "all" ? { hitRate: d.overall.hitRate, n: d.overall.n } : cur ? { hitRate: cur.hitRate, n: cur.n } : null;
          // Ordena do que mais ajuda pro que mais atrapalha (desempate: mais amostras primeiro).
          const sigs = (learnAsset === "all" ? d.perSignal : cur?.perSignal ?? []).slice().sort((a, b) => b.hitRate - a.hitRate || b.n - a.n);
          const report = learnAsset === "all" ? learning.ai_report : cur?.ai_report ?? null;
          return (
            <>
              {/* Seletor de moeda do aprendizado (Geral + cada ativo com amostra) */}
              <div className="mb-3 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-0.5 w-fit">
                <button onClick={() => setLearnAsset("all")} className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${learnAsset === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>Geral</button>
                {assetKeys.map((a) => (
                  <button key={a} onClick={() => setLearnAsset(a)} className={`rounded-md px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${learnAsset === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a} <span className="opacity-60">{d.byAsset[a].hitRate}%</span></button>
                ))}
              </div>
              <div className="mb-2 text-[11px] text-muted-foreground">
                {learnAsset === "all" ? "Acerto direcional do viés (geral" : `Acerto do viés em ${learnAsset} (`}{d.window}): {stat ? <><span className={`num font-bold ${stat.hitRate >= 52 ? "text-emerald-500" : stat.hitRate <= 48 ? "text-rose-500" : "text-foreground"}`}>{stat.hitRate}%</span> em {stat.n} amostras</> : "amostra insuficiente"}{learnAsset === "all" ? <> · {d.labeled} leituras rotuladas</> : null}
              </div>
              {sigs.length > 0 ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {sigs.map((s) => {
                    const good = s.hitRate >= 55, bad = s.hitRate <= 45;
                    return (
                      <div key={s.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-36 shrink-0 truncate text-muted-foreground" title={s.label}>{s.label}</span>
                        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <span className="absolute inset-y-0 left-1/2 z-10 w-px bg-background/80" />
                          <span className={`absolute inset-y-0 left-0 ${good ? "bg-emerald-500" : bad ? "bg-rose-500" : "bg-muted-foreground/50"}`} style={{ width: `${s.hitRate}%` }} />
                        </span>
                        <span className={`num w-9 text-right font-semibold ${good ? "text-emerald-500" : bad ? "text-rose-500" : "text-muted-foreground"}`}>{s.hitRate}%</span>
                        <span className="num w-16 text-right text-muted-foreground/70" title={`${s.n} amostras rotuladas · peso ${s.weight} no viés${s.edge != null ? ` · edge ${s.edge >= 0 ? "+" : ""}${s.edge} (acerto − 50%)` : ""}`}>n{s.n} · p{s.weight}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Ainda sem acerto por sinal para {learnAsset === "all" ? "o geral" : learnAsset} — precisa de mais leituras rotuladas nessa moeda.</p>
              )}
              {report && (
                <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3 text-xs">
                  <Markdown text={report} />
                </div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">Rotula cada leitura com o que o preço fez ~1h depois → mede quantas vezes cada sinal acertou a direção, <strong>por moeda</strong>. &gt;55% ajuda, &lt;45% atrapalha (contrário). Amostra ainda pequena; melhora conforme o robô roda. Atualizado {new Date(learning.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</p>
            </>
          );
        })() : (
          <p className="text-sm text-muted-foreground">Sem diagnóstico ainda. Clique em <strong>Gerar diagnóstico</strong> — o robô analisa o próprio histórico de leituras e mede o acerto de cada sinal, separado por moeda.</p>
        )}
      </Card>
  );
}
