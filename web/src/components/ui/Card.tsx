import type { HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** Realce institucional: borda primária + leve ring. */
  highlight?: boolean;
}

/**
 * Superfície de card/módulo, premium e theme-aware.
 * - Claro: branco sólido + sombra suave difusa (`shadow-card`).
 * - Escuro: slate-900 translúcido + `backdrop-blur` + brilho interno no topo
 *   (`shadow-glow`), sem sombra preta — só borda nítida.
 */
export default function Card({ highlight = false, className = "", children, ...rest }: Props) {
  return (
    <div
      className={[
        "rounded-xl border bg-card backdrop-blur-md transition-all duration-200",
        "shadow-card dark:bg-card/60 dark:shadow-glow",
        highlight ? "border-primary/40 ring-1 ring-primary/10" : "border-border",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
