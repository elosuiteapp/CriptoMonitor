import { useGlossary } from "../lib/glossary";
import { useT } from "../lib/i18n";
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
const fmtNet = (n: number | null, chg: number | null, isEn: boolean) => {
  if (n == null) return "—";
  const loc = isEn ? "en-US" : "pt-BR";
  const base = `${n > 0 ? "+" : ""}${n.toLocaleString(loc)} ${isEn ? "contracts" : "contratos"}`;
  return chg != null && chg !== 0 ? `${base} (${chg > 0 ? "+" : ""}${chg.toLocaleString(loc)} ${isEn ? "wk" : "sem"})` : base;
};
// net como fração do open interest → posição na barra (vendido ↔ comprado)
const pos = (net: number | null, oi: number | null) =>
  net == null || !oi ? null : clamp01((net / oi + 1) / 2);

/** Posicionamento institucional na CME (CFTC COT, semanal) — Asset Managers (real money)
 *  e Leveraged Funds (hedge funds). Só BTC/ETH têm futuros CME. */
export default function CotCard({ cot }: { cot: CotRow }) {
  const { isEn } = useT();
  const tt = (pt: string, en: string) => (isEn ? en : pt);
  const GLOSSARY = useGlossary();
  const amLevel: Level =
    cot.asset_mgr_net == null ? "neutral" : cot.asset_mgr_net > 0 ? "green" : cot.asset_mgr_net < 0 ? "red" : "yellow";
  const reportTxt = (() => {
    const d = new Date(cot.report_date);
    return Number.isNaN(d.getTime()) ? cot.report_date : d.toLocaleDateString(isEn ? "en-US" : "pt-BR");
  })();
  const left = tt("net vendido", "net short");
  const right = tt("net comprado", "net long");

  return (
    <div className="rounded-2xl border border-border bg-card dark:bg-card/60 p-4">
      <div className="flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {tt("Posicionamento CME · CFTC", "CME positioning · CFTC")} <InfoTip text={GLOSSARY.cot} />
        </span>
        <span className="text-[11px] text-muted-foreground">
          {tt("relatório de", "report from")} {reportTxt}{cot.open_interest ? ` · OI ${cot.open_interest.toLocaleString(isEn ? "en-US" : "pt-BR")}` : ""}
        </span>
      </div>

      {/* Asset Managers — dinheiro institucional "real money" (direcional) */}
      <ForceGauge
        label="Asset Managers (real money)"
        pos={pos(cot.asset_mgr_net, cot.open_interest)}
        value={fmtNet(cot.asset_mgr_net, cot.asset_mgr_net_chg, isEn)}
        level={amLevel}
        left={left}
        right={right}
      />

      {/* Leveraged Funds — hedge funds; net short é majoritariamente basis trade → neutro */}
      <div className="mt-3">
        <ForceGauge
          label="Leveraged Funds (hedge funds)"
          pos={pos(cot.lev_money_net, cot.open_interest)}
          value={fmtNet(cot.lev_money_net, cot.lev_money_net_chg, isEn)}
          level="neutral"
          left={left}
          right={right}
        />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        {tt(
          "Asset Managers comprados = viés institucional de fundo. O net short dos hedge funds é, em boa parte, ",
          "Asset Managers long = a structural institutional bias. Hedge funds' net short is largely ",
        )}
        <strong>basis trade</strong>
        {tt(
          " (vendido no futuro + comprado no spot/ETF) — carry, não aposta de queda. Atualiza semanalmente (sexta).",
          " (short futures + long spot/ETF) — carry, not a bearish bet. Updates weekly (Friday).",
        )}
      </p>
    </div>
  );
}
