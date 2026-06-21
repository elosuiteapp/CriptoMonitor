import { useState } from "react";

import { useEscapeKey } from "../../hooks/useEscapeKey";
import { B3_ASSETS } from "../../lib/b3";
import { B3AssetIcon } from "./B3Shared";

/** Seletor de ativo da B3 no header (índice, dólar e ações) — espelha o seletor
 *  de moedas do módulo cripto. Estado do ativo é compartilhado por todas as abas. */
export default function B3AssetSelector({ current, onChange }: { current: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  useEscapeKey(() => setOpen(false), open);
  const cur = B3_ASSETS.find((a) => a.symbol === current);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
      >
        <B3AssetIcon symbol={current} kind={cur?.kind} />
        <span>{current}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 max-h-80 w-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-2xl">
            {B3_ASSETS.map((a) => {
              const active = a.symbol === current;
              return (
                <button
                  key={a.symbol}
                  onClick={() => {
                    onChange(a.symbol);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-muted ${active ? "bg-primary/10" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <B3AssetIcon symbol={a.symbol} kind={a.kind} />
                    <span className="font-medium text-foreground">{a.symbol}</span>
                    <span className="text-xs text-muted-foreground">{a.name}</span>
                    {a.kind !== "stock" && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">{a.kind === "index" ? "índice" : "moeda"}</span>
                    )}
                  </span>
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
