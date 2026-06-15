import { useCallback, useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

/**
 * Chama uma função RPC de admin (sql/019_admin.sql) e expõe {data, loading, error, reload}.
 * Refetch automático quando o valor (não a identidade) de `params` muda.
 */
export function useAdminRpc<T>(fn: string, params?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params ?? {});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc(fn, params ?? {});
    if (error) setError(error.message);
    else setData(data as T);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
