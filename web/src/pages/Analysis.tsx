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

  useEffect(() => {
    let active = true;
    setLoading(true);
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

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← Voltar ao cockpit
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-white">O que está acontecendo · {asset}</h1>

        <div className="mt-6 rounded-2xl border border-ink-600 bg-ink-800/60 p-6">
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
            <div className="text-sm text-slate-400">
              <p>Ainda não há análise gerada para {asset}.</p>
              <p className="mt-2 text-slate-500">
                A geração sob demanda pela Claude API entra na <strong>Fase 4</strong> (Edge Function
                com seleção de modelo por plano e controle de cota).
              </p>
            </div>
          )}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
