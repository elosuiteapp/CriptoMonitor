import { useEffect, useState } from "react";

import { cotForPair, fetchForexChart, fetchForexCot, fetchForexOverview } from "../../lib/forex";
import { supabase } from "../../lib/supabase";
import Markdown from "../Markdown";
import { buildContext, computeRead, readConviction, type Read } from "./ForexLeituraTab";

/** Relatório por IA (Gemini) do par — aba própria, no padrão do B3. Reaproveita o
 *  MOTOR da Leitura (computeRead) p/ montar o contexto e chama forex-report. */
export default function ForexReportsTab({ pair }: { pair: string }) {
  const [read, setRead] = useState<Read | null>(null);
  const [ai, setAi] = useState<{ content: string; model: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setAi(null);
    setError(null);
    setRead(null);
    const cotInfo = cotForPair(pair);
    Promise.all([fetchForexChart(pair, "1d"), fetchForexOverview(), cotInfo ? fetchForexCot(cotInfo.currency) : Promise.resolve(null)]).then(([candles, ov, cot]) => {
      if (!alive) return;
      const dxy = ov.find((q) => q.pair === "DXY")?.changePct ?? null;
      setRead(computeRead(pair, candles, dxy, cot, cotInfo));
    });
    return () => {
      alive = false;
    };
  }, [pair]);

  async function generate() {
    if (!read) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("forex-report", { body: { pair, context: buildContext(read, readConviction(read)) } });
      if (fnErr) {
        let msg = fnErr.message;
        const ctx = (fnErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const b = await ctx.json().catch(() => null);
          if (b?.error) msg = b.error;
        }
        throw new Error(msg);
      }
      const d = data as { content?: string; model_used?: string };
      if (!d?.content) throw new Error("Resposta vazia da IA.");
      setAi({ content: d.content, model: d.model_used ?? "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Relatório por IA · {pair}</h3>
          <p className="text-xs text-muted-foreground">A IA sintetiza a leitura completa do par (tendência, estrutura, dólar, carry, posicionamento COT) num texto. Gerado pela IA.</p>
        </div>
        <button onClick={generate} disabled={loading || !read} className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {loading ? "Gerando…" : ai ? "✨ Gerar de novo" : "✨ Gerar relatório"}
        </button>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}

      {ai ? (
        <div className="rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
          <Markdown text={ai.content} />
          <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">Gerado por IA ({ai.model}). Educacional — não é recomendação.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground dark:bg-card/60">
          {read ? "Clique em “Gerar relatório” para a IA escrever a leitura do par." : "Carregando dados do par…"}
        </div>
      )}
    </div>
  );
}
