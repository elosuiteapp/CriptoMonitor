import { useCallback, useEffect, useState } from "react";

const KEY = "cm.smc-favorites";
const MAX = 10;

/** Moedas favoritas do Smart Money (máx. 10), persistidas em localStorage e
 *  sincronizadas entre abas. Ficam fixadas no topo do seletor. */
export function useFavorites() {
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(v) ? (v as string[]).slice(0, MAX) : [];
    } catch {
      return [];
    }
  });

  const toggle = useCallback((asset: string) => {
    setFavs((cur) => {
      let next: string[];
      if (cur.includes(asset)) next = cur.filter((x) => x !== asset);
      else if (cur.length >= MAX) next = cur; // cheio → ignora
      else next = [...cur, asset];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* localStorage indisponível */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        try {
          setFavs(JSON.parse(e.newValue || "[]"));
        } catch {
          /* ignora */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isFav = useCallback((a: string) => favs.includes(a), [favs]);

  return { favs, isFav, toggle, max: MAX, full: favs.length >= MAX };
}
