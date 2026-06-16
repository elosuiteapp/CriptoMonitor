// Edge Function: econ-calendar — relay do calendário econômico (ForexFactory via
// faireconomy.media, gratuito e sem chave). Filtra eventos dos EUA de alto/médio
// impacto (FOMC, CPI, NFP, PPI, etc.), próximos, e devolve uma lista compacta.
// Server-side para evitar CORS. Deploy: supabase functions deploy econ-calendar
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FEEDS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const out = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const all: FFEvent[] = [];
    for (const url of FEEDS) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) continue;
        const data = (await r.json()) as FFEvent[];
        if (Array.isArray(data)) all.push(...data);
      } catch {
        /* uma semana fora não derruba a outra */
      }
    }

    const now = Date.now();
    const events = all
      .filter((e) => e.country === "USD" && (e.impact === "High" || e.impact === "Medium"))
      .map((e) => ({
        title: e.title,
        date: e.date,
        impact: e.impact,
        forecast: e.forecast || null,
        previous: e.previous || null,
      }))
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return Number.isFinite(t) && t >= now - 3 * 3600 * 1000; // próximos (tolera 3h de atraso)
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8);

    return out({ events });
  } catch (e) {
    return out({ error: String(e), events: [] });
  }
});
