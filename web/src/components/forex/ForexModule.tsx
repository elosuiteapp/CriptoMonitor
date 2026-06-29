import { useEffect, useState } from "react";

import { cotForPair, fetchForexChart, fetchForexCot, fetchForexOverview } from "../../lib/forex";
import type { MarketRead } from "../../lib/indicators/confluence";
import ErrorBoundary from "../ErrorBoundary";
import MarketReadBadge from "../MarketReadBadge";
import ForexCockpitTab from "./ForexCockpitTab";
import ForexLeituraTab, { computeRead, forexBadgeRead, type Read } from "./ForexLeituraTab";
import ForexMacroTab from "./ForexMacroTab";
import ForexReportsTab from "./ForexReportsTab";
import ForexSmartMoneyTab from "./ForexSmartMoneyTab";
import ForexTabBar, { type ForexTabId } from "./ForexTabBar";

/** Plataforma Forex (admin-only) — mesmo modelo do cripto/B3 (abas), contexto de
 *  câmbio. O par vem do seletor do header (Dashboard). 100% isolado dos demais.
 *  Medidor de viés no cabeçalho (mesmo padrão do cripto) — espelha a Leitura. */
export default function ForexModule({ pair, onPair }: { pair: string; onPair: (s: string) => void }) {
  const [tab, setTab] = useState<ForexTabId>("cockpit");
  const [read, setRead] = useState<Read | null>(null);
  const [readLoading, setReadLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setReadLoading(true);
    const cotInfo = cotForPair(pair);
    Promise.all([fetchForexChart(pair, "1d"), fetchForexOverview(), cotInfo ? fetchForexCot(cotInfo.currency) : Promise.resolve(null)]).then(([candles, ov, cot]) => {
      if (!alive) return;
      const dxy = ov.find((q) => q.pair === "DXY")?.changePct ?? null;
      setRead(computeRead(pair, candles, dxy, cot, cotInfo));
      setReadLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [pair]);

  const badge = forexBadgeRead(read);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            💱 Forex · Câmbio
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
          </h2>
          <p className="text-xs text-muted-foreground">Plataforma de câmbio — pares de moedas: cockpit, smart money, leitura do mercado, macro & correlações e relatório por IA.</p>
        </div>
        <MarketReadBadge read={badge as unknown as MarketRead} loading={readLoading} onClick={() => setTab("leitura")} />
      </div>

      <ForexTabBar tab={tab} onTab={setTab} />

      <ErrorBoundary key={tab} label="o módulo Forex">
        {tab === "cockpit" && <ForexCockpitTab pair={pair} onPair={onPair} />}
        {tab === "smart" && <ForexSmartMoneyTab pair={pair} />}
        {tab === "leitura" && <ForexLeituraTab pair={pair} />}
        {tab === "macro" && <ForexMacroTab pair={pair} />}
        {tab === "relatorio" && <ForexReportsTab pair={pair} />}
      </ErrorBoundary>
    </section>
  );
}
