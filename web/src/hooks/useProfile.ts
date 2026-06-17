import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export interface Profile {
  full_name: string | null;
  phone: string | null;
  cpf: string | null; // exigido pelo Asaas no checkout em BRL
}

const EMPTY: Profile = { full_name: null, phone: null, cpf: null };

/**
 * Lê e atualiza a linha do usuário logado em `public.profiles` (RLS: cada um
 * só enxerga/edita o próprio). Também deriva avatar/e-mail do OAuth (apenas
 * leitura) para o chip de perfil no header.
 */
export function useProfile(user: User | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone, cpf")
      .eq("id", user.id)
      .maybeSingle();
    setProfile((data as Profile | null) ?? { ...EMPTY });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (fields: Partial<Profile>) => {
      if (!user) return { error: new Error("Sessão expirada.") };
      const { error } = await supabase
        .from("profiles")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (!error) setProfile((p) => ({ ...(p ?? EMPTY), ...fields }));
      return { error };
    },
    [user],
  );

  // Dados vindos do provedor OAuth (Google manda avatar; Microsoft manda nome).
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const avatarUrl = (meta.avatar_url ?? meta.picture ?? null) as string | null;
  const email = user?.email ?? null;
  const metaName = (meta.full_name ?? meta.name ?? null) as string | null;
  const displayName =
    profile?.full_name?.trim() || metaName?.trim() || email?.split("@")[0] || "Conta";

  // Cadastro "completo" = tem nome e telefone (telefone nunca vem do OAuth).
  const complete = Boolean(profile?.full_name?.trim() && profile?.phone?.trim());

  return { profile, loading, save, reload: load, avatarUrl, email, displayName, complete };
}
