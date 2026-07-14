import type { Dispatch, SetStateAction } from "react";

import InfoTip from "../../../InfoTip";
import type { Config } from "../../../../lib/bot/types";

/** 1 · Execução & risco — quanto arrisca por trade e os freios de segurança. */
export default function RiskConfig({ cfg, setCfg, input, isBinance, isFut }: {
  cfg: Config;
  setCfg: Dispatch<SetStateAction<Config | null>>;
  input: string;
  isBinance: boolean;
  isFut: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">💰 1 · Execução & risco <span className="font-normal normal-case">— quanto arrisca por trade e os freios de segurança</span></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-muted-foreground">Par (instId)
          <input className={`${input} mt-1`} value={cfg.inst_id} onChange={(e) => setCfg({ ...cfg, inst_id: e.target.value.toUpperCase(), base_ccy: e.target.value.toUpperCase().split("-")[0] || cfg.base_ccy, quote_ccy: e.target.value.toUpperCase().split("-")[1] || cfg.quote_ccy })} />
          {isBinance && <span className="mt-0.5 block text-[10px]">na Binance o robô opera <strong>BTC · ETH · SOL · BNB · AAVE</strong> (este campo vale só p/ OKX/spot)</span>}
        </label>
        {isFut ? (
          <label className="text-xs text-muted-foreground">Risco por trade (% do patrimônio)
            <input type="number" step="0.1" min="0.1" className={`${input} mt-1`} value={cfg.risk_pct ?? 1} onChange={(e) => setCfg({ ...cfg, risk_pct: Number(e.target.value) })} />
            <span className="mt-0.5 block text-[10px]">tamanho = risco ÷ distância do stop (stop longe → posição menor)</span>
          </label>
        ) : (
          <label className="text-xs text-muted-foreground">Tamanho da compra ({cfg.quote_ccy})
            <input type="number" className={`${input} mt-1`} value={cfg.order_quote_sz} onChange={(e) => setCfg({ ...cfg, order_quote_sz: Number(e.target.value) })} />
          </label>
        )}
        {isFut && (
          <label className="text-xs text-muted-foreground">Alavancagem máx (x · teto)
            <input type="number" min="1" max="20" className={`${input} mt-1`} value={cfg.leverage} onChange={(e) => setCfg({ ...cfg, leverage: Number(e.target.value) })} />
            <span className="mt-0.5 block text-[10px]">teto de nocional, não multiplicador do tamanho</span>
          </label>
        )}
        {isFut && (
          <label className="text-xs text-muted-foreground">Perda diária máx (%) <InfoTip text="Circuit breaker: bateu a perda no dia, o robô para de abrir posição até o dia virar." />
            <input type="number" step="0.5" min="0" className={`${input} mt-1`} value={cfg.daily_loss_pct ?? 5} onChange={(e) => setCfg({ ...cfg, daily_loss_pct: Number(e.target.value) })} />
          </label>
        )}
        {isFut && (
          <label className="text-xs text-muted-foreground">Máx. posições simultâneas
            <input type="number" min="1" max="10" className={`${input} mt-1`} value={cfg.max_positions ?? 4} onChange={(e) => setCfg({ ...cfg, max_positions: Number(e.target.value) })} />
          </label>
        )}
        {isFut && (
          <label className="text-xs text-muted-foreground">Cooldown pós-stop (min) <InfoTip text="Depois de um stop, a moeda fica de castigo esse tempo antes de reabrir (evita revenge trade no mesmo ruído)." />
            <input type="number" min="0" className={`${input} mt-1`} value={cfg.cooldown_min ?? 15} onChange={(e) => setCfg({ ...cfg, cooldown_min: Number(e.target.value) })} />
          </label>
        )}
      </div>
    </div>
  );
}
