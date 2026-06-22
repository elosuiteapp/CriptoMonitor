// Edge Function: b3-analysis (análise POR ATIVO da B3 — ação ou FII — via Gemini)
// Recebe o contexto já montado pelo front (cotação, fundamentos, dividendos, macro,
// técnico/SMC) e gera uma análise do ativo selecionado. Grava em b3_asset_reports.
// Módulo B3 = admin-only. Deploy: --no-verify-jwt. Secrets: GEMINI_API_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

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
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096, temperature: 0.6 };
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

  // Admin autenticado (módulo B3 é restrito ao admin).
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "Módulo B3 é restrito ao admin." });

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

  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) return json(502, { error: `Falha ao gerar análise (gemini ${aiResp.status})` });

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!content) return json(502, { error: "resposta vazia da IA" });

  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  await admin.from("b3_asset_reports").insert({ asset, kind, content, model: usedModel, input_tokens: inTok, output_tokens: outTok });
  return json(200, { content, model_used: usedModel });
});
