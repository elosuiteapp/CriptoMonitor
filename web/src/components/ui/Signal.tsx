import type { ReactNode } from "react";

import type { Level } from "../../lib/types";

/**
 * Badge de sinalização "alerta transgênico": fundo sutil + texto contrastante +
 * borda fina, em vez de cores sólidas berrantes. Mapeia o semáforo do app:
 * green→bullish (emerald), red→bearish (rose), yellow→alerta (amber), neutral→slate.
 */
const STYLES: Record<Level, string> = {
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
  red: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400",
  yellow:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400",
  neutral:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
};

interface Props {
  level: Level;
  children: ReactNode;
  className?: string;
}

export default function Signal({ level, children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[level]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Pontinho do semáforo (versão "transgênica" suave) para usar dentro de cards. */
const DOT: Record<Level, string> = {
  green: "bg-emerald-500",
  red: "bg-rose-500",
  yellow: "bg-amber-500",
  neutral: "bg-slate-400 dark:bg-slate-500",
};

export function SignalDot({ level, className = "" }: { level: Level; className?: string }) {
  return <span className={`inline-block rounded-full ${DOT[level]} ${className}`} />;
}
