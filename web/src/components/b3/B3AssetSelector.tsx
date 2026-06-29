import { useState } from "react";

import { useEscapeKey } from "../../hooks/useEscapeKey";
import { B3_ASSETS, type B3Asset } from "../../lib/b3";
import { B3AssetIcon } from "./B3Shared";

const KIND_BADGE: Record<string, string> = { index: "índice", currency: "moeda", fii: "FII" };

/** Seletor de ativo da B3 no header. Parametrizável por lista (`items`) e rótulo (`label`)
 *  para podermos ter DUAS listas lado a lado — Ações e FIIs — alimentando as mesmas abas.
 *  O ativo é compartilhado; quando o selecionado não pertence a esta lista, o botão mostra o rótulo. */
export default function B3AssetSelector({
  current,
  onChange,
  items = B3_ASSETS,
  label = "Ativo",
}: {
  current: string;
  onChange: (s: string) => void;
  items?: B3Asset[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = () => {
    setOpen(false);
    setQ("");
  };
  useEscapeKey(close, open);
  const cur = items.find((a) => a.symbol === current);
  const owns = !!cur; // o ativo atual pertence a esta lista?
  const term = q.trim().toLowerCase();
  const filtered = term ? items.filter((a) => a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term)) : items;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200 hover:bg-muted ${
          owns ? "border-primary/50 bg-primary/5 text-foreground" : "border-border bg-surface text-muted-foreground"
        }`}
        title={label}
      >
        {owns ? (
          <>
            <B3AssetIcon symbol={current} kind={cur?.kind} />
            <span>{current}</span>
          </>
        ) : (
          <span className="font-semibold">{label}</span>
        )}
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={close} />
          <div className="absolute left-0 z-30 mt-1 flex max-h-80 w-64 flex-col rounded-xl border border-border bg-surface p-1 shadow-2xl">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            {/* Busca/filtro dentro da lista */}
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar ticker ou nome…"
              className="mx-1 mb-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum resultado.</div>}
              {filtered.map((a) => {
                const active = a.symbol === current;
                return (
                  <button
                    key={a.symbol}
                    onClick={() => {
                      onChange(a.symbol);
                      close();
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-muted ${active ? "bg-primary/10" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <B3AssetIcon symbol={a.symbol} kind={a.kind} />
                      <span className="font-medium text-foreground">{a.symbol}</span>
                      <span className="text-xs text-muted-foreground">{a.name}</span>
                      {a.kind !== "stock" && KIND_BADGE[a.kind] && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-primary">{KIND_BADGE[a.kind]}</span>
                      )}
                    </span>
                    {active && <span className="text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
