import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ThemeToggle from "../components/ui/ThemeToggle";
import { listEditions, fmtDate, TIER_LABEL, type EditionCard } from "../lib/newsletter";

/** Arquivo da newsletter dentro do app (rota /newsletter). Lista as edições
 *  publicadas; a leitura completa (e o paywall por plano) fica em /newsletter/:slug. */
export default function Newsletter() {
  const [eds, setEds] = useState<EditionCard[] | null>(null);

  useEffect(() => {
    listEditions().then(setEds);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Cockpit
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="font-bold text-foreground">OrbeView</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">Newsletter</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A leitura semanal do mercado — gamma, fluxo e liquidez traduzidos. Edições completas liberadas
          para <strong className="text-foreground">qualquer conta</strong>; gerada automaticamente pela IA toda semana.
        </p>

        {eds == null ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando…</p>
        ) : eds.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">Nenhuma edição publicada ainda — em breve.</p>
        ) : (
          <div className="mt-8 space-y-3">
            {eds.map((e) => (
              <Link
                key={e.slug}
                to={`/newsletter/${e.slug}`}
                className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 dark:bg-card/60"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden>{e.cover_emoji ?? "📰"}</span>
                  <span>{fmtDate(e.published_at)}</span>
                  {e.min_tier !== "free" && (
                    <span className="ml-auto rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      🔒 {TIER_LABEL[e.min_tier]}
                    </span>
                  )}
                </div>
                <h2 className="mt-2 text-lg font-bold text-foreground">{e.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{e.excerpt}</p>
                <span className="mt-3 inline-block text-sm font-medium text-primary">Ler edição →</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
