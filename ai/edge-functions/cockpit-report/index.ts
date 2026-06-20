// Edge Function: cockpit-report (Relatorio Diario - Gemini)
// Gera o Relatorio Diario de um ativo via Google Gemini e grava em ai_analysis como
// BROADCAST (user_id NULL, report_type='daily', auto_generated=true).
// DOIS modos:
//   - CRON (header x-dispatch-secret == DISPATCH_SECRET): gera BTC/ETH/SOL em lote (diario).
//   - MANUAL (botao Expert): usuario autenticado Pro+, um ativo do body.
// Enriquecido com a Leitura do Mercado (market_read: regime/vies/conviccao).
// Deploy: --no-verify-jwt. Secrets: GEMINI_API_KEY, DISPATCH_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatch-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Voce gera o Relatorio Diario do OrbeView, um cockpit de decisoes para traders de cripto.",
  "Responda SEMPRE em portugues brasileiro com acentuacao correta. Ao usar termo tecnico (gamma, GEX, funding, OI, CVD, max pain, skew, Put/Call, DVOL, IV, RV, net liquidity, NFCI), explique em poucas palavras.",
  "Produza o relatorio em markdown com EXATAMENTE estas secoes (use os titulos):",
  "## 1. Leitura do momento - comece pela sintese do motor de confluencia (regime, vies e conviccao fornecidos) em 1-2 frases, depois detalhe a mudanca de 24h: preco, regime de gamma, fluxo varejo (Binance/perps) x institucional (Coinbase) e sentimento. Cite o PREMIO COINBASE, a PARTICIPACAO INSTITUCIONAL e o CVD da Coinbase vs Binance.",
  "## 2. Volatilidade - quando houver: DVOL, IV Percentile 90d, IV-RV spread (premio de risco) e term structure (se 7d > 90d e backwardation, evento de curto prazo).",
  "## 3. Niveis em destaque - Call Wall, Put Wall, Zero Gamma, Max Pain, POC e bolsoes de liquidez (cite os precos quando houver).",
  "## 4. Leitura macro - a MARE de liquidez (net liquidity do Fed e sua direcao, NFCI) quando fornecida, DXY e correlacoes 30d, Fear & Greed, dominancia BTC.",
  "## 5. Cenarios - cenario base e alternativo, NARRATIVO e NAO direcional (ex.: 'se mantiver acima de X o regime amortecido tende a seguir; se perder Y tende a virar negativo'). Sem alvo de preco.",
  "## 6. Eventos relevantes - noticias do periodo (se houver).",
  "## 7. Aviso - informativo/educacional, nao e recomendacao de compra/venda nem aconselhamento financeiro; a decisao e sempre do usuario.",
  "FUNDING (unidades): use os valores de funding ja convertidos para percent fornecidos no prompt e NUNCA multiplique o CEX por 100.",
  "Proibido: recomendar compra/venda, prever preco-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere').",
  "Use apenas os dados fornecidos; se uma metrica vier ausente, diga que esta indisponivel neste ciclo e nunca invente numeros.",
].join("\n");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
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
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096, temperature: 0.6 };
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

