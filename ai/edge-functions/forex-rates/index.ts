// Edge Function: forex-rates
// Juros REAIS por moeda p/ o carry do FX — fontes GRÁTIS:
//   FRED (St. Louis Fed): juros de 10 anos do governo por país (IRLTLT01, mensal, corrente)
//     + policy rate live de US (DFEDTARU) e EUR (ECBDFR); BCB SGS 432 = Selic (BRL).
// O diferencial de juros de 10 anos reflete a EXPECTATIVA de juros (motor do carry), melhor
// que a taxa básica estática. Proxy server-side: usa a chave FRED do app_secrets (nunca no
// front), consolida e cacheia. Market-wide. Educacional — não é recomendação.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });
}
const FREDB = "https://api.stlouisfed.org/fred/series/observations";
async function fred(id: string, key: string): Promise<number | null> {
  try {
    const r = await fetch(`${FREDB}?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=1`);
    if (!r.ok) return null;
    const j = await r.json();
    const v = Number(j?.observations?.[0]?.value);
    return Number.isFinite(v) ? v : null;
  } catch { return null; }
}

// Juros de 10 anos do governo (OECD via FRED) — EUR usa Alemanha (bund) como referência.
const Y: Record<string, string> = {
  USD: "IRLTLT01USM156N", EUR: "IRLTLT01DEM156N", JPY: "IRLTLT01JPM156N", GBP: "IRLTLT01GBM156N",
  CHF: "IRLTLT01CHM156N", CAD: "IRLTLT01CAM156N", AUD: "IRLTLT01AUM156N", NZD: "IRLTLT01NZM156N",
};
// Taxa básica de fallback (atualizada jun/2026) — sobrescrita por dado live quando houver.
const POLICY_STATIC: Record<string, number> = { USD: 3.75, EUR: 2.25, JPY: 0.5, GBP: 4.0, CHF: 0.25, CAD: 2.75, AUD: 3.85, NZD: 3.0, BRL: 15.0 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sec } = await admin.from("app_secrets").select("value").eq("key", "fred_api_key").maybeSingle();
    const key = (sec as { value?: string } | null)?.value ?? "";
    if (!key) return json(400, { error: "sem fred_api_key" });

    const yEntries = await Promise.all(Object.entries(Y).map(async ([ccy, id]) => [ccy, await fred(id, key)] as [string, number | null]));
    const yields = Object.fromEntries(yEntries) as Record<string, number | null>;

    const [usP, euP] = await Promise.all([fred("DFEDTARU", key), fred("ECBDFR", key)]);
    let brl = POLICY_STATIC.BRL;
    try { const b = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json").then((r) => r.json()); const v = Number(b?.[0]?.valor); if (Number.isFinite(v)) brl = v; } catch { /* */ }

    const policy = { ...POLICY_STATIC, USD: usP ?? POLICY_STATIC.USD, EUR: euP ?? POLICY_STATIC.EUR, BRL: brl };
    return json(200, { policy, yields, source: "FRED (10y gov) + BCB (Selic)", ts: new Date().toISOString() });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
