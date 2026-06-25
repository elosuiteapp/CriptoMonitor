// Edge Function: b3-report (Relatório Diário do pregão da B3 — Gemini)
// Gera o relatório do pregão (IBOV, dólar, macro BR, Focus, externo, ADRs) e grava
// em b3_reports. DOIS modos: CRON (x-dispatch-secret) e MANUAL (admin autenticado).
// Módulo B3 = admin-only. Deploy: --no-verify-jwt. Secrets: GEMINI_API_KEY, DISPATCH_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Você gera o Relatório Diário do pregão da B3 (bolsa brasileira) do OrbeView.",
  "Responda SEMPRE em português brasileiro com acentuação correta. Explique termos técnicos em poucas palavras.",
  "Produza em markdown com EXATAMENTE estas seções (use os títulos):",
  "## Síntese do dia — 2 a 3 frases de inteligência que CONECTAM o Termômetro de Medo & Ganância Brasil (índice 0-100 e os componentes que mais pesaram: amplitude, momento, faixa de 52 sem, volatilidade, câmbio, VIX) ao quadro do dia. É a leitura humana que amarra tudo num parágrafo — ex.: 'IBOV neutro: VIX confortável lá fora, mas amplitude fraca e o real pressionado pelo dólar segurando o índice.' Sem alvo de preço.",
  "## 1. Leitura do pregão — IBOV (nível e variação do dia), dólar, e as principais ALTAS e BAIXAS entre as ações.",
  "## 2. Macro Brasil — Selic e CDI (juros básicos), IPCA (inflação), IBC-Br (atividade econômica, com a variação do mês) e desemprego; mais as expectativas do Boletim Focus (IPCA/Selic/PIB/câmbio do ano).",
  "## 3. Cenário externo e commodities — S&P 500/Nasdaq e VIX, e as commodities que movem o IBOV: petróleo (Brent → PETR4/PRIO3) e metais (cobre como proxy de minério → VALE3 e siderúrgicas como CSNA3/GGBR4) e ouro. CONECTE o movimento da commodity à ação que ela tende a antecipar. Inclua as correlações do IBOV (com S&P, dólar, VIX etc.).",
  "## 4. Fluxo estrangeiro — leitura dos ADRs (prêmio/desconto vs ação local) como termômetro do capital externo (prêmio = demanda lá fora; desconto = saída).",
  "## 5. Destaques fundamentalistas — comente valuation (P/L, P/VP), qualidade (ROE) e as melhores pagadoras de dividendos (DY) entre as ações; cite 3 a 5 nomes que se destacam.",
  "## 6. Cenários — base e alternativo, NARRATIVO e NÃO direcional (ex.: 'se o IBOV sustentar X o tom segue; se perder Y tende a enfraquecer'). Sem alvo de preço.",
  "## 7. Aviso — informativo/educacional, não é recomendação de compra/venda nem aconselhamento; a decisão é sempre do usuário.",
  "Use APENAS os dados fornecidos; se algo faltar, diga que está indisponível e NUNCA invente números.",
  "Proibido: recomendar compra/venda, prever preço-alvo, usar linguagem de certeza (prefira 'tende a', 'sugere').",
].join("\n");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function b3data(url: string, key: string, mode: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${url}/functions/v1/b3-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ mode }),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
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

// deno-lint-ignore no-explicit-any
async function generateReport(admin: any, geminiKey: string, supaUrl: string, serviceKey: string) {
  const [ov, macro, fundResp] = await Promise.all([b3data(supaUrl, serviceKey, "overview"), b3data(supaUrl, serviceKey, "macro"), b3data(supaUrl, serviceKey, "fundamentals")]);
  if (!ov && !macro) return { ok: false, error: "sem dados da B3" };

  // Fundamentos compactos (valuation + qualidade) e top pagadoras de dividendos.
  // deno-lint-ignore no-explicit-any
  const funds = (fundResp?.funds ?? {}) as Record<string, any>;
  const fundArr = Object.entries(funds).map(([sym, f]) => ({ sym, pl: f.pl, pvp: f.pvp, dy: f.dy, roe: f.roe }));
  const topDy = fundArr.filter((f) => f.dy != null).sort((a, b) => (b.dy ?? 0) - (a.dy ?? 0)).slice(0, 8);

  const userMsg = [
    "Gere o Relatório Diário do pregão da B3 de hoje a partir dos dados abaixo.",
    "Termômetro de Medo & Ganância Brasil (índice próprio 0-100, 0=medo extremo, 100=ganância extrema; com rótulo e os componentes que o compõem):",
    JSON.stringify(ov?.fng ?? "indisponível"),
    "Watchlist (IBOV, dólar e ações — symbol, preço, variação% do dia, volume):",
    JSON.stringify(ov?.quotes ?? []),
    "Macro BR (selic = % ao dia; cdi = % a.a.; ipca = % no mês; ibc_br = índice de atividade com variação mensal momPct; unemployment = desemprego %; usd_brl = PTAX):",
    JSON.stringify(ov?.macro ?? {}),
    "Commodities que movem o IBOV (symbol, preço, changePct do dia, w1 = 7 dias, impacts = ações que costuma mover):",
    JSON.stringify(ov?.commodities ?? []),
    "Expectativas do mercado — Boletim Focus (mediana para o ano):",
    JSON.stringify(macro?.focus ?? "indisponível"),
    "Macro global (S&P/Nasdaq/Ouro/Brent/VIX/Dólar — preço e variação%):",
    JSON.stringify(macro?.globals ?? []),
    "Correlações do IBOV (c30 = 30 dias, c90 = 90 dias; +1 anda junto, -1 ao contrário):",
    JSON.stringify(macro?.correlations ?? []),
    "ADRs prêmio/desconto vs ação local (premiumPct):",
    JSON.stringify(macro?.adrs ?? []),
    "Fundamentos das ações (pl=P/L, pvp=P/VP, dy=Dividend Yield %, roe=ROE %):",
    JSON.stringify(fundArr),
    "Maiores pagadoras de dividendos (por DY %):",
    JSON.stringify(topDy),
  ].join("\n");

  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) return { ok: false, error: `gemini ${aiResp.status}` };

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!content) return { ok: false, error: "resposta vazia" };

  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  await admin.from("b3_reports").insert({ content, model: usedModel, input_tokens: inTok, output_tokens: outTok });
  return { ok: true, model: usedModel, content };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não permitido" });

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supaUrl, serviceKey);
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json(500, { error: "GEMINI_API_KEY não configurada" });

  // CRON (dispatch secret)
  const dispatch = Deno.env.get("DISPATCH_SECRET");
  if (dispatch && req.headers.get("x-dispatch-secret") === dispatch) {
    const r = await generateReport(admin, geminiKey, supaUrl, serviceKey);
    return json(r.ok ? 200 : 502, { mode: "cron", ...r });
  }

  // MANUAL — admin autenticado
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "Módulo B3 é restrito ao admin." });

  const r = await generateReport(admin, geminiKey, supaUrl, serviceKey);
  if (!r.ok) return json(502, { error: "Falha ao gerar relatório", detail: r.error });
  return json(200, { content: r.content, model_used: r.model });
});
