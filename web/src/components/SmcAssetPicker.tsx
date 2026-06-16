import { useMemo, useState } from "react";

import { useFavorites } from "../hooks/useFavorites";
import { ASSET_NAME } from "../lib/format";
import { CURATED_ASSETS, SMC_ASSETS } from "../lib/marketData";
import CoinIcon from "./CoinIcon";

const CURATED = new Set(CURATED_ASSETS);

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z" />
    </svg>
  );
}

interface Props {
  current: string;
  onChange: (asset: string) => void;
}

/** Seletor de moeda do Smart Money: busca por nome/ticker, favoritos (máx. 10)
 *  fixados no topo, e selo "price-action" nas moedas sem dados do coletor. */
export default function SmcAssetPicker({ current, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { favs, isFav, toggle, max, full } = useFavorites();

  const { fav, rest } = useMemo(() => {
    const s = q.trim().toUpperCase();
    const match = SMC_ASSETS.filter(
      (a) => !s || a.includes(s) || (ASSET_NAME[a] ?? "").toUpperCase().includes(s),
    );
    const favSet = new Set(favs);
    return {
      fav: match.filter((a) => favSet.has(a)),
      rest: match.filter((a) => !favSet.has(a)),
    };
  }, [q, favs]);

  function Row(a: string) {
    const active = a === current;
    const curated = CURATED.has(a);
    return (
      <div
        key={a}
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted ${active ? "bg-primary/10" : ""}`}
      >
        <button
          onClick={() => {
            onChange(a);
            setOpen(false);
            setQ("");
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <CoinIcon asset={a} />
          <span className="font-medium text-foreground">{a}</span>
          <span className="truncate text-xs text-muted-foreground">{ASSET_NAME[a] ?? ""}</span>
        </button>
        {!curated && (
          <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            price-action
          </span>
        )}
        {active && curated && <span className="shrink-0 text-primary">✓</span>}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle(a);
          }}
          disabled={!isFav(a) && full}
          title={
            isFav(a)
              ? "Remover dos favoritos"
              : full
                ? `Máximo de ${max} favoritos`
                : "Adicionar aos favoritos"
          }
          className={`shrink-0 transition-colors disabled:opacity-30 ${
            isFav(a) ? "text-amber-400" : "text-muted-foreground/40 hover:text-amber-400"
          }`}
        >
          <Star filled={isFav(a)} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <CoinIcon asset={current} />
        <span>{current}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar moeda (nome ou ticker)…"
              className="mb-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <div className="max-h-80 overflow-y-auto">
              {fav.length > 0 && (
                <>
                  <div className="section-title flex items-center justify-between px-2 pb-1 pt-1.5">
                    <span>★ Favoritos</span>
                    <span className="text-muted-foreground/60">
                      {favs.length}/{max}
                    </span>
                  </div>
                  {fav.map(Row)}
                  <div className="my-1 h-px bg-border" />
                </>
              )}
              {rest.map(Row)}
              {fav.length === 0 && rest.length === 0 && (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Nada encontrado.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
