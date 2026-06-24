import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import Markdown from "../components/Markdown";
import ThemeToggle from "../components/ui/ThemeToggle";
import { useT } from "../lib/i18n";
import { getEditionFull, fmtDate, TIER_LABEL, type EditionFull } from "../lib/newsletter";

type State = "loading" | "notfound" | EditionFull;

/** Leitor de uma edição (rota /newsletter/:slug). O corpo vem da RPC com paywall:
 *  se o plano não alcança o min_tier, mostra o convite de upgrade (reaproveita o
 *  fluxo do AccountDrawer via sessionStorage 'ov.pending-plan'). */
export default function NewsletterEdition() {
  const { t } = useT();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!slug) return;
    setState("loading");
    getEditionFull(slug).then((e) => setState(e ?? "notfound"));
  }, [slug]);

  function upgrade(tier: "pro" | "expert") {
    try {
      sessionStorage.setItem("ov.pending-plan", tier);
    } catch {
      /* indisponível */
    }
    navigate("/"); // o cockpit abre o painel de plano (AccountDrawer) no plano escolhido
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link to="/newsletter" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            ← Newsletter
          </Link>
          <span className="hidden h-5 w-px bg-border sm:block" />
          <span className="font-bold text-foreground">OrbeView</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        {state === "loading" ? (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        ) : state === "notfound" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center dark:bg-card/60">
            <p className="text-sm text-muted-foreground">{t.pages.newsletterEdition.notFound}</p>
            <Link to="/newsletter" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              {t.pages.newsletterEdition.seeAll}
            </Link>
          </div>
        ) : (
          <article>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden>{state.cover_emoji ?? "📰"}</span>
              <span>{fmtDate(state.published_at)}</span>
              {state.min_tier !== "free" && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {TIER_LABEL[state.min_tier]}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{state.title}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{state.excerpt}</p>

            <hr className="my-7 border-border" />

            {state.body_md ? (
              <Markdown text={state.body_md} />
            ) : (
              <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-7 text-center">
                <p className="text-2xl" aria-hidden>🔒</p>
                <p className="mt-2 text-base font-semibold text-foreground">
                  {t.pages.newsletterEdition.fullTitle.replace("{tier}", TIER_LABEL[state.min_tier])}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {t.pages.newsletterEdition.fullSub.replace("{tier}", TIER_LABEL[state.min_tier])}
                </p>
                <button
                  onClick={() => upgrade(state.min_tier === "expert" ? "expert" : "pro")}
                  className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t.pages.newsletterEdition.subscribe.replace("{tier}", TIER_LABEL[state.min_tier])}
                </button>
              </div>
            )}

            <div className="mt-10 border-t border-border pt-6">
              <Link to="/newsletter" className="text-sm font-medium text-primary hover:underline">
                {t.pages.newsletterEdition.allEditions}
              </Link>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
