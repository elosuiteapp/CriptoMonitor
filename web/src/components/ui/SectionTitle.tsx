import type { ReactNode } from "react";

/** Título de seção pequeno e institucional (xs, semibold, uppercase, tracking). */
export default function SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={`section-title ${className}`}>{children}</h2>;
}
