import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    session,
    user: (session?.user ?? null) as User | null,
    loading,
    signIn: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string, fullName: string, phone?: string) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone } },
      }),
    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }),
    // Microsoft (Azure) cobre Hotmail/Outlook/Live. Exige o provider Azure habilitado no
    // Supabase com tenant "common" p/ aceitar contas pessoais (ver passos de config).
    signInWithMicrosoft: () =>
      supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { scopes: "email", redirectTo: window.location.origin },
      }),
    signOut: () => supabase.auth.signOut(),
  };
}
