import { useState } from "react";

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
  const [open, setOpen] = useState(false);
  const active = MODULES.find((m) => m.id === current) ?? MODULES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-700/60 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-ink-600"
        title="Módulo de mercado"
      >
        <span aria-hidden className="text-base leading-none">
          {active.icon}
        </span>
        <span>{active.label}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-ink-600 bg-ink-800 p-1 shadow-2xl">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Módulo de mercado
            </p>

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
                    <span className="flex items-center gap-1.5 font-medium text-slate-100">
                      {m.label}
                      {!m.available && (
                        <span className="rounded-full border border-ink-500 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Em breve
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500">{m.description}</span>
                  </span>
                </span>
              );

              if (!canUse) {
                return (
                  <div
                    key={m.id}
                    title="Disponível com o plano Forex (em breve)"
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
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left hover:bg-ink-700 ${
                    isActive ? "bg-accent/15" : ""
                  }`}
                >
                  {head}
                  {isActive ? (
                    <span className="text-accent">✓</span>
                  ) : !m.available && isAdmin ? (
                    <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      admin
                    </span>
                  ) : null}
                </button>
              );
            })}

            {!isAdmin && (
              <p className="px-3 pb-2 pt-1 text-[11px] text-slate-600">
                Novos módulos serão liberados conforme seu plano.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
