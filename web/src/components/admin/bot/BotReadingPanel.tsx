import Card from "../../ui/Card";
import { SIG_GROUPS } from "../../../lib/bot/constants";
import { num, decisionLabel, sigRole, conf2Role } from "../../../lib/bot/format";
import type { Config, Reading, BotPosition } from "../../../lib/bot/types";

/** Leitura do robô (fluxo) — da moeda em foco (seletor no cabeçalho do gráfico). */
export default function BotReadingPanel({ selReading, cfg, selPos, selAsset }: {
  selReading: Reading | null;
  cfg: Config | null;
  selPos: BotPosition | null;
  selAsset: string;
}) {
  if (!selReading) return null;
  const r = selReading;
  const bias = r.bias;
  // ±18 = limiar de regime do bot-run (up/down/range) — mesma régua do backend.
  const bc = bias >= 18 ? "text-emerald-500" : bias <= -18 ? "text-rose-500" : "text-muted-foreground";
  const flow = r.flowTilt ?? r.structure?.flowBias ?? 0;
  const vetoAt = Math.max(1, Number(cfg?.flow_veto ?? 10));
  const revMode = String(cfg?.rev_mode ?? "off");
  const setup = r.setup ?? r.structure?.setup ?? null;
  const planStop = r.planStop ?? r.structure?.planStop ?? null;
  const planTarget = r.planTarget ?? r.structure?.planTarget ?? null;
  const gate = r.gate ?? null;
  const held = !!gate && /contra|bloqueada|segura|não faz short/i.test(gate);
  const posNow = selPos?.position ?? r.position ?? "flat";
  const setupUp = !!setup && setup.includes("↑");
  const c2 = r.confluence2;
  // FORÇA PONDERADA = Σ(peso × força do bloco) — a variável que decide (card 1). −100..+100.
  const c2saldo = c2 && c2.wforce != null ? c2.wforce : null;
  return (
          <Card className="hover:border-foreground/15 hover:shadow-card-hover p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">🧠 Leitura do robô · {selAsset} · {r.confluence2 ? "Robô 2.0 · confluência dos 5 blocos" : "SMC price-action"} 15m</h2>
              <span className="text-[11px] text-muted-foreground">{cfg?.last_run ? `atualizado ${new Date(cfg.last_run).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
            </div>
            {/* Contexto — regime estrutural, zona, gamma, posição e auto-peso */}
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-[11px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">Contexto</span>
              <span className={`rounded px-1.5 py-0.5 font-bold ${bias >= 18 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : bias <= -18 ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`} title="Regime pela estrutura SMC do 15m (BOS/CHoCH + swings): ±18 = tendência; entre eles = range.">estrutura 15m: {bias >= 18 ? "ALTA" : bias <= -18 ? "BAIXA" : "range"}</span>
              {r.structure?.zone && (
                <span className="text-muted-foreground" title="Zona do range entre swing low e swing high: discount = barato (favorece compra) · premium = caro (favorece venda) · equilíbrio = meio.">zona: <span className="text-foreground">{r.structure.zone}</span></span>
              )}
              {r.structure?.gammaRegime && r.structure.gammaRegime !== "neutral" && (
                <span className={`rounded px-1.5 py-0.5 font-semibold ${r.structure.gammaRegime === "negative" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`} title={r.structure.gammaRegime === "positive" ? "Gamma positivo: dealers amortecem o preço (pinning/reversão) — rompimento tende a falhar" : "Gamma negativo: dealers amplificam (tendência) — rompimento anda mais"}>γ {r.structure.gammaRegime === "positive" ? "positivo (reversão)" : "negativo (tendência)"}</span>
              )}
              <span className={`rounded px-1.5 py-0.5 font-semibold ${posNow === "long" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : posNow === "short" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`} title="Posição atual do robô nesta moeda (pirâmide = adições no lucro).">posição: {posNow === "long" ? "LONG" : posNow === "short" ? "SHORT" : "fora"}{posNow !== "flat" && (selPos?.adds ?? r.adds ?? 0) > 0 ? ` +${selPos?.adds ?? r.adds}` : ""}{posNow !== "flat" && r.leverage ? ` · ${r.leverage}x` : ""}</span>
              {r.structure?.autoWeight?.on && (
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-semibold text-violet-600 dark:text-violet-400" title="Auto-ponderação ligada: o aprendizado desta moeda ajusta o peso dos sinais (o que acerta pesa mais).">auto-peso on</span>
              )}
            </div>
            {/* Pipeline de decisão: estrutura decide → gatilho arma → fluxo/técnico vetam → decisão */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                {c2 && c2saldo != null ? (<>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="FORÇA PONDERADA = Σ (peso do bloco × força do bloco), −100..+100. É a variável que DECIDE: abre quando passa ±o limiar de entrada. Blocos com mais peso puxam mais.">1 · Força ponderada</div>
                  <div className={`num text-2xl font-bold ${c2saldo > 0 ? "text-emerald-500" : c2saldo < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{c2saldo >= 0 ? "+" : ""}{c2saldo}</div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-muted/50">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                    <div className={`absolute top-0 h-full rounded-full ${c2saldo >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={c2saldo >= 0 ? { left: "50%", width: `${Math.abs(c2saldo) / 2}%` } : { right: "50%", width: `${Math.abs(c2saldo) / 2}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">abre em ±{c2.enter} · segura ±{c2.hold}</div>
                </>) : (<>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Viés da estrutura SMC do 15m — a ÚNICA leitura que abre trade.">1 · Estrutura 15m</div>
                  <div className={`num text-2xl font-bold ${bc}`}>{bias >= 0 ? "+" : ""}{bias}</div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-muted/50">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                    <div className={`absolute top-0 h-full rounded-full ${bias >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={bias >= 0 ? { left: "50%", width: `${Math.abs(bias) / 2}%` } : { right: "50%", width: `${Math.abs(bias) / 2}%` }} />
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">decide entrada, stop e alvo</div>
                </>)}
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Setup SMC armado agora: imbalance (FVG fresco) ou OB/FVG a favor de BOS/CHoCH após varrer liquidez ou em discount/premium.">2 · Gatilho (setup)</div>
                <div className={`truncate text-lg font-bold leading-8 ${setup ? (setupUp ? "text-emerald-500" : "text-rose-500") : "text-muted-foreground"}`} title={setup ?? undefined}>{setup ?? "nenhum"}</div>
                <div className="text-[10px] text-muted-foreground">{setup ? `stop ${num(planStop)} · alvo ${num(planTarget)}` : "aguarda OB/FVG ou imbalance"}</div>
              </div>
              <div className={`rounded-lg border p-3 text-center ${held && gate!.includes("confluência") ? "border-amber-500/40 bg-amber-500/5" : "border-border/70 bg-background/40"}`}>
                {(() => {
                  const c2 = r.confluence2;
                  // ROBÔ 2.0 — os 5 blocos (força IGUAL por indicador): X/5 na direção + bolinha por bloco + força total.
                  if (c2 && c2.groups?.length) {
                    const dir = c2.dir;
                    const dirLbl = dir === "long" ? "Compra" : dir === "short" ? "Venda" : "Neutro";
                    return (<>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Como os 5 blocos estão votando AGORA (uma bolinha por bloco). O PESO de cada bloco aparece no card do bloco lá embaixo. Quem decide é a força ponderada (card 1).">3 · Blocos</div>
                      <div className={`text-2xl font-bold ${dir === "long" ? "text-emerald-500" : dir === "short" ? "text-rose-500" : "text-muted-foreground"}`}>{dirLbl}</div>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        {c2.groups.map((g) => (
                          <span key={g.key} title={`${g.label} (peso ${g.weight}%): ${g.up}↑ ${g.dn}↓ · saldo ${g.score >= 0 ? "+" : ""}${g.score} (${g.vote === 1 ? "compra" : g.vote === -1 ? "venda" : "neutro"})`} className={`h-2.5 w-2.5 rounded-full ${g.vote === 1 ? "bg-emerald-500" : g.vote === -1 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                        ))}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">abre em ±{c2.enter} de força</div>
                    </>);
                  }
                  const scope = String((cfg as Record<string, unknown> | null)?.conf_scope ?? "smc_flow");
                  const groups = (r.confluence ?? []).filter((g) => scope !== "smc_flow" || g.key === "estrutura" || g.key === "fluxo");
                  const need = Math.min(groups.length || 2, Number(r.confMin ?? cfg?.conf_min ?? 2));
                  return (<>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground" title="Confluência v21 'SMC + pressão': só ESTRUTURA (SMC 15m) e FLUXO (book inst+varejo, liqs, gamma, CVD div) decidem — os dois precisam votar na direção do setup (2 de 2). Técnico e Sentimento viraram estudo (fora da decisão).">3 · Confluência (SMC + pressão)</div>
                    {groups.length ? (<>
                      <div className="num text-2xl font-bold text-foreground" title={r.confVotes ? `${r.confVotes.for} a favor × ${r.confVotes.against} contra` : undefined}>{r.confVotes ? `${r.confVotes.for}/${groups.length}` : "—"}</div>
                      <div className="mt-1 flex items-center justify-center gap-1.5">
                        {groups.map((g) => (
                          <span key={g.key} title={`${g.label}: ${g.score >= 0 ? "+" : ""}${g.score} (${g.vote === 1 ? "compra" : g.vote === -1 ? "venda" : "neutro"})`} className={`h-2.5 w-2.5 rounded-full ${g.vote === 1 ? "bg-emerald-500" : g.vote === -1 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                        ))}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">precisa {need} de {groups.length} · fluxo {flow >= 0 ? "+" : ""}{flow}</div>
                    </>) : (<>
                      <div className={`num text-2xl font-bold ${flow >= vetoAt ? "text-emerald-500" : flow <= -vetoAt ? "text-rose-500" : "text-muted-foreground"}`}>{flow >= 0 ? "+" : ""}{flow}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">aguardando 1º ciclo…</div>
                    </>)}
                  </>);
                  })()}
              </div>
              <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">4 · Decisão</div>
                {(() => { const d = selPos?.last_decision ?? cfg?.last_decision; return <div className={`text-2xl font-bold ${d === "buy" || d === "long" || d === "add" ? "text-emerald-500" : d === "sell" || d === "short" ? "text-rose-500" : "text-foreground"}`}>{d === "add" ? "Pirâmide" : decisionLabel(d)}</div>; })()}
                <div className="text-[10px] text-muted-foreground">{revMode === "off" ? "sai só por stop/alvo/trailing" : revMode === "imbalance" ? "reverte só com FVG fresco contra" : "reverte a cada sinal contrário"}</div>
              </div>
            </div>
            {/* Motivo — o porquê da decisão deste ciclo (gate de veto ou nota do plano) */}
            {gate && (
              <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${held ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : gate.startsWith("sem") ? "border-border/70 bg-background/40 text-muted-foreground" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                {held ? <>⏸ <strong>Segurou:</strong> {gate}</> : gate.startsWith("sem") ? <>Sem gatilho neste ciclo: {gate} — o robô aguarda um setup SMC a favor da estrutura.</> : <>🎯 <strong>Gatilho armado:</strong> {gate}</>}
              </div>
            )}
            <div className="mt-3 space-y-3">
              {SIG_GROUPS.map((grp) => {
                const items = r.signals.filter((s) => s.group === grp && !(r.confluence2 && s.key === "vwap")); // VWAP fora do bloco Técnico do Robô 2.0 (segue visível no v28)
                if (!items.length) return null;
                const blk = r.confluence2?.groups.find((g) => g.label === grp); // força do bloco (Robô 2.0)
                return (
                  <div key={grp} className={`rounded-lg border p-2.5 ${blk ? (blk.vote === 1 ? "border-emerald-500/30 bg-emerald-500/[0.04]" : blk.vote === -1 ? "border-rose-500/30 bg-rose-500/[0.04]" : "border-border/60 bg-background/30") : "border-border/60 bg-background/30"}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                        {grp}
                        {blk && <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-bold text-primary" title="Peso deste bloco na força ponderada (ajustável em Configuração).">{blk.weight}%</span>}
                      </span>
                      {blk && (
                        <div className="flex items-center gap-1.5" title="SALDO DO BLOCO (−100..+100): indicadores com peso igual, o bloco segue a maioria. Entra na força ponderada com o peso do bloco.">
                          <span className="text-[10px] tabular-nums text-muted-foreground">{blk.up}↑ {blk.dn}↓</span>
                          <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-muted/50">
                            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                            <div className={`absolute top-0 h-full rounded-full ${blk.score >= 0 ? "bg-emerald-500/80" : "bg-rose-500/80"}`} style={blk.score >= 0 ? { left: "50%", width: `${Math.abs(blk.score) / 2}%` } : { right: "50%", width: `${Math.abs(blk.score) / 2}%` }} />
                          </div>
                          <span className={`num w-9 text-right text-xs font-bold ${blk.score > 0 ? "text-emerald-500" : blk.score < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{blk.score >= 0 ? "+" : ""}{blk.score}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {items.map((s) => { const role = r.confluence2 ? conf2Role(s.key) : sigRole(s.key); return (
                        <div key={s.key} className="flex items-center gap-2 text-xs">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.score > 8 ? "bg-emerald-500" : s.score < -8 ? "bg-rose-500" : "bg-muted-foreground/40"}`} />
                          <span className="w-40 shrink-0 truncate text-foreground" title={s.label}>{s.label}</span>
                          <span className={`hidden w-12 shrink-0 rounded px-1 py-px text-center text-[9px] font-semibold uppercase sm:inline-block ${role.cls}`} title={role.title}>{role.tag}</span>
                          <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block" title={s.note}>{s.note}</span>
                          <div className="relative h-1.5 w-16 shrink-0 rounded-full bg-muted/50">
                            <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                            <div className={`absolute top-0 h-full rounded-full ${s.score >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={s.score >= 0 ? { left: "50%", width: `${Math.abs(s.score) / 2}%` } : { right: "50%", width: `${Math.abs(s.score) / 2}%` }} />
                          </div>
                          <span className={`num w-8 shrink-0 text-right ${s.score >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{s.score >= 0 ? "+" : ""}{s.score}</span>
                        </div>
                      ); })}
                    </div>
                  </div>
                );
              })}
            </div>
            {r.confluence2 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Como o <strong>Robô 2.0</strong> decide (força ponderada dos 5 blocos): cada bloco — <strong>Estrutura · Microestrutura · Fluxo · Posicionamento · Técnico</strong> — tem um <strong>PESO</strong> (ajustável em Configuração; padrão 30·25·13·12·20). Dentro do bloco os indicadores têm força igual e o bloco vira um <strong>saldo</strong> (−100..+100). A <strong>força ponderada</strong> = Σ (peso × saldo) é quem decide: <strong>abre</strong> quando passa ±o limiar de entrada, <strong>segura</strong> enquanto a força se sustenta (histerese) e <strong>fecha</strong> perto de zero — e <strong>vira a mão</strong> se a força cruza o limiar do lado oposto. Bloco neutro contribui 0 (não trava). Stop de catástrofe largo só de proteção. O bloco Técnico junta <strong>tendência</strong> (EMA/ADX) e <strong>momentum</strong> (RSI/MACD/Squeeze). Ignora o setup SMC e os gates do v28. Put/Call Wall fica medido (invertido, não vota). Vale pra todas as moedas. Educacional — não é recomendação.</p>
            ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">Como o robô decide (motor v21 · SMC + pressão): a <strong>estrutura SMC do 15m</strong> (badge <em>decide</em>) arma o setup — reteste de OB/FVG pós-BOS/CHoCH (prioritário) ou imbalance em reteste, sempre com a direção validada por <strong>maioria 2-de-3 das leituras de estrutura</strong>, stop na invalidação estrutural e alvo na liquidez/PDH-PDL. Antes de executar passa pelos gates: <strong>1 tiro por zona</strong>, sessão, <strong>bússola 4H</strong> (a estrutura do TF maior precisa concordar) e a confluência <strong>Estrutura + Fluxo</strong> (2 de 2 — os sinais <em>vota</em> são a pressão do book/fluxo). Os <em>estudo</em> (Técnico · Sentimento) e os <em>medido</em> não influenciam — alimentam o aprendizado por moeda. Atualizado a cada ~5 min. Educacional — não é recomendação.</p>
            )}
          </Card>
  );
}
