import { useEffect, useRef } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

// Captura de indicação (afiliados). Link do afiliado: https://app/?ref=CODIGO
// 1) Na primeira carga guardamos o código (mesmo deslogado) e limpamos a URL.
// 2) Ao logar, vinculamos ao perfil via RPC attach_referral (primeira atribuição).
// Funciona para cadastro por e-mail e por OAuth (o código sobrevive ao redirect).
const KEY = "cm_ref";
const WINDOW_DAYS = 60; // janela de atribuição

export function useReferralCapture(session: Session | null) {
  const attempted = useRef(false);

  // 1) Captura ?ref= da URL e remove da barra de endereço (sem recarregar).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("ref")?.trim();
      if (!code) return;
      localStorage.setItem(KEY, JSON.stringify({ code, ts: Date.now() }));
      params.delete("ref");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
      );
    } catch {
      /* ambiente sem localStorage/URL — ignora */
    }
  }, []);

  // 2) Após o login, vincula o código guardado ao perfil (uma vez por sessão).
  useEffect(() => {
    if (!session || attempted.current) return;
    attempted.current = true;

    let stored: { code?: string; ts?: number } | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      stored = null;
    }
    if (!stored?.code) return;

    const fresh = Date.now() - (stored.ts ?? 0) < WINDOW_DAYS * 86_400_000;
    if (!fresh) {
      localStorage.removeItem(KEY);
      return;
    }
    // Idempotente do lado do servidor: só atribui se o perfil ainda não tem indicação.
    void (async () => {
      try {
        await supabase.rpc("attach_referral", { p_code: stored.code });
      } finally {
        localStorage.removeItem(KEY);
      }
    })();
  }, [session]);
}
