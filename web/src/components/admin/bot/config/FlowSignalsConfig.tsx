import type { Dispatch, SetStateAction } from "react";

import type { Config } from "../../../../lib/bot/types";
import { FLOW_SIGNALS } from "../../../../lib/bot/constants";

/** 4 · Aprendizado & sinais de fluxo — o que alimenta o veto e a auto-ponderação. */
export default function FlowSignalsConfig({ cfg, setCfg, isFut }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  isFut: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🧠 4 · Aprendizado & sinais de fluxo <span className="font-normal normal-case">— o que alimenta o veto e a auto-ponderação</span></div>
      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!cfg.auto_weight} onChange={(e) => setCfg({ ...cfg, auto_weight: e.target.checked })} className="h-4 w-4 rounded border-border" />
          <span><strong>Auto-ponderar por moeda</strong>: usa o que o robô aprendeu em CADA ativo p/ pesar os sinais (estrutura pesada onde acerta, leve onde erra). Trava anti-overfit: só age com amostra ≥20, ajuste cresce devagar e limitado. <em>Deixe desligado até o aprendizado amadurecer.</em></span>
        </label>
        {isFut && (
          <div className="text-xs text-muted-foreground">
            <p className="mb-2 text-[11px]">O núcleo <strong>SMC price-action</strong> (Order Blocks, Imbalance, Liquidez, EQH/EQL, Zonas, BOS/CHoCH no 15m) é <strong>sempre</strong> usado. Estes compõem os grupos do <strong>placar de confluência</strong> (Fluxo/Técnico/Sentimento) e o aprendizado — desligar um sinal tira ele do grupo dele. Absorção, paredes, pressão, CVD agregado e funding já estão fora do placar (acerto &lt;50% no aprendizado; seguem medidos).</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {FLOW_SIGNALS.map((s) => (
                <label key={s.key} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={cfg.signal_toggles?.[s.key] !== false} onChange={(e) => setCfg({ ...cfg, signal_toggles: { ...(cfg.signal_toggles ?? {}), [s.key]: e.target.checked } })} className="h-3.5 w-3.5 rounded border-border" />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
