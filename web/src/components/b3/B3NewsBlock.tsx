import { useEffect, useState } from "react";

import { relativeTime } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface NewsRow {
  title: string;
  source: string | null;
  url: string;
  published_at: string;
}

/** Notícias do mercado brasileiro (B3) — isolado. Lê news_feed com market='b3'
 *  (não toca cripto/forex). Fontes: InfoMoney, Money Times, Suno. */
export default function B3NewsBlock() {
  const [items, setItems] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    supabase
      .from("news_feed")
      .select("title, source, url, published_at")
      .eq("market", "b3")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!active) return;
        setItems((data as NewsRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover p-4 dark:bg-card/60">
      <h3 className="mb-2 text-sm font-semibold text-foreground">📰 Notícias · mercado brasileiro</h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem notícias recentes.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => (
            <a key={i} href={n.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-4 rounded-lg border border-border bg-background/40 px-4 py-2.5 transition hover:border-primary/40">
              <span className="text-sm text-foreground">{n.title}</span>
              <span className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground">
                {n.source}
                <br />
                {relativeTime(n.published_at)} ↗
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
