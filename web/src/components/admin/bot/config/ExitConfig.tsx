import type { Dispatch, SetStateAction } from "react";

import type { Config } from "../../../../lib/bot/types";

/** 3 · Saída & gestão da posição — stop, trailing, reversão e pirâmide. */
export default function ExitConfig({ cfg, setCfg, input }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  input: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🚪 3 · Saída & gestão da posição <span className="font-normal normal-case">— stop, trailing, reversão e pirâmide</span></div>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!cfg.stop_atr_on} onChange={(e) => setCfg({ ...cfg, stop_atr_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Stop de risco por ATR</strong> (fallback): quando o setup não traz stop estrutural, usa a volatilidade do ativo — cada moeda ganha um stop na sua escala. Desligado, o fallback é % fixo (config legada).</span>
          {cfg.stop_atr_on && (
            <span className="flex items-center gap-1">· distância <input type="number" step="0.5" min="0.5" value={cfg.stop_atr_mult ?? 4} onChange={(e) => setCfg({ ...cfg, stop_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR</span>
          )}
        </label>
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={cfg.target_on !== false} onChange={(e) => setCfg({ ...cfg, target_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Alvo de lucro (take-profit) na liquidez</strong>: fecha a posição na próxima poça de liquidez do plano SMC. <strong>Desligado</strong> = sem teto de ganho — <em>reprovado no backtest 03/jul (pior em 7 de 8 janelas; o trailing devolve o pico da liquidez)</em>.</span>
          {cfg.target_on !== false && (
            <span className="flex items-center gap-1.5">
              · <input type="checkbox" checked={!!cfg.tp_partial} onChange={(e) => setCfg({ ...cfg, tp_partial: e.target.checked })} className="h-3.5 w-3.5 rounded border-border" />
              <span><strong>parcial 50%</strong>: embolsa metade no alvo, resto no trailing (stop ≥ breakeven) — <em>reprovado no backtest 03/jul (8/8 janelas; o alvo cheio venceu)</em></span>
            </span>
          )}
        </label>
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!cfg.trail_on} onChange={(e) => setCfg({ ...cfg, trail_on: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Stop móvel (trailing) por ATR</strong>: sobe com o pico e nunca desce — trava lucro se o preço voltar. Distância <strong>k × ATR</strong> com piso de estrutura; arma só no lucro.</span>
          {cfg.trail_on && (
            <span className="flex items-center gap-1">· trava <input type="number" step="0.5" min="0.5" value={cfg.trail_atr_mult ?? 3} onChange={(e) => setCfg({ ...cfg, trail_atr_mult: Number(e.target.value) })} className="w-16 rounded border border-border bg-background px-2 py-0.5 num" />× ATR abaixo do pico</span>
          )}
        </label>
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!cfg.pyramid} onChange={(e) => setCfg({ ...cfg, pyramid: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Pirâmide</strong>: adiciona à posição em novo sinal na MESMA direção — só no lucro, com metade do risco</span>
          {cfg.pyramid && (
            <span className="flex items-center gap-1">· máx <input type="number" min="1" max="10" value={cfg.pyramid_max ?? 2} onChange={(e) => setCfg({ ...cfg, pyramid_max: Number(e.target.value) })} className="w-14 rounded border border-border bg-background px-2 py-0.5 num" /> adições</span>
          )}
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-muted-foreground">Reversão (virar a mão)
            <select className={`${input} mt-1`} value={cfg.rev_mode ?? "off"} onChange={(e) => setCfg({ ...cfg, rev_mode: e.target.value })}>
              <option value="off">Nunca — sai só por stop/alvo/trailing (recomendado)</option>
              <option value="imbalance">Só imbalance (FVG fresco) contra</option>
              <option value="any">Sempre que o sinal virar (antigo)</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
