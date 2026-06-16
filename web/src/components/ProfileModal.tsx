import { useState } from "react";
import { Link } from "react-router-dom";

import type { Profile } from "../hooks/useProfile";

interface Props {
  email: string | null;
  planName: string | null;
  initialName: string;
  initialPhone: string;
  onClose: () => void;
  onSave: (fields: Partial<Profile>) => Promise<{ error: unknown }>;
}

/** Modal "Finalizar cadastro" — edita nome e telefone (gravados em profiles). */
export default function ProfileModal({
  email,
  planName,
  initialName,
  initialPhone,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const { error } = await onSave({ full_name: name.trim() || null, phone: phone.trim() || null });
    setBusy(false);
    if (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar.");
      return;
    }
    setDone(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-ink-600 bg-ink-800 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Seu perfil</h2>
            <p className="text-xs text-slate-500">
              Finalize seu cadastro para liberar alertas e personalização.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-lg leading-none text-slate-500 hover:text-slate-300"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Nome completo</span>
            <input
              className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Telefone / WhatsApp</span>
            <input
              type="tel"
              className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
            />
            <span className="mt-1 block text-[11px] text-slate-600">
              Usado para alertas por WhatsApp (plano Expert).
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">E-mail</span>
              <input
                disabled
                value={email ?? ""}
                className="w-full cursor-not-allowed truncate rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-2 text-sm text-slate-400"
              />
            </label>
            <div>
              <span className="mb-1 block text-xs text-slate-400">Plano</span>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-2 text-sm">
                <span className="truncate text-slate-300">{planName ?? "—"}</span>
                <Link to="/pricing" onClick={onClose} className="shrink-0 text-xs text-accent hover:underline">
                  Mudar
                </Link>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-signal-red">{error}</p>}
          {done && <p className="text-sm text-signal-green">Perfil atualizado! ✓</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
