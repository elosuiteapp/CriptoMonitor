import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
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

          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="w-full rounded-lg border border-ink-500 py-2 text-sm font-medium text-slate-300 hover:bg-ink-700"
          >
            Entrar com Google
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
