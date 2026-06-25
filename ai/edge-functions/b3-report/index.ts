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

const SYSTEM_PROMPT_FII = [
  "Você gera o Relatório de FIIs (fundos imobiliários) da B3 do OrbeView.",
  "Responda SEMPRE em português brasileiro com acentuação correta. Explique termos técnicos em poucas palavras (DY, P/VP, FFO yield, cap rate, vacância, CRI, FOF).",
  "Produza em markdown com EXATAMENTE estas seções (use os títulos):",
  "## Síntese do dia — 2 a 3 frases de panorama dos FIIs conectando o nível de juros (Selic/CDI) ao apetite pela classe (juro alto = renda fixa concorre e pressiona as cotas; queda de juros favorece), o DY médio do universo e o tom geral.",
  "## 1. Panorama dos FIIs — DY médio, P/VP médio (acima de 1 = ágio sobre o patrimônio; abaixo de 1 = deságio) e o que o CDI atual significa para a classe.",
  "## 2. Por segmento — papel/CRI, logística, shopping, lajes/híbrido e FOF: compare DY e P/VP entre os segmentos (quais estão mais descontados ou com prêmio).",
  "## 3. Destaques — melhores pagadores de DY com P/VP saudável; maiores deságios (P/VP < 1); e alerte vacância alta ou cap rate fora do padrão. Cite 4 a 6 nomes.",
  "## 4. Renda x juros — compare o DY médio dos FIIs com o CDI (% a.a.): o prêmio do FII sobre a renda fixa justifica o risco? Explique o trade-off (sem recomendar).",
  "## 5. Cenários — base e alternativo, NARRATIVO e NÃO direcional (ex.: 'se a Selic ceder, FIIs de tijolo tendem a reprecificar'). Sem preço-alvo.",
  "## 6. Aviso — informativo/educacional, não é recomendação de compra/venda nem aconselhamento; a decisão é sempre do usuário.",
  "Use APENAS os dados fornecidos; se algo faltar, diga que está indisponível e NUNCA invente números.",
  "Proibido: recomendar compra/venda, prever preço-alvo, usar linguagem de certeza (prefira 'tende a', 'sugere').",
].join("\n");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function b3data(url: string, key: string, mode: string, extra?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${url}/functions/v1/b3-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, apikey: key },
      body: JSON.stringify({ mode, ...extra }),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  // 8192 (não 4096): o gemini-2.5-pro é modelo de "thinking" e consome parte do
  // orçamento pensando — com 4096 estourava e devolvia texto VAZIO. Flash sem thinking.
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 8192, temperature: 0.6 };
  if (model.includes("flash")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig }),
  });
}

