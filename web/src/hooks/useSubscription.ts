import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export interface SubscriptionInfo {
  status: "active" | "canceled" | "past_due";
  gateway: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan: { slug: string; name: string; price_cents: number } | null;
}

/** Assinatura ATIVA do usuário logado (status/vencimento/gateway + plano) e o
 *  cancelamento self-service. Escopo por usuário vem da RLS de `subscriptions`. */
export function useSubscription(user: User | null) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("status, gateway, current_period_end, cancel_at_period_end, plan:plans(slug, name, price_cents)")
      .eq("status", "active")
      .maybeSingle();
    setSubscription((data as SubscriptionInfo | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Cancela ao fim do ciclo (mantém acesso até o vencimento). */
  const cancel = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("asaas-cancel");
    if (!error) await load();
    return { data, error };
  }, [load]);

  return { subscription, loading, reload: load, cancel };
}
