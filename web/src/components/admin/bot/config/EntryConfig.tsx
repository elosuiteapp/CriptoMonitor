import type { Dispatch, SetStateAction } from "react";

import InfoTip from "../../../InfoTip";
import type { Config } from "../../../../lib/bot/types";

/** 2 · Entrada — gatilhos SMC e filtros (espelha o pipeline da aba Gráfico). */
export default function EntryConfig({ cfg, setCfg, input }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  input: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🎯 2 · Entrada <span className="font-normal normal-case">— gatilhos SMC e filtros (espelha o pipeline da aba Gráfico)</span></div>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={cfg.imbalance_on !== false} onChange={(e) => setCfg({ ...cfg, imbalance_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Imbalance (FVG novo) → arma o setup</strong>: FVG fresco no 15m arma entrada na direção dele; stop e alvo vêm da estrutura. <strong>Não tem mais passe livre</strong>: passa pelo mesmo placar de confluência abaixo.</span>
          {cfg.imbalance_on !== false && (
            <span className="flex items-center gap-1">· tamanho mín <input type="number" step="0.05" min="0" value={cfg.imbalance_min_pct ?? 0} onChange={(e) => setCfg({ ...cfg, imbalance_min_pct: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />% (0 = todo FVG)</span>
          )}
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-muted-foreground">Direção da estrutura <InfoTip text="Como as 3 leituras de estrutura (último BOS/CHoCH · interna · swing) viram a direção do setup. 'Maioria 2-de-3' (v20, validado) impede a leitura VELHA de vencer a recente — era a causa dos shorts em rali." />
            <select className={`${input} mt-1`} value={cfg.dir_mode ?? "majority"} onChange={(e) => setCfg({ ...cfg, dir_mode: e.target.value })}>
              <option value="majority">Maioria 2-de-3 (recomendado)</option>
              <option value="internal">Interna manda (mais rápido nas viradas)</option>
              <option value="any">Qualquer uma (antigo — OU das 3)</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Bússola do TF maior <InfoTip text="A estrutura do timeframe maior precisa concordar com a direção da entrada (neutra também segura). Fase F: maioria+4H = única variante acima do baseline, com metade do drawdown. Em probatório — se a medição da semana mostrar que segura trade bom, desligar é 1 clique." />
            <select className={`${input} mt-1`} value={cfg.htf_gate ?? "4H"} onChange={(e) => setCfg({ ...cfg, htf_gate: e.target.value })}>
              <option value="4H">4H (recomendado)</option>
              <option value="1H">1H</option>
              <option value="1D">1D</option>
              <option value="off">Desligada (SMC do 15m puro)</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Confluência <InfoTip text="'Maioria 2 de 3' (v23, pedido do dono): Estrutura · Pressão/fluxo · Técnico (EMA+VWAP+ADX) votam — 2 a favor e sem empate contra libera a entrada. 'SMC + pressão': estrutura na direção e fluxo não-contra (técnico vira estudo). 'Todos': regra v17 com Sentimento incluído." />
            <select className={`${input} mt-1`} value={cfg.conf_scope ?? "smc_flow_ta"} onChange={(e) => setCfg({ ...cfg, conf_scope: e.target.value })}>
              <option value="smc_flow_ta">Maioria 2 de 3 — Estrutura·Pressão·Técnico (atual)</option>
              <option value="smc_flow">SMC + pressão não-contra (técnico = estudo)</option>
              <option value="all">Todos os 4 grupos (antigo, com Sentimento)</option>
            </select>
            <span className="mt-0.5 block text-[10px]">Nos trades reais: fluxo a favor = 60% de acerto × contra = 20%. Setup segurado fica no Diário com o motivo.</span>
          </label>
          <label className="text-xs text-muted-foreground">Imbalance (FVG) <InfoTip text="'Reteste' (v18, igual ao módulo Smart Money): entra quando o preço VOLTA à zona do FVG. 'Chase' (antigo): entrava na formação do gap, perseguindo o esticado — 31% de acerto contra a estrutura." />
            <select className={`${input} mt-1`} value={cfg.imb_mode ?? "retest"} onChange={(e) => setCfg({ ...cfg, imb_mode: e.target.value })}>
              <option value="retest">Reteste da zona (recomendado)</option>
              <option value="chase">Na formação (antigo)</option>
            </select>
            <span className="mt-0.5 flex items-center gap-3 text-[10px]">
              <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.imb_align !== false} onChange={(e) => setCfg({ ...cfg, imb_align: e.target.checked })} className="h-3 w-3 rounded border-border" />só a favor da estrutura</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={cfg.zone_once !== false} onChange={(e) => setCfg({ ...cfg, zone_once: e.target.checked })} className="h-3 w-3 rounded border-border" />1 tiro por zona</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={(cfg.setup_priority ?? "structure") === "structure"} onChange={(e) => setCfg({ ...cfg, setup_priority: e.target.checked ? "structure" : "imbalance" })} className="h-3 w-3 rounded border-border" />OB/FVG+estrutura primeiro</label>
              <label className="flex items-center gap-1" title="v24: a vela da entrada precisa ter delta (volume comprador−vendedor) a favor — única variante que melhorou as 4 moedas"><input type="checkbox" checked={cfg.delta_confirm !== false} onChange={(e) => setCfg({ ...cfg, delta_confirm: e.target.checked })} className="h-3 w-3 rounded border-border" />delta da vela a favor</label>
              <label className="flex items-center gap-1" title="v25: no premium (topo) não compra e no discount (fundo) não vende, salvo rompimento de swing recente ou estrutura interna já virada (fase M2: melhorou as 4 moedas, R recorde)"><input type="checkbox" checked={cfg.zone_discipline !== false} onChange={(e) => setCfg({ ...cfg, zone_discipline: e.target.checked })} className="h-3 w-3 rounded border-border" />disciplina de zona</label>
              <label className="flex items-center gap-1" title="v26: Squeeze Momentum (LazyBear, 20 velas 15m) FORTE contra a direção (≥0,5 ATR) segura a entrada — fase P: melhorou as 4 moedas, agregado recorde +67,8R"><input type="checkbox" checked={cfg.sq_filter !== false} onChange={(e) => setCfg({ ...cfg, sq_filter: e.target.checked })} className="h-3 w-3 rounded border-border" />squeeze momentum (LazyBear)</label>
            </span>
          </label>
          <label className="text-xs text-muted-foreground">Zona oposta do TF maior (× ATR do HTF) <InfoTip text="Fase R (07/jul, APROVADA — o caso dos prints do dono): OB/FVG CONTRÁRIO não-preenchido do TF da bússola (1H) a até X×ATR(HTF) à frente segura a entrada — não se compra colado numa zona de venda do 1H que o 15m não enxerga. Backtest 90d: SOL PF 2,99→4,81 (dd 5,9→4,1%), BTC/ETH também melhoram." />
            <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.opp_htf_atr ?? 1} onChange={(e) => setCfg({ ...cfg, opp_htf_atr: Number(e.target.value) })} />
            <span className="mt-0.5 block text-[10px]">1 = validado (fase R). 0 = desligado. Usa o TF da bússola acima.</span>
          </label>
          <label className="text-xs text-muted-foreground">Filtro de volatilidade (× ATR) <InfoTip text="Fase V (07/jul, APROVADA — prática das plataformas): vela FECHADA com range maior que K×ATR (spike/notícia) não gera entrada — em SMC é a entrada esticada longe da zona de origem. Backtest 90d: ETH PF 1,44→1,61 · SOL 4,81→5,35 · BNB/AAVE ~iguais · BTC neutro." />
            <input type="number" step="0.5" min="0" className={`${input} mt-1`} value={cfg.vol_max_atr ?? 2} onChange={(e) => setCfg({ ...cfg, vol_max_atr: Number(e.target.value) })} />
            <span className="mt-0.5 block text-[10px]">2 = validado (fase V). 0 = desligado. 3 quase não filtra.</span>
          </label>
          <label className="text-xs text-muted-foreground">Sessão bloqueada (horas UTC, vírgula) <InfoTip text="Gate de sessão: nessas horas UTC o robô NÃO abre posição nova nem piramida — saídas seguem normais. ATENÇÃO: o estudo antigo (03/jul) era do MOTOR VELHO; na v22 tudo foi liberado (vazio) e a re-medição semanal decide se alguma janela volta. Vazio = sem filtro." />
            <input type="text" className={`${input} mt-1`} value={(cfg.block_hours ?? []).join(",")} onChange={(e) => setCfg({ ...cfg, block_hours: e.target.value.split(",").map((s) => Number(s.trim())).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) })} placeholder="ex.: 9,10,11,18,19,20,21,22,23" />
            <span className="mt-0.5 block text-[10px]">GLOBAL (fallback) — a config POR MOEDA abaixo sobrepõe. Só entradas; posição aberta segue gerida.</span>
          </label>
        </div>
        {/* ── Legado — knobs obsoletos (reprovados no backtest), recolhidos p/ histórico ── */}
        <details className="rounded-lg border border-border/60 bg-background/30 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">⚙️ Legado — não usar (mantido só p/ histórico)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-muted-foreground">Entrada perto da zona (× ATR) <InfoTip text="Qualidade 1: entrada imbalance só com o preço a até X ATR da borda do FVG (0 = desligado). REPROVADA no backtest de 03/jul (mata ETH/SOL — o chase é o que paga lá); fica disponível p/ experimento." />
              <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.max_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, max_zone_atr: Number(e.target.value) })} />
              <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Backtest 90+180d: ligar piora ETH/SOL.</span>
            </label>
            <label className="text-xs text-muted-foreground">Bloqueio por zona oposta (× ATR) <InfoTip text="Qualidade 2: segura a entrada quando há FVG/OB oposto fresco a até X ATR à frente (0 = desligado). REPROVADA no backtest de 03/jul junto com a regra 1; fica disponível p/ experimento." />
              <input type="number" step="0.25" min="0" className={`${input} mt-1`} value={cfg.opp_zone_atr ?? 0} onChange={(e) => setCfg({ ...cfg, opp_zone_atr: Number(e.target.value) })} />
              <span className="mt-0.5 block text-[10px]">0 = desligado (validado). Idem: reprovada em ETH/SOL.</span>
            </label>
          </div>
        </details>
      </div>
    </div>
  );
}
