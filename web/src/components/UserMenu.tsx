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
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-2.5 transition-all duration-200 hover:bg-muted"
        title={displayName}
      >
        <Avatar url={avatarUrl} name={displayName} size={28} />
        <span className="max-w-[8rem] truncate text-sm font-medium text-foreground">{firstName}</span>
        {!loading && !complete && (
          <span title="Cadastro incompleto" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
        )}
        <span className="text-xs text-muted-foreground">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border p-3">
              <Avatar url={avatarUrl} name={displayName} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 pt-2.5">
              <span className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                Plano {planName ?? "—"}
              </span>
            </div>

            {!complete && (
              <p className="px-3 pt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Cadastro incompleto — adicione seu telefone/WhatsApp.
              </p>
            )}

            <div className="p-1.5">
              <button
                onClick={() => {
                  setEditing(true);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <span aria-hidden>👤</span>
                {complete ? "Editar perfil" : "Finalizar cadastro"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted"
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
          user={user}
          email={email}
          initialName={profile?.full_name ?? ""}
          initialPhone={profile?.phone ?? ""}
          initialCpf={profile?.cpf ?? ""}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
    </div>
  );
}
