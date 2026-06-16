import { useState } from "react";
import type { User } from "@supabase/supabase-js";

import { useProfile } from "../hooks/useProfile";
import Avatar from "./Avatar";
import ProfileModal from "./ProfileModal";

interface Props {
  user: User;
  planName: string | null;
  onSignOut: () => void;
}

/** Chip de perfil no canto superior esquerdo: avatar + nome, com dropdown
 *  (editar perfil / sair) e atalho para finalizar o cadastro. */
export default function UserMenu({ user, planName, onSignOut }: Props) {
  const { profile, loading, save, avatarUrl, email, displayName, complete } = useProfile(user);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const firstName = displayName.split(/\s+/)[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-ink-500 bg-ink-700/60 py-1 pl-1 pr-2.5 hover:bg-ink-600"
        title={displayName}
      >
        <Avatar url={avatarUrl} name={displayName} size={28} />
        <span className="max-w-[8rem] truncate text-sm font-medium text-slate-100">{firstName}</span>
        {!loading && !complete && (
          <span title="Cadastro incompleto" className="h-2 w-2 shrink-0 rounded-full bg-signal-yellow" />
        )}
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-ink-600 bg-ink-800 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-ink-600 p-3">
              <Avatar url={avatarUrl} name={displayName} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                {email && <p className="truncate text-xs text-slate-400">{email}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 pt-2.5">
              <span className="inline-flex items-center rounded-full border border-ink-500 px-2.5 py-1 text-xs text-slate-300">
                Plano {planName ?? "—"}
              </span>
            </div>

            {!complete && (
              <p className="px-3 pt-1.5 text-[11px] text-signal-yellow">
                Cadastro incompleto — adicione seu telefone/WhatsApp.
              </p>
            )}

            <div className="p-1.5">
              <button
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-ink-700"
              >
                <span aria-hidden>👤</span>
                {complete ? "Editar perfil" : "Finalizar cadastro"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-ink-700"
              >
                <span aria-hidden>↩</span>
                Sair
              </button>
            </div>
          </div>
        </>
      )}

      {editing && (
        <ProfileModal
          email={email}
          planName={planName}
          initialName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </div>
  );
}
