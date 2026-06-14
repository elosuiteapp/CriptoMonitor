import type { ActiveLayers } from "./Chart";

interface Props {
  layers: ActiveLayers;
  onToggle: (key: keyof ActiveLayers) => void;
  locked: boolean;
}

interface Item {
  key: keyof ActiveLayers;
  label: string;
  color: string;
  comingSoon?: boolean;
}

const ITEMS: Item[] = [
  { key: "gex", label: "Opções (Call/Put Wall)", color: "bg-signal-green" },
  { key: "zeroGamma", label: "Zero Gamma", color: "bg-purple-500" },
  { key: "maxPain", label: "Max Pain", color: "bg-signal-yellow" },
  { key: "funding", label: "Funding", color: "bg-sky-500" },
  { key: "cvd", label: "CVD", color: "bg-emerald-500" },
  { key: "liquidations", label: "Liquidações", color: "bg-rose-500", comingSoon: true },
];

export default function LayerToggles({ layers, onToggle, locked }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Camadas:</span>
      {ITEMS.map((item) => {
        const disabled = locked || item.comingSoon;
        const active = !disabled && layers[item.key];
        return (
          <button
            key={item.key}
            disabled={disabled}
            title={item.comingSoon ? "Requer heatmap de liquidações (CoinGlass) — pós-MVP" : undefined}
            onClick={() => onToggle(item.key)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
              disabled
                ? "cursor-not-allowed border-ink-500 text-slate-600"
                : active
                  ? "border-accent/60 bg-accent/10 text-slate-100"
                  : "border-ink-500 text-slate-400 hover:border-ink-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? item.color : "bg-slate-600"}`} />
            {item.label}
            {locked && !item.comingSoon && <span aria-hidden>🔒</span>}
            {item.comingSoon && <span className="text-[10px] text-slate-600">em breve</span>}
          </button>
        );
      })}
      {locked && <span className="text-slate-600">— disponível no Pro</span>}
    </div>
  );
}
