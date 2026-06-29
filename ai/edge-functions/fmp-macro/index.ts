// Edge Function: fmp-macro — painel macro dos EUA via Financial Modeling Prep (FMP).
// Curva de juros do Tesouro + indicadores (inflação CPI YoY, desemprego, Fed funds, PIB).
// Dado market-wide (o dólar/Fed move TODOS os mercados) → vive na aba Macro de cada módulo.
// Chave FMP fica no servidor (secret FMP_API_KEY), NUNCA no front. Deploy: verify_jwt true.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const B = "https://financialmodelingprep.com/stable";

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const key = Deno.env.get("FMP_API_KEY");
  if (!key) return out({ error: "FMP_API_KEY não configurada" }, 500);

  const getJson = async (ep: string): Promise<unknown[]> => {
    try {
      const sep = ep.includes("?") ? "&" : "?";
      const r = await fetch(`${B}/${ep}${sep}apikey=${key}`);
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  };

  try {
    // Janela p/ a curva de juros (pega a linha mais recente).
    const today = new Date();
    const from = new Date(today.getTime() - 12 * 86400_000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);
    const cpiFrom = new Date(today.getFullYear(), today.getMonth() - 14, 1).toISOString().slice(0, 10); // p/ YoY (13+ meses)

    const [tr, cpi, unemp, ff, gdp] = await Promise.all([
      getJson(`treasury-rates?from=${from}&to=${to}`),
      getJson(`economic-indicators?name=CPI&from=${cpiFrom}&to=${to}`),
      getJson(`economic-indicators?name=unemploymentRate`),
      getJson(`economic-indicators?name=federalFunds`),
      getJson(`economic-indicators?name=GDP`),
    ]);

    const latest = (arr: unknown[]) => (arr[0] ?? null) as Record<string, unknown> | null;
    const trRow = latest(tr);
    const yieldCurve = trRow
      ? {
          date: String(trRow.date ?? "").slice(0, 10),
          m1: num(trRow.month1), m3: num(trRow.month3), m6: num(trRow.month6),
          y1: num(trRow.year1), y2: num(trRow.year2), y3: num(trRow.year3),
          y5: num(trRow.year5), y7: num(trRow.year7), y10: num(trRow.year10),
        }
      : null;
    // 2s10s (steepness): >0 normal, <0 invertida (alerta de recessão).
    const spread2s10s = yieldCurve && yieldCurve.y10 != null && yieldCurve.y2 != null ? Number((yieldCurve.y10 - yieldCurve.y2).toFixed(2)) : null;

    // CPI YoY = índice atual vs ~12 meses atrás (a série é mensal, mais recente primeiro).
    const cpiArr = cpi as Record<string, unknown>[];
    const cpiNow = num(cpiArr[0]?.value);
    const cpiYrAgo = num(cpiArr[12]?.value);
    const cpiYoY = cpiNow != null && cpiYrAgo != null && cpiYrAgo !== 0 ? Number((((cpiNow - cpiYrAgo) / cpiYrAgo) * 100).toFixed(2)) : null;

    const indicators = {
      cpiYoY,
      cpiDate: String(cpiArr[0]?.date ?? "").slice(0, 10),
      unemployment: num((latest(unemp) ?? {}).value),
      fedFunds: num((latest(ff) ?? {}).value),
      gdp: num((latest(gdp) ?? {}).value),
    };

    return out({ yieldCurve, spread2s10s, indicators });
  } catch (e) {
    return out({ error: String(e) }, 500);
  }
});
