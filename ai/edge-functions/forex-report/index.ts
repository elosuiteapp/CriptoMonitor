// Edge Function: forex-report — Relatório por IA (Google Gemini) de um par de câmbio.
// O FRONT envia { pair, context } onde context é o resumo já calculado (tendência,
// carry, COT institucional×varejo, dólar/DXY, apetite a risco, níveis, agenda). A
// função só orquestra o Gemini (mantém a chave no servidor), valida admin e grava
// custo em ai_analysis. Módulo Forex é preview admin → relatório também é admin-only.
// Deploy: supabase functions deploy forex-report (verify_jwt true). Secret: GEMINI_API_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Você é um analista de câmbio (Forex) experiente, escrevendo em PORTUGUÊS claro do Brasil para um trader.",
  "Recebe um RESUMO com dados REAIS já calculados do par (não invente números; use só o que vier).",
  "Sua tarefa: sintetizar tudo numa LEITURA do que o par está tentando fazer agora — juntando as fontes (tendência, estrutura, momento, dólar/DXY, carry/juros, posicionamento COT institucional × varejo, apetite a risco) e destacando CONFLUÊNCIAS e DIVERGÊNCIAS.",
  "Estrutura da resposta (markdown, conciso):",
  "1. **Leitura geral** (2-3 frases): viés e convicção, e o porquê.",
  "2. **O que está alinhado** e **o que diverge** (bullets curtos).",
  "3. **Cenários** (alta × baixa): o que precisa acontecer p/ cada um, com os níveis fornecidos.",
  "4. **De olho na agenda**: eventos econômicos que podem mexer no par.",
  "Regras: linguagem simples (evite jargão em inglês desnecessário; explique COT, carry etc. em poucas palavras se citar). Seja honesto sobre incerteza. NÃO é recomendação de investimento — encerre lembrando que é educacional.",
].join("\n");

async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 8192, temperature: 0.6 };
  if (model.includes("flash")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    // Cliente com o JWT do usuário p/ validar admin (is_admin é SECURITY DEFINER).
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: isAdmin, error: adminErr } = await asUser.rpc("is_admin");
    if (adminErr || !isAdmin) return json(403, { error: "Acesso restrito (admin)." });

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json(500, { error: "GEMINI_API_KEY não configurada" });

    const { pair, context } = (await req.json().catch(() => ({}))) as { pair?: string; context?: string };
    if (!pair || !context) return json(400, { error: "pair e context são obrigatórios" });

    const userMsg = `Par: ${pair}\n\nRESUMO (dados reais):\n${context}`;

    let content = "";
    let usedModel = "";
    let aiData: Record<string, unknown> = {};
    let lastErr = "";
    for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
      usedModel = model;
      const aiResp = await callGemini(model, geminiKey, SYSTEM_PROMPT, userMsg);
      if (!aiResp.ok) {
        lastErr = `gemini ${aiResp.status}`;
        continue;
      }
      aiData = await aiResp.json();
      // deno-lint-ignore no-explicit-any
      const parts = (aiData as any).candidates?.[0]?.content?.parts ?? [];
      content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
      if (content) break;
    }
    if (!content) return json(502, { error: lastErr || "resposta vazia da IA" });

    // Grava custo em ai_analysis (rastreio no /admin). Não bloqueia a resposta.
    try {
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const um = ((aiData as Record<string, unknown>).usageMetadata ?? {}) as Record<string, number>;
      const inTok = Number(um.promptTokenCount ?? 0);
      const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
      const price = usedModel.includes("pro") ? { in: 1.25, out: 10 } : { in: 0.3, out: 2.5 };
      await admin.from("ai_analysis").insert({
        user_id: null, asset: pair, model_used: usedModel, content,
        report_type: "forex", auto_generated: false,
        input_tokens: inTok, output_tokens: outTok, cost_usd_micros: Math.round(inTok * price.in + outTok * price.out),
      });
    } catch {
      /* rastreio é best-effort */
    }

    return json(200, { content, model_used: usedModel, pair });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
