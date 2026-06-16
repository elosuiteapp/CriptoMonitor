import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "cm.theme";

/** Lê o tema já aplicado no <html> (definido pelo script anti-flash do index.html). */
function readApplied(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Tema da aplicação (claro/escuro). Persiste em localStorage e alterna a classe
 *  `.dark` no <html> — sincroniza entre abas. Padrão: escuro (terminal). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readApplied);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* localStorage indisponível — segue só em memória */
    }
    setThemeState(next);
  }, []);

  const toggle = useCallback(
    () => setTheme(readApplied() === "dark" ? "light" : "dark"),
    [setTheme],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && (e.newValue === "dark" || e.newValue === "light")) {
        document.documentElement.classList.toggle("dark", e.newValue === "dark");
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { theme, setTheme, toggle, isDark: theme === "dark" };
}
