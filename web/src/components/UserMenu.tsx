import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { useEscapeKey } from "../hooks/useEscapeKey";
import { useProfile } from "../hooks/useProfile";
import AccountDrawer from "./AccountDrawer";
import Avatar from "./Avatar";

interface Props {
  user: User;
  planName: string | null;
  onSignOut: () => void;
}

const WELCOME_KEY = "ov.welcome-seen";

/** Chip de perfil no header: avatar + nome, com dropdown (gerenciar plano / editar
 *  perfil / sair). Tudo abre o painel "Sua conta" (AccountDrawer). No 1º acesso de
 *  quem está no Free, abre o painel automaticamente (boas-vindas), uma única vez. */
export default function UserMenu({ user, planName, onSignOut }: Props) {
  const { loading, avatarUrl, email, displayName, complete } = useProfile(user);
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<{ welcome: boolean } | null>(null);
  useEscapeKey(() => setOpen(false), open);

  // Boas-vindas: 1º acesso de quem está no Free abre o painel uma vez.
  useEffect(() => {
    if (planName !== "Free") return;
    try {
      if (!localStorage.getItem(WELCOME_KEY)) {
        localStorage.setItem(WELCOME_KEY, "1");
        setAccount({ welcome: true });
      }
    } catch {
      /* localStorage indisponível */
    }
  }, [planName]);

  const firstName = displayName.split(/\s+/)[0];
  const openAccount = () => {
    setAccount({ welcome: false });
    setOpen(false);
  };

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

            {/* Chip do plano — clicável: abre o painel da conta (gerenciar/trocar plano). */}
            <div className="px-3 pt-2.5">
              <button
                onClick={openAccount}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                Plano <span className="font-semibold text-foreground">{planName ?? "—"}</span>
                <span className="text-primary">· gerenciar</span>
              </button>
            </div>

            {!complete && (
              <p className="px-3 pt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Cadastro incompleto — adicione seu telefone/WhatsApp.
              </p>
            )}

            <div className="p-1.5">
              <button
                onClick={openAccount}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              >
                <span aria-hidden>👤</span>
                Editar perfil
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

      {account && <AccountDrawer user={user} welcome={account.welcome} onClose={() => setAccount(null)} />}
    </div>
  );
}
