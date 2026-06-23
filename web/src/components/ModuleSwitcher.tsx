import { useState } from "react";

import { useEscapeKey } from "../hooks/useEscapeKey";
import { useT } from "../lib/i18n";
import { MODULES, type ModuleId } from "../lib/modules";

interface Props {
  current: ModuleId;
  onChange: (id: ModuleId) => void;
  isAdmin: boolean;
}

/** Seletor de módulo de mercado (Crypto/Forex) no topo. Visível para todos;
 *  Forex aparece como "Em breve" e só o admin pode alternar por enquanto —
 *  depois passa a exigir assinatura do plano Forex. */
export default function ModuleSwitcher({ current, onChange, isAdmin }: Props) {
  const { t: tr } = useT();
  const [open, setOpen] = useState(false);
  useEscapeKey(() => setOpen(false), open);
  const active = MODULES.find((m) => m.id === current) ?? MODULES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted"
        title={tr.modules.tooltip}
      >
        <span aria-hidden className="text-base leading-none">
          {active.icon}
        </span>
        <span>{active.label}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-2xl">
            <p className="px-3 pb-1 pt-2 section-title">{tr.modules.menuTitle}</p>

            {MODULES.map((m) => {
              const isActive = m.id === current;
              // Acesso atual: Crypto p/ todos; Forex (ainda não implantado) só admin.
              // No futuro: trocar por `m.available || hasPlan(m.id)`.
              const canUse = m.available || isAdmin;

              const head = (
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="text-base leading-none">
                    {m.icon}
                  </span>
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      {m.label}
                      {!m.available && (
                        <span className="rounded-full border border-border px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {tr.modules.soon}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{m.description}</span>
                  </span>
                </span>
              );

              if (!canUse) {
                return (
                  <div
                    key={m.id}
                    title={tr.modules.forexLocked}
                    className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg px-2 py-2 opacity-60"
                  >
                    {head}
                    <span aria-hidden>🔒</span>
                  </div>
                );
              }

              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted ${
                    isActive ? "bg-primary/10" : ""
                  }`}
                >
                  {head}
                  {isActive ? (
                    <span className="text-primary">✓</span>
                  ) : !m.available && isAdmin ? (
                    <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      admin
                    </span>
                  ) : null}
                </button>
              );
            })}

            {!isAdmin && (
              <p className="px-3 pb-2 pt-1 text-[11px] text-muted-foreground">
                {tr.modules.moreSoon}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
