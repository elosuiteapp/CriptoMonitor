import { Link } from "react-router-dom";

const ALL: string[] = ["BTC", "ETH", "SOL"];

interface Props {
  current: string;
  allowed: string[];
  onChange: (asset: string) => void;
}

/** Um ativo por tela (PRD §8.3). Ativos fora do plano aparecem com cadeado. */
export default function AssetSelector({ current, allowed, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-700 p-1">
      {ALL.map((asset) => {
        const unlocked = allowed.includes(asset);
        if (!unlocked) {
          return (
            <Link
              key={asset}
              to="/pricing"
              title="Disponível no Pro"
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-400"
            >
              {asset} <span aria-hidden>🔒</span>
            </Link>
          );
        }
        return (
          <button
            key={asset}
            onClick={() => onChange(asset)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              current === asset ? "bg-accent text-white" : "text-slate-300 hover:text-white"
            }`}
          >
            {asset}
          </button>
        );
      })}
    </div>
  );
}
