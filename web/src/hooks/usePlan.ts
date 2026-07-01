import { useCallback, useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

/** Aborta uma promessa que trava (rede pendurada/extensão bloqueando o supabase.co)
 *  para o app nunca ficar preso em "Carregando plano…" sem saída. */
function withTimeout<T>(p: PromiseLike<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("plan-timeout")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** Resolve o plano efetivo do usuário (assinatura ativa → senão, Free).
 *  Nunca trava: em erro/timeout expõe `error` (com `reload` p/ tentar de novo)
 *  e sempre encerra o `loading`. */
export function usePlan(userId: string | undefined) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setPlan(null);
      setError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const sub = await withTimeout(
          supabase.from("subscriptions").select("plan:plans(*)").eq("status", "active").maybeSingle(),
        );
        if (sub.error) throw sub.error;

        let resolved = (sub.data?.plan as Plan | undefined) ?? null;
        if (!resolved) {
          const free = await withTimeout(supabase.from("plans").select("*").eq("slug", "free").single());
          if (free.error) throw free.error;
          resolved = (free.data as Plan) ?? null;
        }

        if (!active) return;
        // Sem plano resolvido (nem assinatura ativa nem Free) = estado inválido → trata como erro recuperável.
        if (resolved) setPlan(resolved);
        else setError(true);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  return { plan, loading, error, reload };
}