// deno-lint-ignore no-explicit-any
async function generateReport(admin: any, geminiKey: string, ativo: string): Promise<{ asset: string; ok: boolean; model?: string; content?: string; error?: string }> {
  const { data: snap } = await admin
    .from("market_snapshot").select("id, payload, ts")
    .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle();
  if (!snap) return { asset: ativo, ok: false, error: "sem snapshot" };

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since24 = dayAgo;
  const [{ data: snapPrev }, { data: news }, { data: macroAssets }, { data: macroCorr }, { data: vol }, { data: read }, { data: mglobal }] = await Promise.all([
    admin.from("market_snapshot").select("payload, ts").eq("asset", ativo).lte("ts", dayAgo).order("ts", { ascending: false }).limit(1).maybeSingle(),
    admin.from("news_feed").select("title, source").contains("assets", [ativo]).gte("published_at", since24).order("published_at", { ascending: false }).limit(8),
    admin.from("macro_assets").select("symbol, name, price, change_24h, change_7d").order("ts", { ascending: false }).limit(16),
    admin.from("macro_correlations").select("macro_symbol, corr_30d").eq("asset", ativo).order("ts", { ascending: false }).limit(12),
    admin.from("volatility_index").select("dvol, ivp_90d, rv_30d, iv_rv_spread, term_structure, ts").eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle(),
    admin.from("market_read").select("bias, conviction, regime_label, char_state").eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle(),
    admin.from("macro_global").select("net_liquidity_busd, nl_chg_30d_pct, nfci").order("ts", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const newsText = news && news.length
    ? news.map((n: { title: string; source: string | null }) => `- ${n.title} (${n.source ?? "?"})`).join("\n")
    : "Nenhuma noticia relevante nas ultimas 24h.";
  const pl = snap.payload as Record<string, unknown>;
  const cexF = (pl?.derivatives as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const onchF = (pl?.onchain_perps as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const readText = read
    ? `Regime: ${read.regime_label} | vies ${read.bias} (-100..+100) | conviccao ${read.conviction}% | carater ${read.char_state}`
    : "indisponivel";
  const tideText = mglobal
    ? `net liquidity US$ ${(Number(mglobal.net_liquidity_busd) / 1000).toFixed(2)} tri, ${Number(mglobal.nl_chg_30d_pct) >= 0 ? "subindo" : "caindo"} ${mglobal.nl_chg_30d_pct}% em 30d; NFCI ${mglobal.nfci} (${Number(mglobal.nfci) < 0 ? "condicoes frouxas/risk-on" : "apertadas/risk-off"})`
    : "indisponivel";

  const userMsg = [
    `Gere o Relatorio Diario do ativo ${ativo}.`,
    `LEITURA DO MERCADO (motor de confluencia OrbeView): ${readText}. Comece o relatorio por essa sintese.`,
    `MARE MACRO (FRED): ${tideText}.`,
    "No snapshot: price.coinbase (institucional) vs price.binance e price.okx (varejo) tem volume e CVD; use tambem o campo coinbase_premium.",
    "FUNDING ja convertido para PERCENT (use exatamente estes; nao multiplique de novo):",
    `- CEX agregado (Coinalyze, 8h): ${cexF == null ? "indisponivel" : cexF.toFixed(4) + "%"}`,
    `- Onchain (Hyperliquid, 1h): ${onchF == null ? "indisponivel" : (onchF * 100).toFixed(4) + "%"}`,
    "",
    "Snapshot atual (JSON):",
    JSON.stringify(snap.payload),
    "",
    "Snapshot de ~24h atras (JSON; pode estar ausente):",
    snapPrev ? JSON.stringify(snapPrev.payload) : "indisponivel (historico < 24h)",
    "",
    "Volatilidade:",
    vol ? JSON.stringify(vol) : "indisponivel para este ativo",
    "",
    "Macro (ativos + correlacoes 30d):",
    JSON.stringify({ assets: dedupeBy((macroAssets as Record<string, unknown>[]) ?? [], "symbol"), correlations: dedupeBy((macroCorr as Record<string, unknown>[]) ?? [], "macro_symbol") }),
    "",
    "Noticias das ultimas 24h:",
    newsText,
  ].join("\n");

  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, geminiKey, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) return { asset: ativo, ok: false, error: `gemini ${aiResp.status}` };

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!content) return { asset: ativo, ok: false, error: "resposta vazia" };

  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  const price = usedModel.includes("pro") ? { in: 1.25, out: 10 } : { in: 0.3, out: 2.5 };
  await admin.from("ai_analysis").insert({
    user_id: null, asset: ativo, model_used: usedModel, content,
    snapshot_ref: snap.id, report_type: "daily", auto_generated: true,
    input_tokens: inTok, output_tokens: outTok, cost_usd_micros: Math.round(inTok * price.in + outTok * price.out),
  });
  return { asset: ativo, ok: true, model: usedModel, content };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return json(500, { error: "GEMINI_API_KEY nao configurada" });

  // Modo CRON: gera BTC/ETH/SOL em lote (sem usuario), protegido pelo dispatch secret.
  const dispatch = Deno.env.get("DISPATCH_SECRET");
  if (dispatch && req.headers.get("x-dispatch-secret") === dispatch) {
    const results = [];
    for (const a of ["BTC", "ETH", "SOL"]) results.push(await generateReport(admin, geminiKey, a));
    return json(200, { mode: "cron", results });
  }

  // Modo MANUAL: usuario autenticado Pro+ (botao "Gerar relatorio agora").
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "nao autenticado" });
  const { asset } = await req.json().catch(() => ({ asset: "BTC" }));
  const ativo = String(asset || "BTC").toUpperCase();
  if (!["BTC", "ETH", "SOL"].includes(ativo)) return json(400, { error: "ativo invalido" });
  const { data: sub } = await admin.from("subscriptions").select("plan:plans(*)").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const plan = (sub?.plan as Record<string, unknown> | undefined) ?? undefined;
  if (!plan || !(plan.advanced_metrics as boolean)) return json(403, { error: "Relatorios diarios sao um recurso dos planos Pro e Expert." });

  const r = await generateReport(admin, geminiKey, ativo);
  if (!r.ok) return json(502, { error: "Falha ao gerar relatorio", detail: r.error });
  return json(200, { content: r.content, model_used: r.model, asset: ativo });
});
