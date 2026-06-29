import { useEffect, useState } from "react";

import { fetchB3Chart, fetchB3Macro, fetchMacroGlobal, type B3Candle } from "../../lib/b3";
import type { MarketRead } from "../../lib/indicators/confluence";
import ErrorBoundary from "../ErrorBoundary";
import MarketReadBadge from "../MarketReadBadge";
import B3CockpitTab from "./B3CockpitTab";
import B3DividendsTab from "./B3DividendsTab";
import B3LeituraTab, { b3BadgeRead, computeRead, type Read } from "./B3LeituraTab";
import B3MacroTab from "./B3MacroTab";
import B3ReportsTab from "./B3ReportsTab";
import B3SmartMoneyTab from "./B3SmartMoneyTab";
import B3TabBar, { type B3TabId } from "./B3TabBar";

/** Plataforma B3 (admin-only) — mesmo modelo do cripto (abas), contexto B3.
 *  O ativo é compartilhado: vem do seletor do header (Dashboard). 100% isolado da cripto.
 *  Medidor de viés no cabeçalho (mesmo padrão do cripto) — espelha a Leitura. */
export default function B3Module({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [tab, setTab] = useState<B3TabId>("cockpit");
  const [read, setRead] = useState<Read | null>(null);
  const [readLoading, setReadLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setReadLoading(true);
    Promise.all([fetchB3Chart(asset, "1d"), fetchB3Macro(), fetchMacroGlobal()]).then(([candles, macro, mg]) => {
      if (!alive) return;
      setRead(computeRead(asset, candles as B3Candle[], macro, null, mg));
      setReadLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [asset]);

  const badge = b3BadgeRead(read);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            🇧🇷 B3 · Ações & FIIs
            <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
          </h2>
          <p className="text-xs text-muted-foreground">Plataforma da bolsa brasileira — ações e FIIs: cockpit, dividendos, fluxo, leitura, macro e relatórios.</p>
        </div>
        <MarketReadBadge read={badge as unknown as MarketRead} loading={readLoading} onClick={() => setTab("leitura")} />
      </div>

      <B3TabBar tab={tab} onTab={setTab} />

      <ErrorBoundary key={tab} label="o módulo B3">
        {tab === "cockpit" && <B3CockpitTab asset={asset} onAsset={onAsset} />}
        {tab === "dividendos" && <B3DividendsTab asset={asset} onAsset={onAsset} />}
        {tab === "fluxo" && <B3SmartMoneyTab asset={asset} />}
        {tab === "leitura" && <B3LeituraTab asset={asset} />}
        {tab === "macro" && <B3MacroTab />}
        {tab === "reports" && <B3ReportsTab asset={asset} />}
      </ErrorBoundary>
    </section>
  );
}
