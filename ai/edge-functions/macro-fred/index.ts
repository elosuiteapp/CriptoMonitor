// Edge Function: macro-fred (Maré de liquidez macro — FRED)
// Busca as séries do FRED, calcula a LIQUIDEZ LÍQUIDA do Fed (net liquidity =
// WALCL − Reverse Repo − TGA) + variação 30d, e guarda em macro_global junto com
// juros reais, HY spread, NFCI, curva 2s10s e M2. Cron diário. Chave no app_secrets.
// Auth: x-dispatch-secret == DISPATCH_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const SERIES = ["WALCL", "RRPONTSYD", "WTREGEN", "DFII10", "BAMLH0A0HYM2", "NFCI", "T10Y2Y", "WM2NS"];

interface Obs { date: string; value: number; }
async function fred(id: string, key: string): Promise<Obs[]> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=60`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`FRED ${id} ${r.status}`);
  const j = (await r.json()) as { observations?: Array<{ date: string; value: string }> };
  return (j.observations ?? [])
    .map((o) => ({ date: o.date, value: o.value === "." ? NaN : Number(o.value) }))
    .filter((o) => Number.isFinite(o.value));
}
const latest = (obs: Obs[]): number | null => (obs.length ? obs[0].value : null);
function val30(obs: Obs[]): number | null {
  if (!obs.length) return null;
  const cutoff = new Date(obs[0].date).getTime() - 30 * 86400000;
  const m = obs.find((o) => new Date(o.date).getTime() <= cutoff);
  return (m ?? obs[obs.length - 1]).value;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (secret && req.headers.get("x-dispatch-secret") !== secret) return new Response("forbidden", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: kr } = await admin.from("app_secrets").select("value").eq("key", "fred_api_key").maybeSingle();
  const key = kr?.value as string | undefined;
  if (!key) return new Response(JSON.stringify({ error: "fred_api_key ausente em app_secrets" }), { status: 200 });

  try {
    const [walcl, rrp, tga, dfii10, hy, nfci, curve, m2] = await Promise.all(SERIES.map((s) => fred(s, key)));
    const lw = latest(walcl);
    const lr = latest(rrp);
    const lt = latest(tga);
    // net liquidity em BILHÕES USD. WALCL e TGA vêm em MILHÕES → /1000; RRP em bilhões.
    const nlNow = lw != null && lr != null && lt != null ? lw / 1000 - lr - lt / 1000 : null;
    const w30 = val30(walcl);
    const r30 = val30(rrp);
    const t30 = val30(tga);
    const nl30 = w30 != null && r30 != null && t30 != null ? w30 / 1000 - r30 - t30 / 1000 : null;
    const nlChg = nlNow != null && nl30 != null && nl30 !== 0 ? ((nlNow - nl30) / nl30) * 100 : null;

    await admin.from("macro_global").insert({
      net_liquidity_busd: nlNow != null ? Math.round(nlNow) : null,
      nl_chg_30d_pct: nlChg != null ? Number(nlChg.toFixed(3)) : null,
      walcl: lw,
      rrp: lr,
      tga: lt,
      real_yield_10y: latest(dfii10),
      hy_spread: latest(hy),
      nfci: latest(nfci),
      yield_curve: latest(curve),
      m2: latest(m2),
    });

    return new Response(
      JSON.stringify(
        {
          net_liquidity_busd: nlNow != null ? Math.round(nlNow) : null,
          nl_chg_30d_pct: nlChg,
          raw: { walcl: lw, rrp: lr, tga: lt, dfii10: latest(dfii10), hy: latest(hy), nfci: latest(nfci), curve: latest(curve), m2: latest(m2) },
        },
        null,
        2,
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 200 });
  }
});
