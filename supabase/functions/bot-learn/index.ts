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
// Só sinais que o bot-run AINDA emite (computeReading). Chaves antigas presentes em logs velhos
// (tf_30m/tf_1H/tf_4H/tf_1D, stables, ETF, prêmio Coinbase, magnet/barrier…) são de sinais
// REMOVIDOS do robô — ficam fora do aprendizado e do painel, em todas as moedas.
const LIVE_KEYS = new Set(["tf_15m", "book_inst", "book_retail", "absorb", "walls", "book_trend", "fvg", "funding", "ls_ratio", "feargreed", "swing", "bos", "ob", "sweep", "cvd", "cvd_div", "liqs", "gamma", "gflow", "vwap", "adx", "ema2050"]);

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

    // 3) Rotula com o retorno ~1h e acumula acerto por sinal (GLOBAL + POR MOEDA) + geral + por ativo.
    type Acc = { label: string; weight: number; n: number; hits: number };
    const perSig: Record<string, Acc> = {};
    const perSigByAsset: Record<string, Record<string, Acc>> = {};
    let ovN = 0, ovHits = 0;
    const assetStats: Record<string, { n: number; hits: number }> = {};
    let labeledTotal = 0;

    for (const asset in byAsset) {
      const arr = byAsset[asset].sort((a, b) => a.tsMs - b.tsMs);
      assetStats[asset] = { n: 0, hits: 0 };
      const pa = (perSigByAsset[asset] ??= {});
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
        // por sinal (acumula no global e no da moeda)
        for (const s of arr[i].signals) {
          const sc = Number(s.score);
          if (!Number.isFinite(sc) || Math.abs(sc) < SIG_MIN) continue;
          const k = String(s.key);
          if (!LIVE_KEYS.has(k)) continue;
          const hit = sign(sc) === moveDir ? 1 : 0;
          const e = (perSig[k] ??= { label: String(s.label ?? k), weight: Number(s.weight ?? 0), n: 0, hits: 0 });
          e.n++; e.hits += hit;
          const ea = (pa[k] ??= { label: String(s.label ?? k), weight: Number(s.weight ?? 0), n: 0, hits: 0 });
          ea.n++; ea.hits += hit;
        }
      }
    }

    const buildPerSignal = (m: Record<string, Acc>, minN: number) =>
      Object.entries(m)
        .map(([key, v]) => ({ key, label: v.label, weight: v.weight, n: v.n, hitRate: v.n ? Math.round((v.hits / v.n) * 100) : 0, edge: v.n ? Math.round((v.hits / v.n - 0.5) * 100) : 0 }))
        .filter((s) => s.n >= minN)
        .sort((a, b) => b.n - a.n);

    const perSignal = buildPerSignal(perSig, 5);
    const overallHitRate = ovN ? Math.round((ovHits / ovN) * 100) : 0;
    // Por moeda: acerto geral + acerto por sinal daquela moeda (minN menor, amostra é menor).
    const byAssetOut: Record<string, { n: number; hitRate: number; perSignal: ReturnType<typeof buildPerSignal>; ai_report: string | null }> = {};
    for (const [a, v] of Object.entries(assetStats)) {
      if (v.n < 3) continue;
      byAssetOut[a] = { n: v.n, hitRate: Math.round((v.hits / v.n) * 100), perSignal: buildPerSignal(perSigByAsset[a] ?? {}, 3), ai_report: null };
    }

    const summary = { window: "~1h", labeled: labeledTotal, overall: { n: ovN, hitRate: overallHitRate }, byAsset: byAssetOut, perSignal };

    // 4) Diagnóstico da IA — GERAL + um por MOEDA (com amostra suficiente).
    let aiReport: string | null = null;
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey && labeledTotal >= 10) {
      const systemBase = "Você é um analista quant avaliando um robô de trade DEMO (educacional). Recebe a taxa de acerto direcional (~1h) de cada SINAL da leitura do robô. hitRate>55% = preditivo; ~50% = ruído; <45% = contrário (erra mais do que acerta). Responda em PORTUGUÊS, curto e direto, em markdown. NÃO invente números além dos fornecidos.";
      // Geral
      if (perSignal.length > 0) {
        const system = systemBase + " Estrutura: **Como está indo** (1-2 frases sobre o acerto geral), **Sinais que ajudam** (os preditivos), **Sinais que atrapalham** (ruído ou contrários — inclua o peso atual deles), **Ajustes sugeridos** (2-4 bullets concretos). Seja honesto sobre amostra pequena.";
        const perAssetHit = Object.fromEntries(Object.entries(byAssetOut).map(([a, v]) => [a, { n: v.n, hitRate: v.hitRate }]));
        const user = `Avalie o robô no GERAL (todas as moedas, janela ${summary.window}, ${labeledTotal} leituras, acerto do viés ${overallHitRate}% em ${ovN} amostras):\n\n${JSON.stringify({ overall: summary.overall, byAsset: perAssetHit, perSignal }, null, 1)}`;
        aiReport = await callGemini(geminiKey, system, user).catch(() => null);
      }
      // Por moeda: só ativos com amostra decente (>=8) e sinais medidos → diagnóstico focado.
      const assetsForAi = Object.entries(byAssetOut).filter(([, v]) => v.n >= 8 && v.perSignal.length > 0);
      const systemAsset = systemBase + " Foque SÓ nesta moeda. Estrutura curta: **{MOEDA}** (1 frase sobre o acerto dela), **Ajuda nessa moeda** (1-3 sinais preditivos), **Atrapalha** (1-3 ruidosos/contrários). No máximo ~6 linhas.";
      const reports = await Promise.all(assetsForAi.map(([a, v]) =>
        callGemini(geminiKey, systemAsset.replace("{MOEDA}", a), `Moeda ${a} (janela ${summary.window}): acerto do viés ${v.hitRate}% em ${v.n} amostras. Acerto por sinal:\n\n${JSON.stringify(v.perSignal, null, 1)}`).catch(() => null)
      ));
      assetsForAi.forEach(([a], i) => { if (byAssetOut[a]) byAssetOut[a].ai_report = reports[i]; });
    }

    await admin.from("bot_learning").upsert({ id: 1, data: summary, ai_report: aiReport, updated_at: new Date().toISOString() }, { onConflict: "id" });
    return json(200, { ok: true, ...summary, aiReport });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
