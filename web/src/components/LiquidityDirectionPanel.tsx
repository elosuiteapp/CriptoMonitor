import { fmtPct, fmtUsd, relativeTime } from "../lib/format";
import { GLOSSARY } from "../lib/glossary";
import type { Level, MacroData, MarketLiquidityData } from "../lib/types";
import ForceGauge from "./ForceGauge";
import InfoTip from "./InfoTip";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Mapeia uma variação % para 0..1 (centro = 0%, extremos = ±range). */
const posFromChg = (pct: number | null | undefined, range: number) =>
  pct == null ? null : clamp01((pct / range + 1) / 2);
const lvlFromChg = (pct: number | null | undefined, up: number, down: number): Level =>
  pct == null ? "neutral" : pct >= up ? "green" : pct <= down ? "red" : "yellow";
const chg = (pct: number | null | undefined) => (pct == null ? "—" : `${fmtPct(pct, 1)} 7d`);

/** Painel "Liquidez & direção (DeFi)" — barras de força market-wide (DefiLlama):
 *  stablecoins (dry powder), volume de DEX (especulação) e fees/receita (uso real). */
export default function LiquidityDirectionPanel({
  liquidity,
  macro,
  updatedAt,
}: {
  liquidity: MarketLiquidityData;
  macro: MacroData | null;
  updatedAt: string | null;
}) {
  const sc = liquidity.total_stablecoin_usd;
  const scChg = liquidity.stablecoin_chg_7d_pct;
  const dom = sc != null && macro?.total_mcap ? (sc / macro.total_mcap) * 100 : null;

  return (
    <div className="rounded-xl border-2 border-primary/70 bg-card dark:bg-card/60 p-4 ring-1 ring-primary/15">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          Liquidez &amp; direção (DeFi) <InfoTip text={GLOSSARY.marketLiquidity} />
        </span>
        <span className="text-[10px] text-muted-foreground">Fonte: DefiLlama · {relativeTime(updatedAt)}</span>
      </div>

      {/* Stablecoins — dry powder */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-foreground">Stablecoins (dry powder)</span>
          <span className="num text-xs text-muted-foreground">
            {fmtUsd(sc)}
            {dom != null && ` · ${dom.toFixed(1)}% do mcap`}
          </span>
        </div>
        <ForceGauge
          pos={posFromChg(scChg, 3)}
          value={chg(scChg)}
          level={lvlFromChg(scChg, 0.3, -0.5)}
          left="capital saindo"
          right="capital entrando"
        />
      </div>

      {/* Volume de DEX — especulação/atividade */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-foreground">Volume DEX (24h)</span>
          <span className="num text-xs text-muted-foreground">{fmtUsd(liquidity.dex_volume_24h)}</span>
        </div>
        <ForceGauge
          pos={posFromChg(liquidity.dex_change_7d, 60)}
          value={chg(liquidity.dex_change_7d)}
          level={lvlFromChg(liquidity.dex_change_7d, 10, -10)}
          left="esfriando"
          right="aquecendo"
        />
      </div>

      {/* Fees / receita — uso real */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-foreground">Fees / receita DeFi (24h)</span>
          <span className="num text-xs text-muted-foreground">{fmtUsd(liquidity.fees_24h)}</span>
        </div>
        <ForceGauge
          pos={posFromChg(liquidity.fees_change_7d, 40)}
          value={chg(liquidity.fees_change_7d)}
          level={lvlFromChg(liquidity.fees_change_7d, 5, -5)}
          left="caindo"
          right="subindo"
        />
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        Stablecoins subindo = combustível entrando · DEX aquecendo = mais especulação · fees subindo = uso real crescendo.
      </p>
    </div>
  );
}
