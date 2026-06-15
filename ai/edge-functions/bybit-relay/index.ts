// Edge Function: bybit-relay
// Ponte para a Bybit (que bloqueia a regiao do coletor no Railway US). O Supabase
// fica em sa-east-1 (Sao Paulo) e ALCANCA a Bybit, entao o coletor chama esta funcao
// e ela repassa os tickers de opcoes (campos enxutos). Usado para montar o gamma de
// ativos sem opcoes na Deribit (ex.: SOL).
//
// Repassa apenas dados PUBLICOS de mercado. verify_jwt=false; o gateway ainda exige
// o header apikey (o coletor envia a service key). Deploy: supabase functions deploy bybit-relay
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const coin = (url.searchParams.get("coin") || "SOL").toUpperCase().replace(/[^A-Z]/g, "");
  try {
    const r = await fetch(
      `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${coin}`,
      { headers: { "User-Agent": "cm-relay/1.0" } },
    );
    const j = await r.json();
    // So os campos que o motor de gamma usa: simbolo (strike/tipo/exp), IV, OI, underlying.
    const list = ((j?.result?.list as Record<string, string>[]) ?? []).map((x) => ({
      s: x.symbol,
      iv: x.markIv,
      oi: x.openInterest,
      u: x.underlyingPrice,
    }));
    return json(r.ok ? 200 : 502, { coin, status: r.status, count: list.length, list });
  } catch (e) {
    return json(502, { coin, error: String(e) });
  }
});
