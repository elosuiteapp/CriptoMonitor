import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { getLocale } from "../hooks/useLocale";
import { useT } from "../lib/i18n";
import LangSwitch from "../components/ui/LangSwitch";

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

// Site público (landing). Quando o domínio estiver no ar: https://orbeview.com.
const LANDING_URL = "https://orbeview.com";

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";

export default function Login() {
  const { t: tr } = useT();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false); // aceite de Termos/Privacidade (signup)
  const isEn = getLocale() === "en";

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
        setInfo(tr.login.accountCreated);
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tr.login.authFail);
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
          <h2 className="text-4xl font-extrabold leading-tight">{tr.login.welcomeTitle}</h2>
          <p className="mt-4 max-w-sm text-white/80">{tr.login.welcomeSub}</p>
          <ul className="mt-8 space-y-3 text-sm">
            {tr.login.highlights.map((h) => (
              <li key={h} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/20 text-[11px]">✓</span>
                <span className="text-white/90">{h}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">{tr.login.copyright}</p>
      </div>

      {/* ─── Formulário (direita) ─── */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center justify-between">
            <a href={LANDING_URL} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              {tr.login.backHome}
            </a>
            <div className="flex items-center gap-3">
              <LangSwitch compact />
              <span className="flex items-center gap-2 lg:hidden">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-indigo-500 text-xs font-bold text-white">
                  OV
                </span>
                <span className="font-bold text-foreground">OrbeView</span>
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            {mode === "signin" ? tr.login.signinTitle : tr.login.signupTitle}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? tr.login.signinSub : tr.login.signupSub}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr.login.fullName}</span>
                <input className={fieldCls} placeholder={tr.login.namePlaceholder} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr.login.email}</span>
              <input type="email" className={fieldCls} placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr.login.password}</span>
              <input type="password" className={fieldCls} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </label>

            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  {isEn ? "I've read and agree to the " : "Li e concordo com os "}
                  <a href={`${LANDING_URL}/termos`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {isEn ? "Terms of Use" : "Termos de Uso"}
                  </a>
                  {isEn ? " and " : " e a "}
                  <a href={`${LANDING_URL}/privacidade`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {isEn ? "Privacy Policy" : "Política de Privacidade"}
                  </a>.
                </span>
              </label>
            )}

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {info && <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

            <button
              type="submit"
              disabled={busy || (mode === "signup" && !accepted)}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? "…" : mode === "signin" ? tr.login.signinBtn : tr.login.signupBtn}
            </button>
          </form>

          <div className="flex items-center gap-2 py-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{tr.login.orContinue}</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            onClick={() => signInWithGoogle()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <GoogleIcon />
            {tr.login.google}
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            {isEn ? "By continuing, you agree to our " : "Ao continuar, você concorda com os "}
            <a href={`${LANDING_URL}/termos`} target="_blank" rel="noreferrer" className="hover:underline">
              {isEn ? "Terms" : "Termos"}
            </a>
            {isEn ? " and " : " e a "}
            <a href={`${LANDING_URL}/privacidade`} target="_blank" rel="noreferrer" className="hover:underline">
              {isEn ? "Privacy Policy" : "Política de Privacidade"}
            </a>.
          </p>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                {tr.login.noAccount}{" "}
                <button onClick={() => setMode("signup")} className="font-medium text-primary hover:underline">
                  {tr.login.createFree}
                </button>
              </>
            ) : (
              <>
                {tr.login.haveAccount}{" "}
                <button onClick={() => setMode("signin")} className="font-medium text-primary hover:underline">
                  {tr.login.signin}
                </button>
              </>
            )}
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            <Link to="/pricing" className="hover:underline">
              {tr.login.seePlans}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
