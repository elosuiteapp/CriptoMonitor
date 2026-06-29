import { useState } from "react";

import { useEscapeKey } from "../../hooks/useEscapeKey";
import { FOREX_PAIRS } from "../../lib/forex";

const GROUPS: { id: string; label: string }[] = [
  { id: "major", label: "Principais" },
  { id: "brl", label: "Real (BRL)" },
  { id: "cross", label: "Cruzamentos" },
  { id: "index", label: "Índice" },
];
const KIND_BADGE: Record<string, string> = { brl: "BRL", cross: "cross", index: "índice" };

/** Seletor de par do módulo Forex no header — mesmo padrão dos demais módulos
 *  (dropdown com busca). Isolado: usa só lib/forex. */
export default function ForexAssetSelector({ current, onChange }: { current: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = () => {
    setOpen(false);
    setQ("");
  };
  useEscapeKey(close, open);
  const term = q.trim().toLowerCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/5 px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
        title="Par de moedas"
      >
        <span aria-hidden>💱</span>
        <span>{current}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute left-0 z-30 mt-1 flex max-h-96 w-64 flex-col rounded-xl border border-border bg-surface p-1 shadow-2xl">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar par (ex.: EUR, JPY, BRL)…"
              className="mx-1 mb-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {GROUPS.map((g) => {
                const items = FOREX_PAIRS.filter(
                  (p) => p.group === g.id && (!term || p.symbol.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)),
                );
                if (!items.length) return null;
                return (
                  <div key={g.id}>
                    <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
                    {items.map((p) => {
                      const active = p.symbol === current;
                      return (
                        <button
                          key={p.symbol}
                          onClick={() => {
                            onChange(p.symbol);
                            close();
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-muted ${active ? "bg-primary/10" : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{p.symbol}</span>
                            <span className="text-xs text-muted-foreground">{p.name}</span>
                            {KIND_BADGE[p.group] && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">{KIND_BADGE[p.group]}</span>
                            )}
                          </span>
                          {active && <span className="text-primary">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
