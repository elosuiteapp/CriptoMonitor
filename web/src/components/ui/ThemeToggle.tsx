import { useTheme } from "../../hooks/useTheme";
import { useT } from "../../lib/i18n";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Botão de troca de tema (sol/lua). */
export default function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  const { isEn } = useT();
  return (
    <button
      onClick={toggle}
      aria-label={isEn ? (isDark ? "Switch to light mode" : "Switch to dark mode") : isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isEn ? (isDark ? "Light mode" : "Dark mode") : isDark ? "Modo claro" : "Modo escuro"}
      className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-surface text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
