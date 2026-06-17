import { useState } from "react";
import { Link } from "react-router-dom";

import type { Profile } from "../hooks/useProfile";

interface Props {
  email: string | null;
  planName: string | null;
  initialName: string;
  initialPhone: string;
  initialCpf: string;
  onClose: () => void;
  onSave: (fields: Partial<Profile>) => Promise<{ error: unknown }>;
}

/** Modal "Finalizar cadastro" — edita nome, telefone e CPF (gravados em profiles). */
export default function ProfileModal({
  email,
  planName,
  initialName,
  initialPhone,
  initialCpf,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [cpf, setCpf] = useState(initialCpf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const { error } = await onSave({
      full_name: name.trim() || null,
      phone: phone.trim() || null,
      cpf: cpf.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar.");
      return;
    }
    setDone(true);
  }

  const fieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Seu perfil</h2>
            <p className="text-xs text-muted-foreground">
              Finalize seu cadastro para liberar alertas e personalização.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-lg leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Nome completo</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Telefone / WhatsApp</span>
            <input
              type="tel"
              className={`num ${fieldClass}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Usado para alertas por WhatsApp (plano Expert).
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">CPF</span>
            <input
              type="text"
              inputMode="numeric"
              className={`num ${fieldClass}`}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Necessário para pagamento em reais (Pix/cartão via Asaas).
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">E-mail</span>
              <input
                disabled
                value={email ?? ""}
                className="w-full cursor-not-allowed truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs text-muted-foreground">Plano</span>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                <span className="truncate text-foreground">{planName ?? "—"}</span>
                <Link to="/pricing" onClick={onClose} className="shrink-0 text-xs text-primary hover:underline">
                  Mudar
                </Link>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          {done && <p className="text-sm text-emerald-600 dark:text-emerald-400">Perfil atualizado! ✓</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
