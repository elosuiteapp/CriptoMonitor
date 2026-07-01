// Edge Function: econ-calendar — relay do calendário econômico (ForexFactory via
// faireconomy.media, gratuito e sem chave). Por padrão filtra eventos dos EUA de
// alto/médio impacto (FOMC, CPI, NFP, PPI, etc.) — comportamento do módulo cripto.
// Aceita { countries: ["EUR","GBP",...] } (POST) p/ multi-moeda (módulo Forex) sem
// afetar o default. Server-side para evitar CORS. Deploy: supabase functions deploy econ-calendar
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

  // Moedas pedidas (default USD = comportamento original p/ o cripto).
  let countries = ["USD"];
  try {
    const qp = new URL(req.url).searchParams.get("countries");
    if (qp) countries = qp.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { countries?: unknown };
      if (Array.isArray(body?.countries) && body.countries.length) countries = body.countries.map((s) => String(s).toUpperCase());
    }
  } catch {
    /* mantém USD */
  }
  const wanted = new Set(countries.length ? countries : ["USD"]);
  const multi = wanted.size > 1;

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
      .filter((e) => wanted.has(e.country) && (e.impact === "High" || e.impact === "Medium"))
      .map((e) => ({
        title: e.title,
        country: e.country,
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
      .slice(0, multi ? 18 : 8);

    return out({ events });
  } catch (e) {
    return out({ error: String(e), events: [] });
  }
});
