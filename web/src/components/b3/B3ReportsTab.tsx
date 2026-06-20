import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";
import Markdown from "../Markdown";

interface ReportRow {
  id: number;
  content: string;
  model: string | null;
  ts: string;
}

/** Relatórios — relatório diário do pregão da B3 gerado por IA (Gemini). Admin-only. */
export default function B3ReportsTab() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("b3_reports").select("id, content, model, ts").order("ts", { ascending: false }).limit(14);
    const list = (data as ReportRow[]) ?? [];
    setRows(list);
    return list;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const { error: fnErr } = await supabase.functions.invoke("b3-report", { body: {} });
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
      if (list[0]) setOpen(list[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar relatório");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Relatório do pregão · B3</h3>
          <p className="text-xs text-muted-foreground">Gerado pela IA a partir de IBOV, dólar, macro BR, Focus, cenário externo e ADRs.</p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {generating ? "Gerando…" : "✨ Gerar relatório agora"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>
      )}

      {rows == null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">Nenhum relatório ainda. Clique em "Gerar relatório agora".</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const isOpen = open === r.id;
            const dt = new Date(r.ts);
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card dark:bg-card/60">
                <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Pregão</span>
                    <span className="num">
                      {dt.toLocaleDateString("pt-BR")} · {dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-border p-4">
                    <Markdown text={r.content} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
