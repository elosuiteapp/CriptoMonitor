import { useCryptoOnchain } from "../hooks/useCryptoOnchain";
import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import InfoTip from "./InfoTip";

type Tone = "up" | "down" | "neutral";
const toneClass = (t: Tone) => (t === "up" ? "text-emerald-500" : t === "down" ? "text-rose-500" : "text-muted-foreground");

function Cell({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: Tone }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      <div className={`text-[11px] ${toneClass(tone)}`}>{sub}</div>
    </div>
  );
}

/** On-chain valuation (MVRV-Z, SOPR, NUPL, Puell) + posição no ciclo — market-wide BTC, de
 *  fonte GRÁTIS (bitcoin-data.com via edge `crypto-onchain`). Aba Macro & Correlações (Pro+).
 *  Preenche o gap "on-chain de verdade" que antes exigia Glassnode/CryptoQuant pagos. */
export default function OnchainPanel() {
  const { t } = useT();
  const o = t.onchain;
  const { data } = useCryptoOnchain();
  if (!data?.onchain) return null;
  const { mvrvZ, sopr, nupl, puell, realized, reserveRisk, spot, cycleScore } = data.onchain;
  const net = data.network;

  const cycle =
    cycleScore == null ? null
      : cycleScore < 20 ? { t: o.cycleBottom, c: "text-emerald-500" }
      : cycleScore < 40 ? { t: o.cycleCheap, c: "text-emerald-500" }
      : cycleScore < 60 ? { t: o.cycleNeutral, c: "text-muted-foreground" }
      : cycleScore < 80 ? { t: o.cycleHot, c: "text-amber-500" }
      : { t: o.cycleTop, c: "text-rose-500" };

  const zMvrv = mvrvZ == null ? null : mvrvZ < 1 ? { s: o.zDiscount, tone: "up" as Tone } : mvrvZ < 3 ? { s: o.zNeutral, tone: "neutral" as Tone } : mvrvZ < 5 ? { s: o.zElevated, tone: "down" as Tone } : { s: o.zEuphoria, tone: "down" as Tone };
  const zSopr = sopr == null ? null : sopr < 0.98 ? { s: o.zCapitulation, tone: "up" as Tone } : sopr <= 1.02 ? { s: o.zNeutral, tone: "neutral" as Tone } : { s: o.zElevated, tone: "down" as Tone };
  const zNupl = nupl == null ? null : nupl < 0 ? { s: o.zCapitulation, tone: "up" as Tone } : nupl < 0.25 ? { s: o.zDiscount, tone: "up" as Tone } : nupl < 0.5 ? { s: o.zNeutral, tone: "neutral" as Tone } : nupl < 0.75 ? { s: o.zElevated, tone: "down" as Tone } : { s: o.zEuphoria, tone: "down" as Tone };
  const zPuell = puell == null ? null : puell < 0.5 ? { s: o.zCapitulation, tone: "up" as Tone } : puell < 2 ? { s: o.zNeutral, tone: "neutral" as Tone } : puell < 4 ? { s: o.zElevated, tone: "down" as Tone } : { s: o.zEuphoria, tone: "down" as Tone };
  const zReserve = reserveRisk == null ? null : reserveRisk < 0.0015 ? { s: o.zCapitulation, tone: "up" as Tone } : reserveRisk < 0.006 ? { s: o.zDiscount, tone: "up" as Tone } : reserveRisk < 0.02 ? { s: o.zNeutral, tone: "neutral" as Tone } : { s: o.zElevated, tone: "down" as Tone };
  const profit = spot != null && realized != null ? spot >= realized : null;
  const hasNet = net && (net.hashrate != null || net.feeFast != null || net.diffChange != null);

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {o.title}
          <InfoTip text={o.tip} />
        </h3>
        {cycle && <span className={`shrink-0 text-xs font-semibold ${cycle.c}`}>{cycle.t}</span>}
      </div>

      {/* Posição no ciclo (0 = fundo, 100 = topo) */}
      {cycleScore != null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>{o.cyclePos}</span>
            <span className="num text-foreground">{cycleScore}/100</span>
          </div>
          <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg,#10b981,#eab308,#f43f5e)" }}>
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground" style={{ left: `${cycleScore}%` }} />
          </div>
        </div>
      )}

      {/* Métricas on-chain */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {zMvrv && <Cell label="MVRV Z-Score" value={mvrvZ!.toFixed(2)} sub={zMvrv.s} tone={zMvrv.tone} />}
        {zSopr && <Cell label="SOPR" value={sopr!.toFixed(3)} sub={zSopr.s} tone={zSopr.tone} />}
        {zNupl && <Cell label="NUPL" value={nupl!.toFixed(3)} sub={zNupl.s} tone={zNupl.tone} />}
        {zPuell && <Cell label="Puell" value={puell!.toFixed(2)} sub={zPuell.s} tone={zPuell.tone} />}
        {zReserve && <Cell label={o.reserveRisk} value={reserveRisk!.toFixed(4)} sub={zReserve.s} tone={zReserve.tone} />}
      </div>

      {/* Preço realizado vs spot */}
      {realized != null && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">{o.realizedTitle}</span>
          <span>
            <span className="num font-semibold text-foreground">US$ {Math.round(realized).toLocaleString(getLocale() === "en" ? "en-US" : "pt-BR")}</span>
            {profit != null && <span className={`ml-2 font-semibold ${profit ? "text-emerald-500" : "text-rose-500"}`}>{profit ? o.inProfit : o.atLoss}</span>}
          </span>
        </div>
      )}

      {/* Saúde da rede BTC (mempool.space) */}
      {hasNet && (
        <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{o.networkTitle}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {net.hashrate != null && <span className="text-muted-foreground">{o.hashrate}: <span className="num text-foreground">{(net.hashrate / 1e18).toFixed(0)} EH/s</span></span>}
            {net.diffChange != null && <span className="text-muted-foreground">{o.nextDiff}: <span className={`num ${net.diffChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{net.diffChange >= 0 ? "+" : ""}{net.diffChange.toFixed(1)}%</span></span>}
            {net.mempoolTx != null && <span className="text-muted-foreground">{o.mempool}: <span className="num text-foreground">{Math.round(net.mempoolTx / 1000)}k tx</span></span>}
            {net.feeFast != null && <span className="text-muted-foreground">{o.feeFast}: <span className="num text-foreground">{net.feeFast} sat/vB</span></span>}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] text-muted-foreground">{o.footer}</p>
    </div>
  );
}
