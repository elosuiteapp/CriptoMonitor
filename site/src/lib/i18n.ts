// Helpers de i18n/SEO da landing. As rotas PT ficam na raiz (/, /precos, …) e as
// EN espelhadas sob /en/ (/en/, /en/precos, …). Cada URL é o canônico do seu idioma;
// as duas se referenciam por hreflang. O corpo é compartilhado (both-in-DOM), então
// estes helpers só calculam o idioma e os pares de URL a partir do pathname.
import { SITE_URL } from "../consts";

export type Lang = "pt" | "en";

/** Idioma de uma rota pelo caminho: tudo sob /en é EN; o resto é PT (padrão). */
export function langFromPath(pathname: string): Lang {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "pt";
}

/** Caminhos PT e EN equivalentes a partir de qualquer pathname (com ou sem /en). */
export function altPaths(pathname: string): { pt: string; en: string } {
  let pt = pathname.replace(/^\/en(?=\/|$)/, "");
  if (pt === "") pt = "/";
  const en = pt === "/" ? "/en/" : `/en${pt}`;
  return { pt, en };
}

/** URL absoluta no domínio do site (para canonical/hreflang/OG). */
export function absUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}
