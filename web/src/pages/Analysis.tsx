import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Disclaimer from "../components/Disclaimer";
import { useT } from "../lib/i18n";
import { marketReadSummary } from "../lib/marketReadSummary";
import { smcSummary } from "../lib/smcSummary";
import { supabase } from "../lib/supabase";

interface AnalysisRow {
  content: string;
  model_used: string;
  created_at: string;
}

export default function Analysis() {
  const { t, isEn } = useT();
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
      // Calcula a estrutura SMC (1D+4h) e a Leitura do Mercado (motor de confluência)
      // no cliente e envia pro copiloto — a IA narra em cima da MESMA leitura do app.
      const [smc, read] = await Promise.all([
        smcSummary(asset).catch(() => null),
        marketReadSummary(asset).catch(() => null),
      ]);
      const { data, error } = await supabase.functions.invoke("generate-analysis", {
        body: { asset, smc, read, lang: isEn ? "en" : "pt" },
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
      setError(e instanceof Error ? e.message : t.pages.analysis.genFail);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          {t.pages.backCockpit}
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{t.pages.analysis.title} · {asset}</h1>
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {generating ? t.pages.analysis.generating : `✨ ${t.pages.analysis.generate}`}
          </button>
        </div>

        {counter && (
          <p className="mt-2 text-xs text-muted-foreground">
            {counter.limit === null
              ? t.pages.analysis.unlimited
              : t.pages.analysis.countOf.replace("{used}", String(counter.used)).replace("{limit}", String(counter.limit))}
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border bg-card dark:bg-card/60 p-6">
          {loading ? (
            <p className="text-muted-foreground">{t.common.loading}</p>
          ) : row ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{row.content}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {t.pages.analysis.aiAt.replace("{date}", new Date(row.created_at).toLocaleString(isEn ? "en-US" : "pt-BR"))}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.pages.analysis.noneA}<strong>{t.pages.analysis.generate}</strong>{t.pages.analysis.noneB.replace("{asset}", asset)}
            </p>
          )}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
