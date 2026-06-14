import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

/** Resolve o plano efetivo do usuário (assinatura ativa → senão, Free). */
export function usePlan(userId: string | undefined) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("plan:plans(*)")
        .eq("status", "active")
        .maybeSingle();

      let resolved = (data?.plan as Plan | undefined) ?? null;
      if (!resolved) {
        const { data: free } = await supabase
          .from("plans")
          .select("*")
          .eq("slug", "free")
          .single();
        resolved = (free as Plan) ?? null;
      }
      if (active) {
        setPlan(resolved);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  return { plan, loading };
}
