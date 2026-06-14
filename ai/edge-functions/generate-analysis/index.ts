// Edge Function: generate-analysis (PRD §6 — provedor: Google Gemini)
// Gera a análise narrativa de um ativo: valida plano + cota, lê o market_snapshot
// mais recente + a camada institucional (OI delta, paredes do book, macro &
// correlações), monta o prompt e chama a Gemini API com o modelo do plano.
//
// Deploy: supabase functions deploy generate-analysis · Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Você é o copiloto de IA do Crypto Monitor, um cockpit de decisões para traders de cripto.",
  "Idioma: português brasileiro claro com acentuação correta; ao usar termo técnico (funding, OI, GEX, gamma, CVD, max pain, skew, Put/Call), explique em poucas palavras.",
  "Estrutura obrigatória: 1) Contexto macro (inclua DXY/S&P/ouro e a correlação 30d quando houver — vento a favor/contra); 2) Fluxo (varejo via perps/CVD vs. instituição via spot/divergência; use o DELTA DE OI vs. preço para ler novas posições); 3) Níveis de liquidez e opções (Call/Put Wall, Zero Gamma, Max Pain e as PAREDES DO ORDER BOOK como ímãs/suporte-resistência, citando os preços); 4) Sentimento (Fear & Greed + sentimento de opções: Put/Call, IV e skew); 5) Síntese.",
  "Proibido: recomendar compra/venda, prever preço-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere').",
  "Obrigatório: usar apenas os dados fornecidos; se uma métrica vier ausente, diga que está indisponível neste ciclo e nunca invente números.",
  "Encerre sempre com um aviso de que a análise é informativa e educacional, não constitui recomendação de compra/venda nem aconselhamento financeiro, e a decisão é sempre do usuário.",
].join("\n");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function dedupeBy<T extends Record<string, unknown>>(rows: T[], key: string): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const r of rows) {
    if (!seen.has(r[key])) {
      seen.add(r[key]);
      out.push(r);
    }
  }
  return out;
}

async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096, temperature: 0.7 };
  if (model.includes("flash")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig,
      }),
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_KEY) return json(500, { error: "GEMINI_API_KEY não configurada" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });

  const { asset } = await req.json().catch(() => ({ asset: "BTC" }));
  const ativo = String(asset || "BTC").toUpperCase();

  const { data: sub } = await admin
    .from("subscriptions").select("plan:plans(*)")
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  let plan = (sub?.plan as Record<string, unknown> | undefined) ?? undefined;
  if (!plan) {
    const { data: free } = await admin.from("plans").select("*").eq("slug", "free").single();
    plan = free ?? undefined;
  }
  if (!plan) return json(500, { error: "plano não encontrado" });

  const assets = (plan.assets as string[]) ?? ["BTC"];
  if (!assets.includes(ativo)) {
    return json(403, { error: `O ativo ${ativo} não está disponível no seu plano.` });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("usage_log").select("count")
    .eq("user_id", user.id).eq("action", "ai_analysis").eq("day", today).maybeSingle();
  const used = (usage?.count as number) ?? 0;
  const limit = plan.ai_daily_limit as number | null;
  if (limit !== null && used >= limit) {
    return json(429, { error: `Cota diária atingida (${limit} análises). Volte amanhã ou faça upgrade.` });
  }

  const { data: snap } = await admin
    .from("market_snapshot").select("id, payload, ts")
    .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle();
  if (!snap) {
    return json(503, { error: "Sem dados de mercado para este ativo ainda. Aguarde o próximo ciclo." });
  }

  // ── Camada institucional (Fase 6) — só para planos avançados ──────────────
  const advanced = (plan.advanced_metrics as boolean) ?? false;
  const since15 = new Date(Date.now() - 15 * 60000).toISOString();
  const institutional: Record<string, unknown> = {};
  if (advanced) {
    const [{ data: oi }, { data: walls }, { data: macroAssets }, { data: macroCorr }] = await Promise.all([
      admin.from("v_oi_delta").select("oi_delta_4h, oi_delta_24h, price_delta_4h").eq("asset", ativo).maybeSingle(),
      admin.from("orderbook_walls").select("exchange, side, price, notional_usd").eq("asset", ativo)
        .gte("ts", since15).order("notional_usd", { ascending: false }).limit(8),
      admin.from("macro_assets").select("symbol, name, price, change_24h, change_7d").order("ts", { ascending: false }).limit(16),
      admin.from("macro_correlations").select("macro_symbol, corr_30d").eq("asset", ativo).order("ts", { ascending: false }).limit(12),
    ]);
    institutional.oi_delta = oi ?? null;
    institutional.order_book_walls = walls ?? [];
    institutional.macro = dedupeBy((macroAssets as Record<string, unknown>[]) ?? [], "symbol");
    institutional.macro_correlations = dedupeBy((macroCorr as Record<string, unknown>[]) ?? [], "macro_symbol");
  }

  // ── Notícias recentes ─────────────────────────────────────────────────────
  const { data: news } = await admin
    .from("news_feed").select("title, source").contains("assets", [ativo])
    .order("published_at", { ascending: false }).limit(5);
  const newsText = (news && news.length)
    ? news.map((n) => `- ${n.title} (${n.source ?? "?"})`).join("\n")
    : "Nenhuma notícia recente disponível.";

  const userMsg = [
    `Analise o momento de mercado do ativo ${ativo} com base nos dados abaixo.`,
    `Siga a estrutura: macro → fluxo → níveis de liquidez/opções → sentimento → síntese.`,
    "",
    "Snapshot consolidado (JSON):",
    JSON.stringify(snap.payload),
    "",
    "Camada institucional adicional (OI delta, paredes do book, macro & correlações):",
    JSON.stringify(institutional),
    "",
    "Notícias recentes:",
    newsText,
  ].join("\n");

  let usedModel = (plan.ai_model as string) ?? FALLBACK_MODEL;
  let aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    const detail = await aiResp.text();
    console.error(`modelo ${usedModel} falhou (${aiResp.status}): ${detail.slice(0, 200)} — fallback ${FALLBACK_MODEL}`);
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) {
    const detail = await aiResp.text();
    console.error(`Gemini falhou (${aiResp.status}): ${detail.slice(0, 300)}`);
    return json(502, { error: "Falha ao gerar análise", detail: detail.slice(0, 300) });
  }

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!content) return json(502, { error: "Resposta vazia do modelo" });

  await admin.from("ai_analysis").insert({
    user_id: user.id, asset: ativo, model_used: usedModel, content, snapshot_ref: snap.id,
  });
  await admin.from("usage_log").upsert(
    { user_id: user.id, action: "ai_analysis", day: today, count: used + 1 },
    { onConflict: "user_id,action,day" },
  );

  return json(200, { content, model_used: usedModel, used: used + 1, limit });
});
