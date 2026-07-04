import { Link } from "react-router-dom";

import { useT } from "../lib/i18n";
import type { ActiveLayers } from "./Chart";
import InfoTip from "./InfoTip";

interface Props {
  layers: ActiveLayers;
  onToggle: (key: keyof ActiveLayers) => void;
  /** Para cada camada: o plano atual pode LIGÁ-la? (ver lib/layers.ts) */
  access: Record<keyof ActiveLayers, boolean>;
  /** Mostra as camadas bloqueadas como teaser de upgrade (vitrine do Free). */
  showUpsell: boolean;
}

// label/desc vêm do dicionário (t.layerToggles.items[key]); aqui só a cor e o degrau.
// ActiveLayers e t.layerToggles.items compartilham exatamente as mesmas 9 chaves.
const ITEMS: { key: keyof ActiveLayers; color: string; tier: "pro" | "expert" }[] = [
  { key: "gex", color: "bg-emerald-500", tier: "pro" },
  { key: "zeroGamma", color: "bg-purple-500", tier: "pro" },
  { key: "maxPain", color: "bg-amber-500", tier: "pro" },
  { key: "volumeProfile", color: "bg-sky-400", tier: "pro" },
  { key: "orderbookWalls", color: "bg-teal-400", tier: "pro" },
  { key: "funding", color: "bg-indigo-400", tier: "expert" },
  { key: "cvd", color: "bg-cyan-400", tier: "expert" },
  { key: "bookPressure", color: "bg-violet-400", tier: "expert" },
  { key: "liquidations", color: "bg-rose-500", tier: "expert" },
  { key: "bookHeatmap", color: "bg-blue-500", tier: "pro" },
];

export default function LayerToggles({ layers, onToggle, access, showUpsell }: Props) {
  const { t } = useT();
  // Mostra uma camada quando o plano pode ligá-la OU quando é vitrine de upgrade
  // (Free vê as travadas como teaser 🔒 que leva ao /pricing).
  const items = ITEMS.filter((item) => access[item.key] || showUpsell);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{t.layerToggles.title}</span>
      {items.map((item) => {
        const can = access[item.key];
        const meta = t.layerToggles.items[item.key];

        if (!can) {
          // Teaser de upgrade: a camada existe, mas é de um plano superior.
          const target = item.tier === "expert" ? "Expert" : "Pro";
          return (
            <Link
              key={item.key}
              to="/pricing"
              title={`${meta.desc} · ${t.layerToggles.availableOn.replace("{tier}", target)}`}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <span className="h-2 w-2 rounded-full bg-muted" />
              {meta.label}
              <span aria-hidden>🔒</span>
            </Link>
          );
        }

        const active = layers[item.key];
        return (
          <span
            key={item.key}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
              active
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-border"
            }`}
          >
            <button
              type="button"
              onClick={() => onToggle(item.key)}
              className="flex items-center gap-1.5"
            >
              <span className={`h-2 w-2 rounded-full ${item.color} ${active ? "" : "opacity-35"}`} />
              {meta.label}
            </button>
            <InfoTip text={meta.desc} />
          </span>
        );
      })}
    </div>
  );
}
