// Edge Function: cockpit-report (Cockpit Report - miolo, sem entrega externa)
// Gera o Relatorio Diario de um ativo via Google Gemini e grava em ai_analysis como
// BROADCAST (user_id NULL, report_type='daily', auto_generated=true). Sem cron/email
// nesta etapa: chamado pelo botao "Gerar relatorio agora" (Expert) no frontend.
// Deploy: supabase functions deploy cockpit-report - Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

// Prompt em ASCII (seguranca de deploy); o modelo responde em PT-BR com acentuacao.
const SYSTEM_PROMPT = [
  "Voce gera o Relatorio Diario do OrbeView, um cockpit de decisoes para traders de cripto.",
  "Responda SEMPRE em portugues brasileiro com acentuacao correta. Ao usar termo tecnico (gamma, GEX, funding, OI, CVD, max pain, skew, Put/Call, DVOL, IV, RV), explique em poucas palavras.",
  "Produza o relatorio em markdown com EXATAMENTE estas secoes (use os titulos):",
  "## 1. Resumo das ultimas 24h - mudanca de preco, regime de gamma, fluxo varejo (Binance/perps) x institucional (Coinbase) e sentimento. No fluxo, cite o PREMIO COINBASE (preco Coinbase vs Binance), a PARTICIPACAO INSTITUCIONAL (volume Coinbase vs Binance+OKX) e o CVD da Coinbase comparado ao da Binance.",
  "## 2. Volatilidade - quando houver: DVOL, IV Percentile 90d, IV-RV spread (premio de risco) e term structure (se 7d > 90d e backwardation, evento de curto prazo).",
  "## 3. Niveis em destaque - Call Wall, Put Wall, Zero Gamma, Max Pain, POC e bolsoes de liquidez (cite os precos quando houver).",
  "## 4. Leitura macro - DXY e correlacoes 30d, Fear & Greed, dominancia BTC.",
  "## 5. Cenarios - cenario base e cenario alternativo, de forma NARRATIVA e NAO direcional (ex.: 'se mantiver acima de X o regime amortecido tende a seguir; se perder Y tende a virar negativo'). Sem alvo de preco.",
  "## 6. Eventos relevantes - noticias do periodo (se houver).",
  "## 7. Aviso - informativo/educacional, nao e recomendacao de compra/venda nem aconselhamento financeiro; a decisao e sempre do usuario.",
  "FUNDING (unidades): no snapshot, derivatives.funding_rate (CEX, Coinalyze) ja vem em PERCENT (0,01 = 0,01%, intervalo 8h) e onchain_perps.funding_rate (Hyperliquid) vem em FRACAO (x100 para %). Use os valores de funding ja convertidos para percent fornecidos no prompt e NUNCA multiplique o CEX por 100.",
  "Proibido: recomendar compra/venda, prever preco-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere').",
  "Use apenas os dados fornecidos; se uma metrica vier ausente, diga que esta indisponivel neste ciclo e nunca invente numeros.",
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
  const generationConfig: Record<string, unknown> = { maxOutputTokens: 4096, temperature: 0.6 };
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
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_KEY) return json(500, { error: "GEMINI_API_KEY nao configurada" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Geracao manual exige usuario autenticado com plano avancado (Pro+). Anti-abuso.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "nao autenticado" });

  const { asset } = await req.json().catch(() => ({ asset: "BTC" }));
  const ativo = String(asset || "BTC").toUpperCase();
  if (!["BTC", "ETH", "SOL"].includes(ativo)) return json(400, { error: "ativo invalido" });

  const { data: sub } = await admin
    .from("subscriptions").select("plan:plans(*)")
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  const plan = (sub?.plan as Record<string, unknown> | undefined) ?? undefined;
  if (!plan || !(plan.advanced_metrics as boolean)) {
    return json(403, { error: "Relatorios diarios sao um recurso dos planos Pro e Expert." });
  }

  // ── Dados ─────────────────────────────────────────────────────────────────
  const { data: snap } = await admin
    .from("market_snapshot").select("id, payload, ts")
    .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle();
  if (!snap) return json(503, { error: "Sem dados de mercado para este ativo ainda." });

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: snapPrev } = await admin
    .from("market_snapshot").select("payload, ts")
    .eq("asset", ativo).lte("ts", dayAgo).order("ts", { ascending: false }).limit(1).maybeSingle();

  const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: news }, { data: macroAssets }, { data: macroCorr }, { data: vol }] = await Promise.all([
    admin.from("news_feed").select("title, source").contains("assets", [ativo])
      .gte("published_at", since24).order("published_at", { ascending: false }).limit(8),
    admin.from("macro_assets").select("symbol, name, price, change_24h, change_7d").order("ts", { ascending: false }).limit(16),
    admin.from("macro_correlations").select("macro_symbol, corr_30d").eq("asset", ativo).order("ts", { ascending: false }).limit(12),
    admin.from("volatility_index").select("dvol, ivp_90d, rv_30d, iv_rv_spread, term_structure, ts")
      .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const newsText = (news && news.length)
    ? news.map((n) => `- ${n.title} (${n.source ?? "?"})`).join("\n")
    : "Nenhuma noticia relevante nas ultimas 24h.";

  // Funding ja convertido p/ PERCENT (evita a IA tratar o valor cru com unidade errada).
  const pl = snap.payload as Record<string, unknown>;
  const cexF = (pl?.derivatives as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const onchF = (pl?.onchain_perps as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;

  const userMsg = [
    `Gere o Relatorio Diario do ativo ${ativo}.`,
    "No snapshot: price.coinbase (institucional) vs price.binance e price.okx (varejo) tem volume e CVD; use tambem o campo coinbase_premium.",
    "FUNDING ja convertido para PERCENT (use exatamente estes; nao multiplique de novo):",
    `- CEX agregado (Coinalyze, intervalo 8h): ${cexF == null ? "indisponivel" : cexF.toFixed(4) + "%"}`,
    `- Onchain (Hyperliquid, intervalo 1h): ${onchF == null ? "indisponivel" : (onchF * 100).toFixed(4) + "%"}`,
    "",
    "Snapshot atual (JSON):",
    JSON.stringify(snap.payload),
    "",
    "Snapshot de ~24h atras (JSON; pode estar ausente se o historico ainda nao cobre 24h):",
    snapPrev ? JSON.stringify(snapPrev.payload) : "indisponivel (historico < 24h)",
    "",
    "Volatilidade (DVOL, IVP 90d, RV 30d, IV-RV spread, term structure):",
    vol ? JSON.stringify(vol) : "indisponivel para este ativo",
    "",
    "Macro (ativos + correlacoes 30d):",
    JSON.stringify({
      assets: dedupeBy((macroAssets as Record<string, unknown>[]) ?? [], "symbol"),
      correlations: dedupeBy((macroCorr as Record<string, unknown>[]) ?? [], "macro_symbol"),
    }),
    "",
    "Noticias das ultimas 24h:",
    newsText,
  ].join("\n");

  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    const detail = await aiResp.text();
    console.error(`modelo ${usedModel} falhou (${aiResp.status}): ${detail.slice(0, 200)} - fallback ${FALLBACK_MODEL}`);
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) {
    const detail = await aiResp.text();
    return json(502, { error: "Falha ao gerar relatorio", detail: detail.slice(0, 300) });
  }

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const content = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!content) return json(502, { error: "Resposta vazia do modelo" });

  // Custo estimado pelos tokens do Gemini (preço USD/1M; saída inclui "thinking").
  const um = (aiData.usageMetadata ?? {}) as Record<string, number>;
  const inTok = Number(um.promptTokenCount ?? 0);
  const outTok = Number(um.candidatesTokenCount ?? 0) + Number(um.thoughtsTokenCount ?? 0);
  const price = usedModel.includes("pro") ? { in: 1.25, out: 10 } : { in: 0.3, out: 2.5 };
  const { error: insErr } = await admin.from("ai_analysis").insert({
    user_id: null, asset: ativo, model_used: usedModel, content,
    snapshot_ref: snap.id, report_type: "daily", auto_generated: true,
    input_tokens: inTok, output_tokens: outTok,
    cost_usd_micros: Math.round(inTok * price.in + outTok * price.out),
  });
  if (insErr) return json(500, { error: "Falha ao gravar relatorio", detail: insErr.message });

  return json(200, { content, model_used: usedModel, asset: ativo });
});
