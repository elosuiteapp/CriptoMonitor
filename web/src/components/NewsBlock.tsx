import { useEffect, useState } from "react";

import { relativeTime } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Plan } from "../lib/types";

interface NewsRow {
  title: string;
  source: string | null;
  url: string;
  published_at: string;
}

const COLS = "title, source, url, published_at";

/** Bloco de notícias (PRD §8.6.4). Mostra notícias do ativo nos últimos 7 dias;
 *  se não houver nenhuma específica, cai para notícias gerais recentes do mercado.
 *  Free vê 3, Pro+ vê 8. */
export default function NewsBlock({ asset, plan }: { asset: string; plan: Plan | null }) {
  const [items, setItems] = useState<NewsRow[]>([]);
  const [general, setGeneral] = useState(false);
  const [loading, setLoading] = useState(true);
  const limit = plan?.advanced_metrics ? 8 : 3;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    (async () => {
      // 1. Notícias específicas do ativo nos últimos 7 dias
      const { data: specific } = await supabase
        .from("news_feed")
        .select(COLS)
        .contains("assets", [asset])
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (!active) return;

      if (specific && specific.length) {
        setItems(specific as NewsRow[]);
        setGeneral(false);
        setLoading(false);
        return;
      }

      // 2. Fallback: notícias gerais recentes (sem filtro de ativo)
      const { data: gen } = await supabase
        .from("news_feed")
        .select(COLS)
        .gte("published_at", since)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (!active) return;
      setItems((gen as NewsRow[]) ?? []);
      setGeneral(true);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [asset, limit]);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">
        {general ? "Notícias gerais do mercado" : `Notícias · ${asset}`}
      </h2>
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">Sem notícias recentes.</p>
        )}
        {items.map((n, i) => (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-start justify-between gap-4 rounded-lg border border-ink-600 bg-ink-800/60 px-4 py-3 transition hover:border-ink-500"
          >
            <span className="text-sm text-slate-200">{n.title}</span>
            <span className="shrink-0 text-right text-[10px] leading-tight text-slate-500">
              {n.source}
              <br />
              {relativeTime(n.published_at)} ↗
            </span>
          </a>
        ))}
        {!plan?.advanced_metrics && items.length > 0 && (
          <p className="text-[10px] text-slate-600">Mais notícias no plano Pro.</p>
        )}
      </div>
    </section>
  );
}
