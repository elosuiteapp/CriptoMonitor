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
}

const ITEMS: Item[] = [
  { key: "gex", label: "Opções (Call/Put Wall)", color: "bg-signal-green" },
  { key: "zeroGamma", label: "Zero Gamma", color: "bg-purple-500" },
  { key: "maxPain", label: "Max Pain", color: "bg-signal-yellow" },
  { key: "volumeProfile", label: "Volume Profile (POC)", color: "bg-sky-400" },
  { key: "orderbookWalls", label: "Paredes do book", color: "bg-amber-500" },
  { key: "funding", label: "Funding", color: "bg-sky-500" },
  { key: "cvd", label: "CVD", color: "bg-emerald-500" },
  { key: "liquidations", label: "Liquidações (5min)", color: "bg-rose-500" },
];

export default function LayerToggles({ layers, onToggle, locked }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">Camadas:</span>
      {ITEMS.map((item) => {
        const active = !locked && layers[item.key];
        return (
          <button
            key={item.key}
            disabled={locked}
            onClick={() => onToggle(item.key)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition ${
              locked
                ? "cursor-not-allowed border-ink-500 text-slate-600"
                : active
                  ? "border-accent/60 bg-accent/10 text-slate-100"
                  : "border-ink-500 text-slate-400 hover:border-ink-400"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? item.color : "bg-slate-600"}`} />
            {item.label}
            {locked && <span aria-hidden>🔒</span>}
          </button>
        );
      })}
      {locked && <span className="text-slate-600">— disponível no Pro</span>}
    </div>
  );
}
