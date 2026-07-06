import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

/** Lê profiles.role do usuário logado para liberar (ou não) o painel de admin.
 *  Guarda TAMBÉM a qual userId a resposta pertence: sem isso, no commit em que a auth resolve,
 *  o estado antigo (isAdmin=false de userId=undefined, loading=false) vazava por um render e o
 *  AdminRoute redirecionava o admin pra "/" no F5/deep-link (race). `loading` agora é DERIVADO:
 *  enquanto a resposta não for DESTE userId, está carregando. */
export function useIsAdmin(userId: string | undefined) {
  const [state, setState] = useState<{ forUser: string | null; isAdmin: boolean }>({ forUser: null, isAdmin: false });

  useEffect(() => {
    let active = true;
    if (!userId) {
      setState({ forUser: null, isAdmin: false });
      return;
    }
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setState({ forUser: userId, isAdmin: (data?.role as string | undefined) === "admin" });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const answered = !!userId && state.forUser === userId;
  return { isAdmin: answered ? state.isAdmin : false, loading: !!userId && !answered };
}
