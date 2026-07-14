import type { Dispatch, SetStateAction } from "react";

import type { Config } from "../../../../lib/bot/types";

/** 2b · Exceções por moeda — o robô roda IGUAL nas moedas; use só como exceção consciente. */
export default function PerAssetConfig({ cfg, setCfg, input }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  input: string;
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">🪙 2b · Exceções por moeda <span className="font-normal normal-case text-muted-foreground">— decisão 06/jul: o robô roda IGUAL nas 4; use só como exceção consciente</span></div>
      <p className="mb-2 text-[11px] text-muted-foreground">Config atual: <strong>tudo neutro</strong> (risco 100%, sem sessões bloqueadas, trailing padrão) — as doses defensivas antigas eram calibradas no motor velho e foram removidas na v22. Estes campos ficam como ferramenta: se a medição semanal do <code>bot_trades_hist</code> condenar uma moeda, a exceção volta AQUI, com dado.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {["BTC", "ETH", "SOL", "BNB", "AAVE"].map((a) => {
          const ov = cfg.asset_overrides?.[a] ?? {};
          const setOv = (patch: Record<string, unknown>) => setCfg({ ...cfg, asset_overrides: { ...(cfg.asset_overrides ?? {}), [a]: { ...ov, ...patch } } });
          return (
            <div key={a} className="rounded-lg border border-border/70 bg-background/60 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{a}</span>
                <span className="text-[9px] text-muted-foreground">{(ov.block_hours ?? []).length ? "🛡 defensiva" : "🟢 livre"}{(ov.risk_mult ?? 1) < 1 ? ` · ${Math.round((ov.risk_mult ?? 1) * 100)}% risco` : ""}</span>
              </div>
              <label className="block text-[10px] text-muted-foreground">Sessão bloqueada (h UTC) <span title="Horas UTC em que ESTA moeda não abre posição nem piramida (saídas normais). Vazio = livre 24h. Validado: BTC/BNB [9-11,18-23]; ETH/SOL livres.">ⓘ</span>
                <input type="text" className={`${input} mt-0.5`} value={(ov.block_hours ?? []).join(",")} onChange={(e) => setOv({ block_hours: e.target.value.split(",").map((s) => Number(s.trim())).filter((h) => Number.isInteger(h) && h >= 0 && h < 24) })} placeholder="vazio = livre 24h" />
              </label>
              <label className="mt-1 block text-[10px] text-muted-foreground">Confluência mínima <span title="Grupos (de 4) votando na direção p/ ESTA moeda executar. Vazio = usa o global.">ⓘ</span>
                <select className={`${input} mt-0.5`} value={ov.conf_min ?? ""} onChange={(e) => setOv({ conf_min: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">global ({cfg.conf_min ?? 3} de 4)</option>
                  <option value={2}>2 de 4</option>
                  <option value={3}>3 de 4</option>
                  <option value={4}>4 de 4</option>
                </select>
              </label>
              <label className="mt-1 block text-[10px] text-muted-foreground">Multiplicador de risco <span title="Fração do risco por trade (0.1–1) p/ ESTA moeda. BNB em 0.5 = meio risco enquanto for a pior do backtest (candidata a pausa).">ⓘ</span>
                <input type="number" step="0.1" min="0.1" max="1" className={`${input} mt-0.5`} value={ov.risk_mult ?? 1} onChange={(e) => setOv({ risk_mult: Number(e.target.value) })} />
              </label>
              <label className="mt-1 block text-[10px] text-muted-foreground">Piso do trailing <span title="Âncora estrutural do stop móvel: largo = último swing grande (~5h; preserva runner — validado ETH/SOL) · interno = último swing de ~1h (stop acompanha a estrutura recente — validado SÓ no BNB, PF 0,97→1,15/0,73→1,06; reprovado global: corta winners do ETH).">ⓘ</span>
                <select className={`${input} mt-0.5`} value={ov.trail_floor ?? "structure"} onChange={(e) => setOv({ trail_floor: e.target.value })}>
                  <option value="structure">largo (swing ~5h)</option>
                  <option value="internal">interno (~1h, acompanha)</option>
                </select>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
