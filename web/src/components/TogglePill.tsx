import type { ReactNode } from "react";

import InfoTip from "./InfoTip";

/**
 * Pill de indicador/camada — PADRÃO VISUAL ÚNICO do OrbeView (Cripto/B3/Forex).
 * Mesmo desenho do `LayerToggles` do cripto: borda arredondada, bolinha colorida
 * quando ativo, label e InfoTip. Use sempre este componente para alternar camadas/
 * indicadores em qualquer módulo, para não virar "salada de frutas".
 */
export interface TogglePillProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  color?: string; // classe bg-* da bolinha quando ativo
  desc?: string; // explicação (InfoTip)
  locked?: boolean;
}

export function TogglePill({ label, active, onToggle, color = "bg-primary", desc, locked }: TogglePillProps) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
        locked
          ? "cursor-not-allowed border-border text-muted-foreground"
          : active
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:border-border"
      }`}
    >
      <button type="button" disabled={locked} onClick={onToggle} className="flex items-center gap-1.5 disabled:cursor-not-allowed">
        <span className={`h-2 w-2 rounded-full ${active ? color : "bg-muted"}`} />
        {label}
        {locked && <span aria-hidden>🔒</span>}
      </button>
      {!locked && desc && <InfoTip text={desc} />}
    </span>
  );
}

/** Linha rotulada de pills (ex.: "Indicadores:" / "Camadas:"). */
export function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
