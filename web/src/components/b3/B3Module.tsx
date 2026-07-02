import { useEffect, useState } from "react";

import { fetchB3Chart, fetchB3Macro, fetchMacroGlobal, type B3Candle } from "../../lib/b3";
import type { MarketRead } from "../../lib/indicators/confluence";
import ErrorBoundary from "../ErrorBoundary";
import LockedTab from "../LockedTab";
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
export default function B3Module({ asset, onAsset, full = false, isAdmin = false }: { asset: string; onAsset: (s: string) => void; full?: boolean; isAdmin?: boolean }) {
  // Free (não-admin): vitrine travada no ativo showcase — o cockpit não troca de ativo.
  const setAsset = full ? onAsset : () => {};
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
            {full
              ? (isAdmin
                ? <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
                : <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">módulo ativo</span>)
              : <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">prévia grátis</span>}
          </h2>
          <p className="text-xs text-muted-foreground">{full
            ? "Plataforma da bolsa brasileira — ações e FIIs: cockpit, dividendos, fluxo, leitura, macro e relatórios."
            : `Prévia grátis: cockpit, leitura e macro de ${asset}. Assine o módulo B3 para todos os ativos, dividendos, fluxo/Smart Money e relatórios.`}</p>
        </div>
        <MarketReadBadge read={badge as unknown as MarketRead} loading={readLoading} onClick={() => setTab("leitura")} />
      </div>

      <B3TabBar tab={tab} onTab={setTab} full={full} />

      <ErrorBoundary key={tab} label="o módulo B3">
        {tab === "cockpit" && <B3CockpitTab asset={asset} onAsset={setAsset} />}
        {tab === "dividendos" && (full ? <B3DividendsTab asset={asset} onAsset={setAsset} /> : <LockedTab title="Dividendos" plan="B3" />)}
        {tab === "fluxo" && (full ? <B3SmartMoneyTab asset={asset} /> : <LockedTab title="Fluxo & Smart Money" plan="B3" />)}
        {tab === "leitura" && (full ? <B3LeituraTab asset={asset} /> : <LockedTab title="Leitura do Mercado" plan="B3" />)}
        {tab === "macro" && <B3MacroTab />}
        {tab === "reports" && (full ? <B3ReportsTab asset={asset} isAdmin={isAdmin} /> : <LockedTab title="Relatórios" plan="B3" />)}
      </ErrorBoundary>
    </section>
  );
}
