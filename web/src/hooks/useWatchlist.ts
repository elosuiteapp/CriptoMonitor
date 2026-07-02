import { useCallback, useEffect, useState } from "react";

import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

/** Moedas favoritas do usuário (tabela `watchlist`). Usadas p/ personalizar os
 *  alertas de "mudança de leitura". Atualização otimista. */
export function useWatchlist() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFavorites(new Set());
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from("watchlist")
      .select("asset")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!active) return;
        setFavorites(new Set(((data ?? []) as { asset: string }[]).map((r) => r.asset)));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const toggle = useCallback(
    async (asset: string) => {
      if (!user) return;
      const has = favorites.has(asset);
      // otimista, com ROLLBACK se a escrita falhar (senão a estrela diverge do banco)
      setFavorites((prev) => {
        const next = new Set(prev);
        if (has) next.delete(asset);
        else next.add(asset);
        return next;
      });
      const { error } = has
        ? await supabase.from("watchlist").delete().eq("user_id", user.id).eq("asset", asset)
        : await supabase.from("watchlist").insert({ user_id: user.id, asset });
      if (error) {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (has) next.add(asset);
          else next.delete(asset);
          return next;
        });
      }
    },
    [user, favorites],
  );

  return { favorites, isFavorite: (a: string) => favorites.has(a), toggle, loading };
}
