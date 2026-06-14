import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

interface ReportRow {
  id: number;
  asset: string;
  model_used: string;
  content: string;
  created_at: string;
}

const modelLabel = (m: string) =>
  m.includes("pro") ? "Gemini Pro" : m.includes("flash") ? "Gemini Flash" : m;

// ─── Markdown leve (sem dependência): títulos, negrito, listas ────────────────
function inline(s: string): ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="text-slate-100">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function MarkdownLite({ text }: { text: string }) {
  const out: ReactNode[] = [];
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (!t) return out.push(<div key={i} className="h-2" />);
    if (t.startsWith("## ")) return out.push(<h4 key={i} className="mt-3 mb-1 text-sm font-semibold text-white">{inline(t.slice(3))}</h4>);
    if (t.startsWith("### ")) return out.push(<h5 key={i} className="mt-2 text-sm font-medium text-slate-200">{inline(t.slice(4))}</h5>);
    if (t.startsWith("# ")) return out.push(<h4 key={i} className="mt-3 text-sm font-semibold text-white">{inline(t.slice(2))}</h4>);
    if (/^[-*]\s/.test(t)) return out.push(
      <div key={i} className="flex gap-1.5 text-sm leading-relaxed text-slate-300"><span className="text-slate-500">•</span><span>{inline(t.slice(2))}</span></div>,
    );
    out.push(<p key={i} className="text-sm leading-relaxed text-slate-300">{inline(t)}</p>);
  });
  return <div>{out}</div>;
}

/** Aba "Relatórios" — relatórios diários do ativo (broadcast, gerados por Gemini).
 *  Gating via RLS: Pro+ vê os últimos 14; Free vê só a vitrine (>7 dias). Botão de
 *  geração manual aparece só no Expert (cron/entrega ficam para etapa futura). */
export default function ReportsTab({ asset, plan, isExpert }: { asset: string; plan: Plan | null; isExpert: boolean }) {
  const advanced = plan?.advanced_metrics ?? false;
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<ReportRow[]> => {
    const { data } = await supabase
      .from("ai_analysis")
      .select("id, asset, model_used, content, created_at")
      .eq("asset", asset)
      .eq("report_type", "daily")
      .order("created_at", { ascending: false })
      .limit(14);
    const list = (data as ReportRow[]) ?? [];
    setRows(list);
    return list;
  }, [asset]);

  useEffect(() => {
    setRows(null);
    setOpen(null);
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("cockpit-report", { body: { asset } });
      if (fnErr) {
        let msg = fnErr.message;
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) msg = body.error;
        }
        throw new Error(msg);
      }
      const list = await load();
      if (list[0]) setOpen(list[0].id); // abre o recém-gerado
      void data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar relatório");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Relatórios diários · {asset}</h2>
          <p className="text-xs text-slate-500">Gerados pela IA (Gemini) a partir do snapshot, gamma, macro e notícias.</p>
        </div>
        {isExpert && (
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {generating ? "Gerando…" : "✨ Gerar relatório agora"}
          </button>
        )}
      </div>

      {!advanced && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-slate-200">
          🔒 Desbloqueie os <strong>relatórios diários</strong> no plano <strong>Pro</strong> — leitura
          completa do dia (gamma, fluxo, macro e cenários) gerada pela IA.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-3 text-sm text-signal-red">{error}</div>
      )}

      {rows == null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-ink-600 bg-ink-800/60 p-6 text-sm text-slate-400">
          {advanced
            ? isExpert
              ? "Nenhum relatório ainda. Clique em “Gerar relatório agora”."
              : "Nenhum relatório gerado ainda — em breve os relatórios diários aparecem aqui."
            : "Nenhum relatório de vitrine disponível ainda."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = open === r.id;
            const dt = new Date(r.created_at);
            return (
              <div key={r.id} className="rounded-xl border border-ink-600 bg-ink-800/60">
                <button
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  className="flex w-full items-center justify-between gap-3 p-4 text-left"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-200">
                    <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">Diário</span>
                    {dt.toLocaleDateString("pt-BR")} · {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {modelLabel(r.model_used)}
                    <span>{isOpen ? "−" : "+"}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-ink-600 p-4">
                    <MarkdownLite text={r.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