// deno-lint-ignore no-explicit-any
async function generateReport(admin: any, geminiKey: string, supaUrl: string, serviceKey: string, kind: string) {
  const isFiiReport = kind === "fii";
  const [ov, macro, fundResp] = await Promise.all([
    b3data(supaUrl, serviceKey, "overview"),
    b3data(supaUrl, serviceKey, "macro"),
    b3data(supaUrl, serviceKey, "fundamentals", isFiiReport ? { kind: "fii" } : undefined),
  ]);
  if (!ov && !macro) return { ok: false, error: "sem dados da B3" };

  let system: string;
  let userMsg: string;

  if (isFiiReport) {
    // Relatório do mercado de FIIs (DY × CDI, P/VP, segmentos, vacância).
    // deno-lint-ignore no-explicit-any
    const fiis = (fundResp?.fiis ?? {}) as Record<string, any>;
    const fiiArr = Object.entries(fiis).map(([sym, f]) => ({ sym, seg: f.segmento, dy: f.dy, pvp: f.pvp, ffo: f.ffoYield, cap: f.capRate, vac: f.vacancia, liq: f.liquidez, mcap: f.valorMercado }));
    const topDy = fiiArr.filter((f) => f.dy != null).sort((a, b) => (b.dy ?? 0) - (a.dy ?? 0)).slice(0, 10);
    const cheapest = fiiArr.filter((f) => f.pvp != null).sort((a, b) => (a.pvp ?? 9) - (b.pvp ?? 9)).slice(0, 8);
    system = SYSTEM_PROMPT_FII;
    userMsg = [
      "Gere o Relatório de FIIs (fundos imobiliários) de hoje a partir dos dados abaixo.",
      "Macro BR (selic = % ao dia; cdi = % a.a. — referência da renda fixa que CONCORRE com o FII; ipca = % no mês):",
      JSON.stringify(ov?.macro ?? {}),
      "Universo de FIIs (sym, seg=segmento, dy=Dividend Yield %, pvp=P/VP, ffo=FFO Yield %, cap=cap rate %, vac=vacância %, liq=liquidez diária, mcap=valor de mercado):",
      JSON.stringify(fiiArr),
      "Maiores DY (%):",
      JSON.stringify(topDy),
      "Maiores deságios (menor P/VP):",
      JSON.stringify(cheapest),
      "Contexto de mercado (IBOV e dólar):",
      JSON.stringify((Array.isArray(ov?.quotes) ? ov.quotes : []).filter((q: { symbol?: string }) => q.symbol === "IBOV" || q.symbol === "USD/BRL")),
      "Expectativas do mercado — Boletim Focus (mediana para o ano):",
      JSON.stringify(macro?.focus ?? "indisponível"),
    ].join("\n");
  } else {
    // Relatório do pregão (IBOV, ações, macro, externo, fluxo estrangeiro via ADR).
    // deno-lint-ignore no-explicit-any
    const funds = (fundResp?.funds ?? {}) as Record<string, any>;
    const fundArr = Object.entries(funds).map(([sym, f]) => ({ sym, pl: f.pl, pvp: f.pvp, dy: f.dy, roe: f.roe }));
    const topDy = fundArr.filter((f) => f.dy != null).sort((a, b) => (b.dy ?? 0) - (a.dy ?? 0)).slice(0, 8);
    system = SYSTEM_PROMPT;
    userMsg = [
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
  }

  // Tenta o pro e, em QUALQUER falha (erro HTTP OU texto vazio — o pro "pensa"
  // demais e devolve vazio), cai pro flash (thinking off → sempre responde).
  let usedModel = "";
  let content = "";
  // deno-lint-ignore no-explicit-any
  let aiData: any = {};
  let lastErr = "";
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    usedModel = model;
    const aiResp = await callGemini(model, geminiKey, system, userMsg);
    if (!aiResp.ok) {
      lastErr = `gemini ${aiResp.status}`;
      console.error(`[b3-report:${kind}] ${model}: HTTP ${aiResp.status} — ${(await aiResp.text().catch(() => "")).slice(0, 300)}`);
      continue;
    }
    aiData = await aiResp.json();
    const parts = aiData.candidates?.[0]?.content?.parts ?? [];
    content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (content) break;
    const fr = aiData.candidates?.[0]?.finishReason ?? "?";
    lastErr = `resposta vazia (finish=${fr})`;
    console.error(`[b3-report:${kind}] ${model}: resposta vazia, finishReason=${fr}`);
  }
  if (!content) return { ok: false, error: lastErr || "resposta vazia" };

  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  await admin.from("b3_reports").insert({ content, model: usedModel, input_tokens: inTok, output_tokens: outTok, kind });
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

  // CRON (dispatch secret) — gera os DOIS relatórios (pregão + FIIs).
  const dispatch = Deno.env.get("DISPATCH_SECRET");
  if (dispatch && req.headers.get("x-dispatch-secret") === dispatch) {
    const pregao = await generateReport(admin, geminiKey, supaUrl, serviceKey, "acoes");
    const fii = await generateReport(admin, geminiKey, supaUrl, serviceKey, "fii");
    return json(200, { mode: "cron", pregao, fii });
  }

  // MANUAL — admin autenticado. body.kind = 'acoes' (pregão, default) | 'fii'.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "Módulo B3 é restrito ao admin." });

  const body = await req.json().catch(() => ({}));
  const reportKind = body?.kind === "fii" ? "fii" : "acoes";
  const r = await generateReport(admin, geminiKey, supaUrl, serviceKey, reportKind);
  if (!r.ok) return json(502, { error: "Falha ao gerar relatório", detail: r.error });
  return json(200, { content: r.content, model_used: r.model, kind: reportKind });
});
