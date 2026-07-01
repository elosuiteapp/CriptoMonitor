// Edge Function: b3-flow
// Fluxo de investimento na B3 por tipo de investidor (estrangeiro/institucional/pessoa física/
// inst. financeira/outros) — o "smart money" da bolsa: quem comprou/vendeu o mercado a cada dia.
// Raspagem da tabela pública de dadosdemercado.com.br/fluxo (que inclusive oferece CSV); origem
// dos dados = B3. Market-wide, diário (R$ milhões). Proxy server-side: evita CORS, parse pt-BR,
// cacheável. Sem segredos/DB. Educacional — não é recomendação. Atribuição: dadosdemercado.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } });
}

// "34,74 mi" / "-1.063,33 mi" / "1,2 bi" → número em R$ milhões (pt-BR: . = milhar, , = decimal).
function parseMi(s: string): number | null {
  if (!s) return null;
  const bi = /bi/i.test(s);
  const cleaned = s.replace(/mi|bi/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? (bi ? n * 1000 : n) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const r = await fetch("https://www.dadosdemercado.com.br/fluxo", { headers: { "user-agent": "Mozilla/5.0 (compatible; OrbeView/1.0)", accept: "text/html" } });
    if (!r.ok) return json(502, { error: `fonte ${r.status}` });
    const html = await r.text();
    const tbl = (html.match(/<table[\s\S]*?<\/table>/i) || [""])[0];
    const trs = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const flow: { date: string; foreign_mi: number | null; institutional_mi: number | null; retail_mi: number | null; financial_mi: number | null; other_mi: number | null }[] = [];
    for (const tr of trs) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      if (tds.length < 6) continue;
      const dm = tds[0].match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!dm) continue;
      flow.push({
        date: `${dm[3]}-${dm[2]}-${dm[1]}`,
        foreign_mi: parseMi(tds[1]),
        institutional_mi: parseMi(tds[2]),
        retail_mi: parseMi(tds[3]),
        financial_mi: parseMi(tds[4]),
        other_mi: parseMi(tds[5]),
      });
    }
    return json(200, { flow: flow.slice(0, 90), source: "dadosdemercado.com.br", ts: new Date().toISOString() });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
