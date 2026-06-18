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

// Login social: Google ativo. Microsoft (Azure) fica OCULTO até configurarmos o
// provider no Supabase — o código de signInWithMicrosoft segue pronto; basta virar
// esta flag para true e habilitar o Azure (tenant `common`). Ver memória build-status.
const SHOW_MICROSOFT_LOGIN = false;

// Site público (landing). Quando o domínio estiver no ar: https://orbeview.com.
const LANDING_URL = "https://orbeview.com";

const HIGHLIGHTS = [
  "Gamma, smart money e fluxo de capital em tempo real",
  "Heatmap de liquidação e paredes do book",
  "Alertas e relatórios diários por IA",
  "Cripto agora; ações (B3) e câmbio chegando",
];

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";

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
    <div className="grid min-h-full lg:grid-cols-2">
      {/* ─── Painel de marca (esquerda; oculto no mobile) ─── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-white/5 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">OV</span>
          <span className="text-lg font-bold tracking-tight">OrbeView</span>
        </div>

        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">
            Bem-vindo
            <br />
            de volta
          </h2>
          <p className="mt-4 max-w-sm text-white/80">
            Acesse seu cockpit e continue lendo o mercado com a visão de quem o move.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {HIGHLIGHTS.map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px]">✓</span>
                <span className="text-white/90">{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">
          © 2026 OrbeView · informativo e educacional, não é recomendação.
        </p>
      </div>

      {/* ─── Formulário (direita) ─── */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center justify-between">
            <a href={LANDING_URL} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              ← Página inicial
            </a>
            <span className="flex items-center gap-2 lg:hidden">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-indigo-500 text-xs font-bold text-white">
                OV
              </span>
              <span className="font-bold text-foreground">OrbeView</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            {mode === "signin" ? "Acesse seu cockpit" : "Crie sua conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Entre com suas credenciais para continuar." : "Comece grátis — sem cartão."}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nome completo</span>
                <input className={fieldCls} placeholder="Seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">E-mail</span>
              <input type="email" className={fieldCls} placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Senha</span>
              <input type="password" className={fieldCls} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {info && <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "…" : mode === "signin" ? "Entrar no cockpit" : "Criar conta grátis"}
            </button>
          </form>

          <div className="flex items-center gap-2 py-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">ou continue com</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <GoogleIcon />
            Entrar com Google
          </button>

          {SHOW_MICROSOFT_LOGIN && (
            <button
              type="button"
              onClick={() => signInWithMicrosoft()}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <MicrosoftIcon />
              Entrar com Microsoft <span className="text-xs text-muted-foreground">(Hotmail/Outlook)</span>
            </button>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                Não tem conta?{" "}
                <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">
                  Criar conta grátis
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button onClick={() => setMode("signin")} className="font-medium text-primary hover:underline">
                  Entrar
                </button>
              </>
            )}
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <Link to="/pricing" className="hover:underline">
              Ver planos
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
