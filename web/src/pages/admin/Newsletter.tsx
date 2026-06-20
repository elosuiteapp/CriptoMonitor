import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { supabase } from "../../lib/supabase";

interface Edition {
  id: string;
  slug: string;
  title: string;
  min_tier: string;
  published: boolean;
  published_at: string | null;
  auto_generated: boolean;
  created_at: string;
}

interface Run {
  id: number;
  status: "ok" | "error" | "skipped";
  model: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const TIER_LABEL: Record<string, string> = { free: "Free", pro: "Pro", expert: "Expert" };

const RUN_TONE: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  skipped: "bg-muted text-muted-foreground",
};

function runSummary(status: string, d: Record<string, unknown> | null): string {
  if (!d) return status;
  if (status === "error") return String(d.error ?? "erro");
  if (status === "skipped") return String(d.reason ?? "ignorado");
  return d.title ? `“${d.title}”` : String(d.slug ?? "ok");
}

/** Admin · Newsletter — gerar uma edição na hora (IA), publicar/despublicar e excluir.
 *  A geração semanal automática roda por cron (segunda 9h BRT); aqui é o controle manual. */
export default function AdminNewsletter() {
  const [rows, setRows] = useState<Edition[] | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("newsletter_editions")
      .select("id, slug, title, min_tier, published, published_at, auto_generated, created_at")
      .order("created_at", { ascending: false });
    setRows((data as Edition[] | null) ?? []);
    const { data: r } = await supabase
      .from("automation_runs")
      .select("id, status, model, detail, created_at")
      .eq("job", "newsletter")
      .order("created_at", { ascending: false })
      .limit(8);
    setRuns((r as Run[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-generate", { body: { force: true, publish: false } });
      if (error) {
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const b = await ctx.json().catch(() => null);
          if (b?.error) detail = b.error;
        }
        throw new Error(detail);
      }
      if (data?.skipped) setMsg({ kind: "ok", text: "Já havia uma edição recente — nada gerado." });
      else setMsg({ kind: "ok", text: `Rascunho criado: “${data?.title ?? "?"}”. Revise e publique abaixo. (${data?.model_used ?? "?"})` });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao gerar a edição." });
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(ed: Edition) {
    await supabase
      .from("newsletter_editions")
      .update({
        published: !ed.published,
        published_at: ed.published ? ed.published_at : ed.published_at ?? new Date().toISOString(),
      })
      .eq("id", ed.id);
    await load();
  }

  async function remove(ed: Edition) {
    if (!window.confirm(`Excluir a edição “${ed.title}”? Esta ação não pode ser desfeita.`)) return;
    await supabase.from("newsletter_editions").delete().eq("id", ed.id);
    await load();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Geração automática toda <strong className="text-foreground">sexta-feira (~9h BRT)</strong> pela IA — já publicada.
            Aqui você gera um <strong className="text-foreground">rascunho</strong> na hora para revisar antes de publicar.
          </p>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Gerando… (~20s)" : "✨ Gerar rascunho"}
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400"
          }`}
        >
          {msg.text}
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 dark:bg-card/60">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">Execuções da automação</h2>
            <span className="text-xs text-muted-foreground">geração automática: sexta ~9h BRT</span>
          </div>
          <div className="space-y-1.5">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${RUN_TONE[r.status]}`}>
                  {r.status === "ok" ? "ok" : r.status === "error" ? "erro" : "ignorado"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                {r.model && <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{r.model}</span>}
                <span className="text-foreground">{runSummary(r.status, r.detail)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows == null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">
          Nenhuma edição ainda. Clique em “Gerar agora” para criar a primeira.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((ed) => (
            <div
              key={ed.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 dark:bg-card/60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ed.published
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ed.published ? "No ar" : "Rascunho"}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                    {TIER_LABEL[ed.min_tier] ?? ed.min_tier}
                  </span>
                  {ed.auto_generated && (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      IA
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{ed.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(ed.published_at ?? ed.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/newsletter/${ed.slug}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Ver
                </Link>
                <button
                  onClick={() => togglePublish(ed)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {ed.published ? "Despublicar" : "Publicar"}
                </button>
                <button
                  onClick={() => remove(ed)}
                  className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
