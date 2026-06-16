import { GLOSSARY } from "../lib/glossary";
import type { Level } from "../lib/types";
import ForceGauge from "./ForceGauge";
import InfoTip from "./InfoTip";

export interface CotRow {
  asset: string;
  report_date: string;
  asset_mgr_net: number | null;
  lev_money_net: number | null;
  asset_mgr_net_chg: number | null;
  lev_money_net_chg: number | null;
  open_interest: number | null;
  ts: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const fmtNet = (n: number | null, chg: number | null) => {
  if (n == null) return "—";
  const base = `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR")} contratos`;
  return chg != null && chg !== 0 ? `${base} (${chg > 0 ? "+" : ""}${chg.toLocaleString("pt-BR")} sem)` : base;
};
// net como fração do open interest → posição na barra (vendido ↔ comprado)
const pos = (net: number | null, oi: number | null) =>
  net == null || !oi ? null : clamp01((net / oi + 1) / 2);

/** Posicionamento institucional na CME (CFTC COT, semanal) — Asset Managers (real money)
 *  e Leveraged Funds (hedge funds). Só BTC/ETH têm futuros CME. */
export default function CotCard({ cot }: { cot: CotRow }) {
  const amLevel: Level =
    cot.asset_mgr_net == null ? "neutral" : cot.asset_mgr_net > 0 ? "green" : cot.asset_mgr_net < 0 ? "red" : "yellow";
  const reportTxt = (() => {
    const d = new Date(cot.report_date);
    return Number.isNaN(d.getTime()) ? cot.report_date : d.toLocaleDateString("pt-BR");
  })();

  return (
    <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Posicionamento CME · CFTC <InfoTip text={GLOSSARY.cot} />
        </span>
        <span className="text-[11px] text-muted-foreground">
          relatório de {reportTxt}{cot.open_interest ? ` · OI ${cot.open_interest.toLocaleString("pt-BR")}` : ""}
        </span>
      </div>

      {/* Asset Managers — dinheiro institucional "real money" (direcional) */}
      <ForceGauge
        label="Asset Managers (real money)"
        pos={pos(cot.asset_mgr_net, cot.open_interest)}
        value={fmtNet(cot.asset_mgr_net, cot.asset_mgr_net_chg)}
        level={amLevel}
        left="net vendido"
        right="net comprado"
      />

      {/* Leveraged Funds — hedge funds; net short é majoritariamente basis trade → neutro */}
      <div className="mt-3">
        <ForceGauge
          label="Leveraged Funds (hedge funds)"
          pos={pos(cot.lev_money_net, cot.open_interest)}
          value={fmtNet(cot.lev_money_net, cot.lev_money_net_chg)}
          level="neutral"
          left="net vendido"
          right="net comprado"
        />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Asset Managers comprados = viés institucional de fundo. O net short dos hedge funds é, em boa parte,{" "}
        <strong>basis trade</strong> (vendido no futuro + comprado no spot/ETF) — carry, não aposta de queda.
        Atualiza semanalmente (sexta).
      </p>
    </div>
  );
}
