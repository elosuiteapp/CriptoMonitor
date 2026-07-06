// Edge Function: b3-analysis (análise POR ATIVO da B3 — ação ou FII — via Gemini)
// Recebe o contexto já montado pelo front (cotação, fundamentos, dividendos, macro,
// técnico/SMC) e gera uma análise do ativo selecionado. Grava em b3_asset_reports.
// Acesso: admin OU plano com módulo 'b3' (mod_b3/complete), com cota ai_daily_limit —
// era admin-only e o assinante tomava 403 no botão que a UI libera (auditoria 02/jul).
// Deploy: --no-verify-jwt. Secrets: GEMINI_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";
import { geminiPrice } from "../_shared/aiPricing.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Você gera uma análise POR ATIVO da bolsa brasileira (B3) para o OrbeView — pode ser uma AÇÃO ou um FUNDO IMOBILIÁRIO (FII).",
  "Responda SEMPRE em português brasileiro, com acentuação correta. Explique termos técnicos em poucas palavras.",
  "Use APENAS os dados fornecidos no contexto; se algo faltar, diga que está indisponível e NUNCA invente números.",
  "Adapte os fundamentos ao tipo do ativo:",
  "- AÇÃO: foque em P/L, P/VP, ROE, ROIC, margens, dívida líquida/patrimônio, crescimento.",
  "- FII: foque em P/VP, Dividend Yield, FFO Yield, Cap Rate, vacância, segmento e quantidade de imóveis.",
  "Produza markdown com EXATAMENTE estas seções (use os títulos):",
  "## 1. Resumo — o que é o ativo, preço/cota atual e variação (dia/semana/mês).",
  "## 2. Fundamentos — leitura do valuation e da qualidade (adaptado a ação ou FII, conforme acima).",
  "## 3. Dividendos & renda — Dividend Yield, quanto pagou em 12 meses e os meses em que costuma pagar.",
  "## 4. Técnico & estrutura — tendência (médias), momento (RSI) e a estrutura Smart Money (viés, zona premium/discount, níveis-chave).",
  "## 5. Macro & contexto — Selic, IPCA, dólar e cenário; como o pano de fundo afeta este ativo/seu setor (para FII, destaque o efeito dos juros).",
  "## 6. Cenários — base e alternativo, NARRATIVO e NÃO direcional (ex.: 'se sustentar X o tom segue; se perder Y tende a enfraquecer'). Sem alvo de preço.",
  "## 7. Aviso — informativo/educacional, não é recomendação de compra/venda; a decisão é sempre do usuário.",
  "Proibido: recomendar compra/venda, prever preço-alvo, usar linguagem de certeza (prefira 'tende a', 'sugere').",
].join("\n");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  // 8192: o 2.5-pro gasta orçamento "pensando" e com 4096 devolvia 200 com parts vazio
  // (finishReason=MAX_TOKENS) — mesmo fix do b3-report (auditoria 02/jul).
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 8192, temperature: 0.6 };
  if (model.includes("flash")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não permitido" });

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey);
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json(500, { error: "GEMINI_API_KEY não configurada" });

  // Autenticado + entitlement: admin OU plano com módulo 'b3'; não-admin respeita a
  // cota diária de IA do plano (mesmo pool usage_log/ai_analysis do módulo cripto).
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = prof?.role === "admin";
  const today = new Date().toISOString().slice(0, 10);
  let limit: number | null = null;
  let used = 0;
  if (!isAdmin) {
    const { data: sub } = await admin
      .from("subscriptions").select("plan:plans(modules, ai_daily_limit)")
      .eq("user_id", user.id).eq("status", "active").maybeSingle();
    const plan = (sub?.plan ?? null) as { modules?: string[]; ai_daily_limit?: number | null } | null;
    if (!plan?.modules?.includes("b3")) return json(403, { error: "A análise por IA do módulo B3 não está incluída no seu plano." });
    limit = plan.ai_daily_limit ?? null;
    const { data: usage } = await admin
      .from("usage_log").select("count")
      .eq("user_id", user.id).eq("action", "ai_analysis").eq("day", today).maybeSingle();
    used = (usage?.count as number) ?? 0;
    if (limit !== null && used >= limit) return json(429, { error: `Cota diária atingida (${limit} análises). Volte amanhã ou faça upgrade.` });
  }

  const body = await req.json().catch(() => ({}));
  const asset = String(body.asset ?? "").toUpperCase();
  const kind = body.kind === "fii" ? "fii" : "stock";
  const context = body.context ?? {};
  if (!asset) return json(400, { error: "ativo não informado" });

  const userMsg = [
    `Gere a análise do ativo ${asset} (tipo: ${kind === "fii" ? "FUNDO IMOBILIÁRIO (FII)" : "AÇÃO"}).`,
    "Contexto (use apenas estes dados):",
    JSON.stringify(context),
  ].join("\n");

  // Gera com fallback pro flash também quando o texto vem VAZIO (não só erro HTTP) —
  // o pro devolve 200 com parts vazio quando estoura o orçamento (auditoria 02/jul).
  const extract = (d: Record<string, unknown>) => {
    const parts = (d as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("").trim();
  };
  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  let aiData = aiResp.ok ? await aiResp.json() : {};
  let content = aiResp.ok ? extract(aiData) : "";
  if (!content && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
    aiData = aiResp.ok ? await aiResp.json() : {};
    content = aiResp.ok ? extract(aiData) : "";
  }
  if (!content) return json(502, { error: aiResp.ok ? "resposta vazia da IA" : `Falha ao gerar análise (gemini ${aiResp.status})` });

  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  await admin.from("b3_asset_reports").insert({ asset, kind, content, model: usedModel, input_tokens: inTok, output_tokens: outTok });
  // Contabilidade unificada de custo (mesma tabela/preço do módulo cripto) + cota do usuário.
  const price = geminiPrice(usedModel); // fonte única: _shared/aiPricing.ts
  await admin.from("ai_analysis").insert({
    user_id: user.id, asset, model_used: usedModel, content, report_type: "b3_asset", auto_generated: false,
    input_tokens: inTok, output_tokens: outTok, cost_usd_micros: Math.round(inTok * price.in + outTok * price.out),
  });
  if (!isAdmin) {
    await admin.from("usage_log").upsert(
      { user_id: user.id, action: "ai_analysis", day: today, count: used + 1 },
      { onConflict: "user_id,action,day" },
    );
  }
  return json(200, { content, model_used: usedModel, used: isAdmin ? undefined : used + 1, limit });
});
