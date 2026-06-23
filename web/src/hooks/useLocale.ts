import { useSyncExternalStore } from "react";

export type Locale = "pt" | "en";

const LS_KEY = "cm.locale"; // localStorage (compat + sync entre abas)
const COOKIE = "ov_lang"; // cookie compartilhado em .orbeview.com (handoff cross-domain)

function isLocale(v: unknown): v is Locale {
  return v === "pt" || v === "en";
}

function readCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  try {
    const host = location.hostname;
    // Compartilhável entre orbeview.com e app.orbeview.com. Em localhost/preview
    // (*.vercel.app) o atributo Domain é rejeitado → grava host-only (sem Domain).
    const domain = host.endsWith("orbeview.com") ? "; Domain=.orbeview.com" : "";
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
  } catch {
    /* ignore */
  }
}

/** Resolução do idioma (na 1ª carga): ?lang/?locale na URL → cookie .orbeview.com →
 *  localStorage → idioma do navegador → 'pt'. O ?lang vem da landing (handoff
 *  cross-domain). O idioma dirige TEXTO, MOEDA e GATEWAY (pt→Asaas/BRL, en→Paddle/USD). */
function detect(): Locale {
  if (typeof window === "undefined") return "pt";
  try {
    const q = new URLSearchParams(location.search);
    const param = q.get("lang") ?? q.get("locale");
    if (isLocale(param)) return param;
  } catch {
    /* ignore */
  }
  const cookie = readCookie(COOKIE);
  if (isLocale(cookie)) return cookie;
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    /* ignore */
  }
  if (navigator.language?.toLowerCase().startsWith("en")) return "en";
  return "pt";
}

// ─── Store compartilhado (todos os consumidores reagem juntos no mesmo documento;
//     entre abas/domínios sincroniza via cookie + evento `storage`) ──────────────
let current: Locale = detect();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function persist(next: Locale) {
  try {
    localStorage.setItem(LS_KEY, next);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE, next);
  try {
    document.documentElement.lang = next === "en" ? "en" : "pt-BR";
  } catch {
    /* ignore */
  }
}

export function setLocale(next: Locale) {
  persist(next);
  if (next === current) return;
  current = next;
  emit();
}

/** Idioma atual fora de componente React (ex.: helpers puros em format.ts). Os
 *  componentes que renderizam o resultado já reagem via useLocale/useT/useGlossary. */
export function getLocale(): Locale {
  return current;
}

if (typeof window !== "undefined") {
  // Persiste o idioma detectado já na 1ª carga (cookie + LS + <html lang>), p/ que
  // app, abas e o handoff da landing fiquem coerentes a partir daí.
  persist(current);
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY && isLocale(e.newValue) && e.newValue !== current) {
      current = e.newValue;
      emit();
    }
  });
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => current;

export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { locale, setLocale, isEn: locale === "en" };
}
