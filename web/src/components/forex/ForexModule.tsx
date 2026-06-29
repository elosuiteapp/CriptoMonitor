import { useState } from "react";

import ErrorBoundary from "../ErrorBoundary";
import ForexCockpitTab from "./ForexCockpitTab";
import ForexLeituraTab from "./ForexLeituraTab";
import ForexMacroTab from "./ForexMacroTab";
import ForexSmartMoneyTab from "./ForexSmartMoneyTab";
import ForexTabBar, { type ForexTabId } from "./ForexTabBar";

/** Plataforma Forex (admin-only) — mesmo modelo do cripto/B3 (abas), contexto de
 *  câmbio. O par vem do seletor do header (Dashboard). 100% isolado dos demais. */
export default function ForexModule({ pair, onPair }: { pair: string; onPair: (s: string) => void }) {
  const [tab, setTab] = useState<ForexTabId>("cockpit");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          💱 Forex · Câmbio
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
        </h2>
        <p className="text-xs text-muted-foreground">Plataforma de câmbio — pares de moedas: cockpit, smart money, leitura do mercado e macro & correlações.</p>
      </div>

      <ForexTabBar tab={tab} onTab={setTab} />

      <ErrorBoundary key={tab} label="o módulo Forex">
        {tab === "cockpit" && <ForexCockpitTab pair={pair} onPair={onPair} />}
        {tab === "smart" && <ForexSmartMoneyTab pair={pair} />}
        {tab === "leitura" && <ForexLeituraTab pair={pair} />}
        {tab === "macro" && <ForexMacroTab pair={pair} />}
      </ErrorBoundary>
    </section>
  );
}
