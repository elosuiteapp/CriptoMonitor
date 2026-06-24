import { Link } from "react-router-dom";

import { useT } from "../lib/i18n";

/** Tela 404 — evita o redirect silencioso e orienta o usuário de volta. */
export default function NotFound() {
  const { t } = useT();
  return (
    <div className="grid min-h-full place-items-center px-4">
      <div className="text-center">
        <p className="num text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-xl font-bold text-foreground">{t.pages.notFound.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.notFound.sub}
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
        >
          {t.pages.notFound.back}
        </Link>
      </div>
    </div>
  );
}
