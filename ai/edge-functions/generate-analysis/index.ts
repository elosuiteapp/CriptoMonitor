// Edge Function: generate-analysis (PRD secao 6 - provedor: Google Gemini)
// Analise narrativa sob demanda de um ativo: valida plano + cota, le o market_snapshot
// mais recente + camada institucional (OI delta, paredes do book, macro & correlacoes,
// VOLATILIDADE) e gera com o modelo do plano. Prompt em ASCII (deploy seguro); o modelo
// responde em portugues brasileiro com acentuacao.
// Deploy: supabase functions deploy generate-analysis - Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Voce e o copiloto de IA do Crypto Monitor, um cockpit de decisoes para traders de cripto.",
  "Responda em portugues brasileiro com acentuacao correta; ao usar termo tecnico (funding, OI, GEX, gamma, CVD, max pain, skew, Put/Call, DVOL, IVP, IV-RV, term structure), explique em poucas palavras.",
  "Estrutura obrigatoria:",
  "1) Contexto macro - DXY/S&P/ouro/10Y e a correlacao 30d quando houver (vento a favor/contra).",
  "2) Fluxo varejo x institucional - varejo via perps/funding/CVD da Binance; institucional via spot da Coinbase. Use o PREMIO COINBASE (preco Coinbase menos Binance), a PARTICIPACAO INSTITUCIONAL (volume da Coinbase vs Binance+OKX) e o CVD da Coinbase comparado ao da Binance. Use o DELTA DE OI vs preco para ler novas posicoes (long/short).",
  "3) Niveis de liquidez e opcoes - Call/Put Wall, Zero Gamma, Max Pain e as PAREDES DO BOOK como imas/suporte-resistencia, citando os precos. Use tambem o HIRO (options_flow_hiro): o delta-fluxo do hedge dos dealers de opcoes nos ultimos minutos (positivo = hedge comprador, negativo = vendedor); se diverge do preco (fluxo sobe mas preco cai), e sinal de cautela.",
  "3c) Risco de squeeze - cruze funding + long/short + liquidacoes: comprados lotados pagando funding caro = risco de squeeze de BAIXA (liquidam se cai); vendidos lotados pagando = risco de squeeze de ALTA. Se as liquidacoes daquele lado ja correm, o squeeze esta em curso.",
  "3b) Estrutura de mercado (Smart Money Concepts) - quando a ESTRUTURA SMC for fornecida, use o vies por timeframe (1D e 4h), o ultimo evento (BOS = continuacao / CHoCH = possivel reversao), os order blocks de suporte/resistencia, os pools de liquidez (alvos magneticos) e a zona premium (caro) / discount (barato). DESTAQUE como ALTA CONFLUENCIA quando um order block ou pool de liquidez coincidir (preco proximo) com Call/Put Wall, Zero Gamma, Max Pain ou parede do book. Explique BOS/CHoCH/order block/liquidez em poucas palavras.",
  "4) Volatilidade e sentimento - Fear & Greed; opcoes: Put/Call, IV media e skew; e o painel de volatilidade quando houver: DVOL, IV Percentile 90d, IV-RV spread (premio de risco) e term structure (se o curto 7d > 90d e backwardation, mercado pricing evento de curto prazo).",
  "5) Sintese - junte os sinais num quadro coerente.",
  "FUNDING (unidades): no snapshot, derivatives.funding_rate (CEX, Coinalyze) ja vem em PERCENT (0,01 = 0,01%, intervalo 8h) e onchain_perps.funding_rate (Hyperliquid) vem em FRACAO (x100 para %). Use os valores de funding ja convertidos para percent fornecidos no prompt e NUNCA multiplique o CEX por 100.",
  "Proibido: recomendar compra/venda, prever preco-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere').",
  "Use apenas os dados fornecidos; se uma metrica vier ausente, diga que esta indisponivel neste ciclo e nunca invente numeros.",
  "Encerre sempre com aviso de que a analise e informativa e educacional, nao constitui recomendacao de compra/venda nem aconselhamento financeiro, e a decisao e sempre do usuario.",
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
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_KEY) return json(500, { error: "GEMINI_API_KEY nao configurada" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "nao autenticado" });

  const body = await req.json().catch(() => ({}));
  const ativo = String(body.asset || "BTC").toUpperCase();
  const smc = body.smc ?? null; // resumo Smart Money Concepts (1D+4h) enviado pelo cliente

  const { data: sub } = await admin
    .from("subscriptions").select("plan:plans(*)")
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  let plan = (sub?.plan as Record<string, unknown> | undefined) ?? undefined;
  if (!plan) {
    const { data: free } = await admin.from("plans").select("*").eq("slug", "free").single();
    plan = free ?? undefined;
  }
  if (!plan) return json(500, { error: "plano nao encontrado" });

  const assets = (plan.assets as string[]) ?? ["BTC"];
  if (!assets.includes(ativo)) {
    return json(403, { error: `O ativo ${ativo} nao esta disponivel no seu plano.` });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("usage_log").select("count")
    .eq("user_id", user.id).eq("action", "ai_analysis").eq("day", today).maybeSingle();
  const used = (usage?.count as number) ?? 0;
  const limit = plan.ai_daily_limit as number | null;
  if (limit !== null && used >= limit) {
    return json(429, { error: `Cota diaria atingida (${limit} analises). Volte amanha ou faca upgrade.` });
  }

  const { data: snap } = await admin
    .from("market_snapshot").select("id, payload, ts")
    .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle();
  if (!snap) {
    return json(503, { error: "Sem dados de mercado para este ativo ainda. Aguarde o proximo ciclo." });
  }

  // Camada institucional (Fase 6) - so para planos avancados
  const advanced = (plan.advanced_metrics as boolean) ?? false;
  const since15 = new Date(Date.now() - 15 * 60000).toISOString();
  const institutional: Record<string, unknown> = {};
  if (advanced) {
    const [{ data: oi }, { data: walls }, { data: macroAssets }, { data: macroCorr }, { data: volRow }, { data: hiro }] =
      await Promise.all([
        admin.from("v_oi_delta").select("oi_delta_4h, oi_delta_24h, price_delta_4h").eq("asset", ativo).maybeSingle(),
        admin.from("orderbook_walls").select("exchange, side, price, notional_usd").eq("asset", ativo)
          .gte("ts", since15).order("notional_usd", { ascending: false }).limit(8),
        admin.from("macro_assets").select("symbol, name, price, change_24h, change_7d").order("ts", { ascending: false }).limit(16),
        admin.from("macro_correlations").select("macro_symbol, corr_30d").eq("asset", ativo).order("ts", { ascending: false }).limit(12),
        admin.from("volatility_index").select("dvol, ivp_90d, rv_30d, iv_rv_spread, term_structure, ts")
          .eq("asset", ativo).order("ts", { ascending: false }).limit(1).maybeSingle(),
        admin.from("options_flow").select("net_delta_flow, trades_count, ts").eq("asset", ativo).order("ts", { ascending: false }).limit(6),
      ]);
    institutional.oi_delta = oi ?? null;
    institutional.order_book_walls = walls ?? [];
    institutional.macro = dedupeBy((macroAssets as Record<string, unknown>[]) ?? [], "symbol");
    institutional.macro_correlations = dedupeBy((macroCorr as Record<string, unknown>[]) ?? [], "macro_symbol");
    institutional.volatility = volRow ?? null;
    institutional.options_flow_hiro = hiro ?? []; // proxy HIRO: delta-fluxo do hedge dos dealers (ultimos buckets de 5 min)
  }

  // Noticias recentes
  const { data: news } = await admin
    .from("news_feed").select("title, source").contains("assets", [ativo])
    .order("published_at", { ascending: false }).limit(5);
  const newsText = (news && news.length)
    ? news.map((n) => `- ${n.title} (${n.source ?? "?"})`).join("\n")
    : "Nenhuma noticia recente disponivel.";

  // Funding ja convertido p/ PERCENT (evita a IA tratar o valor cru com unidade errada).
  const pl = snap.payload as Record<string, unknown>;
  const cexF = (pl?.derivatives as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const onchF = (pl?.onchain_perps as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const fundingLines = [
    "FUNDING ja convertido para PERCENT (use exatamente estes; nao multiplique de novo):",
    `- CEX agregado (Coinalyze, intervalo 8h): ${cexF == null ? "indisponivel" : cexF.toFixed(4) + "%"}`,
    `- Onchain (Hyperliquid, intervalo 1h): ${onchF == null ? "indisponivel" : (onchF * 100).toFixed(4) + "%"}`,
  ];

  const userMsg = [
    `Analise o momento de mercado do ativo ${ativo} com base nos dados abaixo.`,
    "Estrutura: macro -> fluxo varejo x institucional -> niveis/opcoes -> volatilidade e sentimento -> sintese.",
    "No snapshot, use price.coinbase (institucional) vs price.binance e price.okx (varejo) para volume e CVD, e o campo coinbase_premium.",
    ...fundingLines,
    "",
    "Snapshot consolidado (JSON):",
    JSON.stringify(snap.payload),
    "",
    "Camada institucional (OI delta, paredes do book, macro & correlacoes, volatilidade DVOL/IVP/IV-RV/term structure, HIRO em options_flow_hiro):",
    JSON.stringify(institutional),
    "",
    "Estrutura SMC (Smart Money Concepts, calculada dos candles 1D e 4h - vies, BOS/CHoCH, order blocks de suporte/resistencia, pools de liquidez, zona premium/discount, sweep recente):",
    JSON.stringify(smc ?? {}),
    "",
    "Noticias recentes:",
    newsText,
  ].join("\n");

  let usedModel = (plan.ai_model as string) ?? FALLBACK_MODEL;
  let aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    const detail = await aiResp.text();
    console.error(`modelo ${usedModel} falhou (${aiResp.status}): ${detail.slice(0, 200)} - fallback ${FALLBACK_MODEL}`);
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) {
    const detail = await aiResp.text();
    console.error(`Gemini falhou (${aiResp.status}): ${detail.slice(0, 300)}`);
    return json(502, { error: "Falha ao gerar analise", detail: detail.slice(0, 300) });
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
