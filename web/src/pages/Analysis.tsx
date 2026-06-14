import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Disclaimer from "../components/Disclaimer";
import { supabase } from "../lib/supabase";

interface AnalysisRow {
  content: string;
  model_used: string;
  created_at: string;
}

export default function Analysis() {
  const [params] = useSearchParams();
  const asset = (params.get("asset") ?? "BTC").toUpperCase();
  const [row, setRow] = useState<AnalysisRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counter, setCounter] = useState<{ used: number; limit: number | null } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    supabase
      .from("ai_analysis")
      .select("content, model_used, created_at")
      .eq("asset", asset)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setRow((data as AnalysisRow) ?? null);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [asset]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("claude-analysis", {
        body: { asset },
      });
      if (error) {
        // Tenta extrair a mensagem amigável do corpo da resposta
        let msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          if (body?.error) msg = body.error;
        }
        throw new Error(msg);
      }
      setRow({
        content: data.content,
        model_used: data.model_used,
        created_at: new Date().toISOString(),
      });
      setCounter({ used: data.used, limit: data.limit });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar análise");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Voltar ao cockpit
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-white">O que está acontecendo · {asset}</h1>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {generating ? "Gerando…" : "✨ Gerar análise"}
          </button>
        </div>

        {counter && (
          <p className="mt-2 text-xs text-slate-500">
            {counter.limit === null
              ? "Plano com análises ilimitadas"
              : `Análise ${counter.used} de ${counter.limit} hoje`}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-signal-red/40 bg-signal-red/10 p-3 text-sm text-signal-red">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-ink-600 bg-ink-800/60 p-6">
          {loading ? (
            <p className="text-slate-500">Carregando…</p>
          ) : row ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{row.content}</p>
              <p className="mt-4 text-xs text-slate-600">
                Modelo {row.model_used} · {new Date(row.created_at).toLocaleString("pt-BR")}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Nenhuma análise gerada ainda. Clique em <strong>Gerar análise</strong> para o copiloto
              narrar o cenário de {asset}.
            </p>
          )}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
