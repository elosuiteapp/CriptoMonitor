// Edge Function: crypto-onchain
// On-chain (valuation/ciclo) + maré de stablecoins + saúde da rede BTC — fontes GRÁTIS e SEM
// chave: bitcoin-data.com/bgeometrics (MVRV-Z, SOPR, NUPL, Puell, realized price), DefiLlama
// (oferta de stablecoins), mempool.space (hashrate/taxas). Market-wide (BTC), atualiza ~diário.
// ⚠️ bitcoin-data.com FREE = 10 req/HORA → servimos de um CACHE (tabela crypto_onchain) e só
// re-buscamos a fonte a cada ~6h; se a fonte limitar, devolvemos o último dado bom. Educacional.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" } });
}
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const N = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

async function bd(slug: string): Promise<number | null> {
  try {
    const r = await fetch(`https://bitcoin-data.com/v1/${slug}/last`, { headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json() as Record<string, unknown>;
    const k = Object.keys(j).find((x) => x !== "d" && x !== "unixTs");
    return k ? N(j[k]) : null;
  } catch { return null; }
}

async function buildPayload() {
  const [mvrvZ, sopr, nupl, puell, realized, reserveRisk] = await Promise.all([
    bd("mvrv-zscore"), bd("sopr"), bd("nupl"), bd("puell-multiple"), bd("realized-price"), bd("reserve-risk"),
  ]);
  if (mvrvZ == null && sopr == null && nupl == null) return null; // fonte indisponível/limite

  let stableTotal: number | null = null, stable30dPct: number | null = null;
  try {
    const sc = await fetch("https://stablecoins.llama.fi/stablecoincharts/all").then((r) => r.json()) as { totalCirculatingUSD?: { peggedUSD?: number } }[];
    if (Array.isArray(sc) && sc.length) {
      const last = N(sc[sc.length - 1]?.totalCirculatingUSD?.peggedUSD);
      const ago = N(sc[sc.length - 31]?.totalCirculatingUSD?.peggedUSD);
      stableTotal = last;
      stable30dPct = last != null && ago ? ((last - ago) / ago) * 100 : null;
    }
  } catch { /* */ }

  let hashrate: number | null = null, feeFast: number | null = null, spot: number | null = null, diffChange: number | null = null, mempoolTx: number | null = null;
  try { const m = await fetch("https://mempool.space/api/v1/mining/hashrate/3d").then((r) => r.json()); hashrate = N(m?.currentHashrate); } catch { /* */ }
  try { const d = await fetch("https://mempool.space/api/v1/difficulty-adjustment").then((r) => r.json()); diffChange = N(d?.difficultyChange); } catch { /* */ }
  try { const mp = await fetch("https://mempool.space/api/mempool").then((r) => r.json()); mempoolTx = N(mp?.count); } catch { /* */ }
  try { const f = await fetch("https://mempool.space/api/v1/fees/recommended").then((r) => r.json()); feeFast = N(f?.fastestFee); } catch { /* */ }
  try { const p = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT").then((r) => r.json()); spot = N(p?.price); } catch { /* */ }

  const zMvrv = mvrvZ == null ? null : mvrvZ <= 0.1 ? "fundo histórico" : mvrvZ <= 1 ? "descontado" : mvrvZ <= 3 ? "neutro" : mvrvZ <= 5 ? "aquecido" : mvrvZ <= 7 ? "caro" : "euforia/topo";
  const zSopr = sopr == null ? null : sopr < 0.98 ? "vendas no prejuízo (capitulação)" : sopr <= 1.02 ? "equilíbrio" : "realização de lucro";
  const zNupl = nupl == null ? null : nupl < 0 ? "capitulação" : nupl < 0.25 ? "esperança/medo" : nupl < 0.5 ? "otimismo" : nupl < 0.75 ? "crença" : "euforia";
  const zPuell = puell == null ? null : puell < 0.5 ? "capitulação de mineradores (valor)" : puell < 2 ? "neutro" : puell < 4 ? "elevado" : "topo";
  const profit = spot != null && realized != null ? spot >= realized : null;

  const parts: number[] = [];
  if (mvrvZ != null) parts.push(clamp((mvrvZ / 8) * 100));
  if (nupl != null) parts.push(clamp(((nupl + 0.25) / 1.0) * 100));
  if (puell != null) parts.push(clamp((puell / 4) * 100));
  const cycleScore = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  const cycleLabel = cycleScore == null ? null : cycleScore < 20 ? "Fundo / descontado" : cycleScore < 40 ? "Barato" : cycleScore < 60 ? "Neutro" : cycleScore < 80 ? "Aquecido" : "Euforia / topo";
  const stableTide = stable30dPct == null ? null : stable30dPct > 1 ? "liquidez entrando" : stable30dPct < -1 ? "liquidez saindo" : "estável";

  return {
    onchain: { mvrvZ, sopr, nupl, puell, realized, reserveRisk, spot, profit, zones: { mvrvZ: zMvrv, sopr: zSopr, nupl: zNupl, puell: zPuell }, cycleScore, cycleLabel },
    liquidity: { stableTotal, stable30dPct, tide: stableTide },
    network: { hashrate, feeFast, diffChange, mempoolTx },
    ts: new Date().toISOString(),
  };
}

const FRESH_MS = 6 * 60 * 60 * 1000; // 6h

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("crypto_onchain").select("data, ts").eq("id", 1).maybeSingle();
    const age = row?.ts ? Date.now() - new Date(row.ts as string).getTime() : Infinity;

    // Cache fresco → serve sem tocar na fonte (respeita o limite de 10 req/h).
    if (row?.data && age < FRESH_MS) return json(200, { ...(row.data as Record<string, unknown>), cached: true });

    // Toca o ts ANTES de buscar (evita corrida de várias chamadas simultâneas re-buscando).
    if (row) await admin.from("crypto_onchain").update({ ts: new Date().toISOString() }).eq("id", 1);

    const payload = await buildPayload();
    if (!payload) {
      // Fonte limitada (10 req/h) → reprograma re-tentativa em ~30min (não trava 6h) e serve
      // o último dado bom, se houver.
      if (row) await admin.from("crypto_onchain").update({ ts: new Date(Date.now() - FRESH_MS + 30 * 60 * 1000).toISOString() }).eq("id", 1);
      if (row?.data) return json(200, { ...(row.data as Record<string, unknown>), cached: true, stale: true });
      return json(502, { error: "fonte indisponível" });
    }
    await admin.from("crypto_onchain").upsert({ id: 1, data: payload, ts: new Date().toISOString() });
    return json(200, payload);
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
