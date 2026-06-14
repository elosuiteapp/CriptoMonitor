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

/** Bloco de notícias filtradas por ativo (PRD §8.6.4). Free vê 3, Pro+ vê 8. */
export default function NewsBlock({ asset, plan }: { asset: string; plan: Plan | null }) {
  const [items, setItems] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const limit = plan?.advanced_metrics ? 8 : 3;

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("news_feed")
      .select("title, source, url, published_at")
      .contains("assets", [asset])
      .order("published_at", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (active) {
          setItems((data as NewsRow[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [asset, limit]);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-300">Notícias · {asset}</h2>
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-slate-500">Sem notícias recentes para {asset}.</p>
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
