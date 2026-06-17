import { useCallback, useEffect, useState } from "react";

export type Locale = "pt" | "en";

const KEY = "cm.locale";

/** Idioma do app (pt/en). Detecta do navegador na 1ª vez, persiste em localStorage
 *  e sincroniza entre abas. A futura landing apenas chama `setLocale`. O idioma
 *  dirige também a MOEDA e o GATEWAY de pagamento (pt→Asaas/BRL, en→Paddle/USD). */
function detect(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "pt" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")) return "en";
  return "pt";
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(detect);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
    try {
      document.documentElement.lang = next === "en" ? "en" : "pt-BR";
    } catch {
      /* ignore */
    }
    setLocaleState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "pt-BR";
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && (e.newValue === "pt" || e.newValue === "en")) setLocaleState(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [locale]);

  return { locale, setLocale, isEn: locale === "en" };
}
