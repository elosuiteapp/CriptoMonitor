import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

/** Lê profiles.role do usuário logado para liberar (ou não) o painel de admin. */
export function useIsAdmin(userId: string | undefined) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setIsAdmin((data?.role as string | undefined) === "admin");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { isAdmin, loading };
}
