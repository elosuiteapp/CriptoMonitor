import { useState } from "react";

import B3CockpitTab from "./B3CockpitTab";
import B3FluxoTab from "./B3FluxoTab";
import B3LeituraTab from "./B3LeituraTab";
import B3MacroTab from "./B3MacroTab";
import B3ReportsTab from "./B3ReportsTab";
import B3TabBar, { type B3TabId } from "./B3TabBar";

/** Plataforma B3 (admin-only) — mesmo modelo do cripto (abas), contexto B3.
 *  O ativo é compartilhado: vem do seletor do header (Dashboard). 100% isolado da cripto. */
export default function B3Module({ asset, onAsset }: { asset: string; onAsset: (s: string) => void }) {
  const [tab, setTab] = useState<B3TabId>("cockpit");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          🇧🇷 B3 · Ações
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">preview admin</span>
        </h2>
        <p className="text-xs text-muted-foreground">Plataforma da bolsa brasileira — cockpit, fluxo, leitura, macro e relatórios.</p>
      </div>

      <B3TabBar tab={tab} onTab={setTab} />

      {tab === "cockpit" && <B3CockpitTab asset={asset} onAsset={onAsset} />}
      {tab === "fluxo" && <B3FluxoTab />}
      {tab === "leitura" && <B3LeituraTab asset={asset} />}
      {tab === "macro" && <B3MacroTab />}
      {tab === "reports" && <B3ReportsTab />}
    </section>
  );
}
