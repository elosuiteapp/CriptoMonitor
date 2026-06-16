import { useState } from "react";
import { Link } from "react-router-dom";

import { ASSET_NAME, isInstitutional } from "../lib/format";
import CoinIcon from "./CoinIcon";

const ALL: string[] = [
  "BTC", "ETH", "SOL", "BNB",
  "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "POL", "DOT", "LTC",
  "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE",
];

interface Props {
  current: string;
  allowed: string[];
  onChange: (asset: string) => void;
}

/** Seletor de ativo (dropdown com logo + nome). Moedas fora do plano aparecem
 *  com cadeado e levam ao /pricing. */
export default function AssetSelector({ current, allowed, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
      >
        <CoinIcon asset={current} />
        <span>{current}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl">
            {ALL.map((asset) => {
              const unlocked = allowed.includes(asset);
              const active = asset === current;
              const inner = (
                <span className="flex items-center gap-2">
                  <CoinIcon asset={asset} />
                  <span className="font-medium text-foreground">{asset}</span>
                  <span className="text-xs text-muted-foreground">{ASSET_NAME[asset] ?? ""}</span>
                  {isInstitutional(asset) && (
                    <span
                      title="Camada institucional completa (gamma, opções, DVOL, CVD Coinbase)"
                      className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary"
                    >
                      gamma
                    </span>
                  )}
                </span>
              );
              if (!unlocked) {
                return (
                  <Link
                    key={asset}
                    to="/pricing"
                    onClick={() => setOpen(false)}
                    title="Disponível em planos superiores"
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 opacity-60 transition-colors hover:bg-muted"
                  >
                    {inner}
                    <span aria-hidden>🔒</span>
                  </Link>
                );
              }
              return (
                <button
                  key={asset}
                  onClick={() => {
                    onChange(asset);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-muted ${active ? "bg-primary/10" : ""}`}
                >
                  {inner}
                  {active && <span className="text-primary">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
