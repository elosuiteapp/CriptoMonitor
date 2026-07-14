import type { Dispatch, SetStateAction } from "react";

import type { Config } from "../../../../lib/bot/types";

/** Motor do robô (qual OPERA a conta) + pesos do Robô 2.0 (força ponderada dos 5 blocos). */
export default function EngineConfig({ cfg, setCfg, input }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  input: string;
}) {
  return (
    <>
      <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
        <label className="text-xs font-semibold text-foreground">🤖 Motor do robô <span className="font-normal text-muted-foreground">— qual robô OPERA a conta; o outro roda em sombra (papel) pra comparar</span>
          <select className={`${input} mt-1`} value={cfg.bot_engine ?? "smc"} onChange={(e) => setCfg({ ...cfg, bot_engine: e.target.value })}>
            <option value="smc">Robô 1 · v28 — SMC price-action 15m (reteste + gates) · atual</option>
            <option value="confluence2">Robô 2.0 — força ponderada dos 5 blocos (peso ajustável) + saída por confluência</option>
          </select>
        </label>
        <p className="mt-1 text-[10px] text-muted-foreground">Trocar aqui só muda qual dos dois opera de verdade; o desempenho dos dois aparece no card "Desempenho dos robôs".</p>
      </div>
      {(cfg.bot_engine ?? "smc") === "confluence2" && (() => {
        const w = (cfg.conf2_weights ?? { estrutura: 30, micro: 25, tecnico: 20, fluxo: 13, posicionamento: 12 }) as Record<string, number>;
        const soma = Object.values(w).reduce((s, v) => s + (Number(v) || 0), 0);
        return (
        <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.04] p-3">
          <div className="text-xs font-semibold text-foreground">⚖️ Peso dos blocos (Robô 2.0) <span className="font-normal text-muted-foreground">— a decisão é a FORÇA PONDERADA: Σ (peso × força do bloco). Não precisa somar 100 (é normalizado). Soma atual: {soma}%</span></div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([["estrutura", "Estrutura"], ["micro", "Microestrutura"], ["fluxo", "Fluxo"], ["posicionamento", "Posicionamento"], ["tecnico", "Técnico"]] as [string, string][]).map(([k, lbl]) => (
              <label key={k} className="text-[11px] text-muted-foreground">{lbl}
                <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={w[k] ?? 0} onChange={(e) => setCfg({ ...cfg, conf2_weights: { ...w, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-[11px] text-muted-foreground" title="Força ponderada mínima (−100..+100) pra ABRIR. Maior = mais seletivo.">Abre em ±força
              <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={cfg.conf2_enter ?? 30} onChange={(e) => setCfg({ ...cfg, conf2_enter: Number(e.target.value) })} />
            </label>
            <label className="text-[11px] text-muted-foreground" title="Histerese: mantém a posição enquanto a força ≥ este piso; abaixo, sai. Menor que 'Abre'.">Segura até ±força
              <input type="number" min={0} max={100} step={1} className={`${input} mt-0.5`} value={cfg.conf2_hold ?? 10} onChange={(e) => setCfg({ ...cfg, conf2_hold: Number(e.target.value) })} />
            </label>
            <label className="text-[11px] text-muted-foreground" title="Largura do stop de proteção (chandelier ×ATR). A saída principal é por confluência; este stop fica longe.">Stop catástrofe ×ATR
              <input type="number" min={1} max={10} step={0.5} className={`${input} mt-0.5`} value={cfg.conf2_stop_atr ?? 4} onChange={(e) => setCfg({ ...cfg, conf2_stop_atr: Number(e.target.value) })} />
            </label>
            <label className="text-[11px] text-muted-foreground" title="Trava de BREAKEVEN: uma vez que o trade fica ≥ N×ATR no lucro, o stop nunca desce da entrada — um winner não vira loser. 0 = desliga.">Breakeven (×ATR lucro)
              <input type="number" min={0} max={5} step={0.5} className={`${input} mt-0.5`} value={cfg.conf2_be_atr ?? 1} onChange={(e) => setCfg({ ...cfg, conf2_be_atr: Number(e.target.value) })} />
            </label>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Default: 3 fortes (Estrutura 30 · Micro 25 · Técnico 20) + 2 leves (Fluxo 13 · Posic 12). Ajuste e clique em <strong>Salvar</strong> embaixo. Vale pra todas as moedas.</p>
        </div>
        );
      })()}
    </>
  );
}
