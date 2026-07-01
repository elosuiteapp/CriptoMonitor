// Edge Function: bot-learn — CÉREBRO QUE APRENDE (uso pessoal/admin).
// Rotula cada leitura logada (bot_logs.detail) com o RETORNO ~1h seguinte do mesmo ativo
// (usando a própria sequência de leituras — não precisa de fonte externa), mede o ACERTO
// direcional POR SINAL (quantas vezes a direção do sinal casou com o movimento) e pede um
// DIAGNÓSTICO à IA (Gemini) com sugestões de ajuste. Grava em bot_learning (id=1).
// Auth: admin (JWT profiles.role='admin') OU x-cron-key. Deploy: --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const FWD_MIN_MS = 55 * 60_000;   // janela mínima p/ o "futuro" (~1h)
const FWD_MAX_MS = 120 * 60_000;  // e máxima (evita casar com leitura muito distante)
const MIN_MOVE = 0.0005;          // ignora movimentos < 0,05% (ruído)
const SIG_MIN = 8;                // só conta sinal/viés com |score| >= 8 (foi uma opinião de fato)

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

async function callGemini(key: string, system: string, user: string): Promise<string | null> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.5, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  const parts = d?.candidates?.[0]?.content?.parts ?? [];
  const txt = parts.map((p: { text?: string }) => p?.text ?? "").join("").trim();
  return txt || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;

  let authorized = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && secrets["newsletter_cron_key"] && cronKey === secrets["newsletter_cron_key"]) authorized = true;
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const u = userData?.user;
    if (u) { const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle(); if (prof?.role === "admin") authorized = true; }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  try {
    // 1) Leituras logadas. ASC p/ processar a sequência de cada ativo (filtramos as que têm signals no código).
    const { data: rows } = await admin
      .from("bot_logs").select("detail, created_at")
      .order("created_at", { ascending: true }).limit(5000);
    const logs = (rows as { detail: any; created_at: string }[] | null) ?? [];

    // 2) Agrupa por ativo.
    type R = { tsMs: number; spot: number; bias: number; signals: { key: string; label: string; score: number; weight: number }[] };
    const byAsset: Record<string, R[]> = {};
    for (const row of logs) {
      const d = row.detail ?? {};
      const signals = Array.isArray(d.signals) ? d.signals : null;
      const spot = Number(d.spot), bias = Number(d.bias);
      if (!signals || !Number.isFinite(spot) || spot <= 0 || !Number.isFinite(bias)) continue;
      const asset = String(d.asset ?? "BTC");
      (byAsset[asset] ??= []).push({ tsMs: new Date(row.created_at).getTime(), spot, bias, signals });
    }

    // 3) Rotula com o retorno ~1h e acumula acerto por sinal + geral + por ativo.
    const perSig: Record<string, { label: string; weight: number; n: number; hits: number }> = {};
    let ovN = 0, ovHits = 0;
    const assetStats: Record<string, { n: number; hits: number }> = {};
    let labeledTotal = 0;

    for (const asset in byAsset) {
      const arr = byAsset[asset].sort((a, b) => a.tsMs - b.tsMs);
      assetStats[asset] = { n: 0, hits: 0 };
      for (let i = 0; i < arr.length; i++) {
        // acha a leitura ~1h à frente
        let fwd: number | null = null;
        for (let j = i + 1; j < arr.length; j++) {
          const dt = arr[j].tsMs - arr[i].tsMs;
          if (dt < FWD_MIN_MS) continue;
          if (dt > FWD_MAX_MS) break;
          fwd = (arr[j].spot - arr[i].spot) / arr[i].spot;
          break;
        }
        if (fwd == null || Math.abs(fwd) < MIN_MOVE) continue;
        const moveDir = sign(fwd);
        labeledTotal++;
        // geral (viés)
        if (Math.abs(arr[i].bias) >= SIG_MIN) { ovN++; assetStats[asset].n++; if (sign(arr[i].bias) === moveDir) { ovHits++; assetStats[asset].hits++; } }
        // por sinal
        for (const s of arr[i].signals) {
          const sc = Number(s.score);
          if (!Number.isFinite(sc) || Math.abs(sc) < SIG_MIN) continue;
          const k = String(s.key);
          const e = (perSig[k] ??= { label: String(s.label ?? k), weight: Number(s.weight ?? 0), n: 0, hits: 0 });
          e.n++;
          if (sign(sc) === moveDir) e.hits++;
        }
      }
    }

    const perSignal = Object.entries(perSig)
      .map(([key, v]) => ({ key, label: v.label, weight: v.weight, n: v.n, hitRate: v.n ? Math.round((v.hits / v.n) * 100) : 0, edge: v.n ? Math.round((v.hits / v.n - 0.5) * 100) : 0 }))
      .filter((s) => s.n >= 5)
      .sort((a, b) => b.n - a.n);
    const overallHitRate = ovN ? Math.round((ovHits / ovN) * 100) : 0;
    const byAssetOut = Object.fromEntries(Object.entries(assetStats).filter(([, v]) => v.n >= 3).map(([a, v]) => [a, { n: v.n, hitRate: Math.round((v.hits / v.n) * 100) }]));

    const summary = { window: "~1h", labeled: labeledTotal, overall: { n: ovN, hitRate: overallHitRate }, byAsset: byAssetOut, perSignal };

    // 4) Diagnóstico da IA (se houver amostra e chave).
    let aiReport: string | null = null;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey && perSignal.length > 0 && labeledTotal >= 10) {
      const system = "Você é um analista quant avaliando um robô de trade DEMO (educacional). Recebe a taxa de acerto direcional (~1h) de cada SINAL da leitura do robô, medida sobre o histórico. hitRate>55% = preditivo; ~50% = ruído/moeda ao ar; <45% = contrário (o sinal erra mais do que acerta). Responda em PORTUGUÊS, curto e direto, em markdown. Estrutura: **Como está indo** (1-2 frases sobre o acerto geral), **Sinais que ajudam** (os preditivos), **Sinais que atrapalham** (ruído ou contrários — inclua o peso atual deles), **Ajustes sugeridos** (2-4 bullets concretos: reduzir/aumentar peso de sinal X, etc.). Seja honesto sobre amostra pequena. NÃO invente números além dos fornecidos.";
      const user = `Avalie o robô com estes dados (janela ${summary.window}, ${labeledTotal} leituras rotuladas, acerto geral do viés ${overallHitRate}% em ${ovN} amostras):\n\n${JSON.stringify(summary, null, 1)}`;
      aiReport = await callGemini(geminiKey, system, user).catch(() => null);
    }

    await admin.from("bot_learning").upsert({ id: 1, data: summary, ai_report: aiReport, updated_at: new Date().toISOString() }, { onConflict: "id" });
    return json(200, { ok: true, ...summary, aiReport });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
