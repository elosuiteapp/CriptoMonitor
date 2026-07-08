import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { useLocale } from "../hooks/useLocale";
import { useSubscription } from "../hooks/useSubscription";

// Tela de retorno do Asaas após o pagamento (callback.successUrl = <origin>/obrigado).
// O plano é liberado pelo webhook (asaas-webhook), que leva alguns segundos; aqui a
// gente faz polling da assinatura até virar pago e confirma pro usuário.
const COPY = {
  pt: {
    thanks: "Pagamento recebido!",
    activating: "Estamos liberando seu acesso Pro. Isso leva alguns segundos…",
    active: "Seu plano Pro está ativo. Aproveite tudo liberado.",
    stillPending: "Assim que a confirmação cair, seu acesso libera automaticamente — pode continuar navegando.",
    toDashboard: "Ir para o painel",
    needLogin: "Faça login para ver seu plano.",
    login: "Entrar",
  },
  en: {
    thanks: "Payment received!",
    activating: "We're unlocking your Pro access. This takes a few seconds…",
    active: "Your Pro plan is active. Enjoy everything unlocked.",
    stillPending: "As soon as the confirmation lands, your access unlocks automatically — feel free to keep browsing.",
    toDashboard: "Go to dashboard",
    needLogin: "Log in to see your plan.",
    login: "Sign in",
  },
} as const;

export default function Obrigado() {
  const { session, user } = useAuth();
  const { locale } = useLocale();
  const t = COPY[locale === "en" ? "en" : "pt"];
  const { subscription, reload } = useSubscription(user);
  const [tries, setTries] = useState(0);

  const isActive = subscription?.status === "active" && (subscription?.plan?.slug ?? "free") !== "free";

  // Polling: recarrega a assinatura a cada 3s por ~45s enquanto não estiver ativa.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!session || isActive || tries >= 15) return;
    timer.current = window.setTimeout(() => {
      void reload();
      setTries((n) => n + 1);
    }, 3000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [session, isActive, tries, reload]);

  return (
    <div className="grid min-h-full place-items-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-xl dark:bg-card/60">
        <div
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl ${
            isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-primary/15 text-primary"
          }`}
        >
          {isActive ? "✓" : "⏳"}
        </div>

        <h1 className="mt-5 text-xl font-bold text-foreground">{t.thanks}</h1>

        {!session ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t.needLogin}</p>
            <Link
              to="/login"
              className="mt-6 inline-block w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t.login}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {isActive ? t.active : t.activating}
            </p>
            {!isActive && (
              <p className="mt-3 text-xs text-muted-foreground">{t.stillPending}</p>
            )}
            <Link
              to="/"
              className="mt-6 inline-block w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t.toDashboard}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
