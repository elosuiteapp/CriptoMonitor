import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function Login() {
  const { signIn, signUp, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, password);
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setInfo("Conta criada! Confirme o e-mail (se exigido) e faça login.");
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-white">Crypto Monitor</h1>
          <p className="mt-1 text-sm text-slate-500">O cockpit de decisões do trader</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-ink-600 bg-ink-800/60 p-6">
          {mode === "signup" && (
            <input
              className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Nome completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}
          <input
            type="email"
            className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="w-full rounded-lg border border-ink-500 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <p className="text-sm text-signal-red">{error}</p>}
          {info && <p className="text-sm text-signal-green">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Entrar" : "Criar conta"}
          </button>

          <div className="flex items-center gap-2 py-1">
            <span className="h-px flex-1 bg-ink-600" />
            <span className="text-[11px] uppercase tracking-wide text-slate-600">ou continue com</span>
            <span className="h-px flex-1 bg-ink-600" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-500 py-2 text-sm font-medium text-slate-200 hover:bg-ink-700"
          >
            <GoogleIcon />
            Entrar com Google
          </button>

          <button
            type="button"
            onClick={() => signInWithMicrosoft()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-500 py-2 text-sm font-medium text-slate-200 hover:bg-ink-700"
          >
            <MicrosoftIcon />
            Entrar com Microsoft <span className="text-xs text-slate-500">(Hotmail/Outlook)</span>
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "signin" ? (
            <>
              Não tem conta?{" "}
              <button onClick={() => setMode("signup")} className="text-accent hover:underline">
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button onClick={() => setMode("signin")} className="text-accent hover:underline">
                Entrar
              </button>
            </>
          )}
        </p>
        <p className="mt-2 text-center text-xs text-slate-600">
          <Link to="/pricing" className="hover:underline">
            Ver planos
          </Link>
        </p>
      </div>
    </div>
  );
}
