// Edge Function: newsletter-module
// Gera a edicao SEMANAL da newsletter de UM modulo NAO-cripto (B3 ou Forex) via Gemini
// e grava em newsletter_editions (module=<b3|forex>, auto_generated=true, min_tier='free').
// A newsletter de CRIPTO fica na funcao newsletter-generate (intacta).
// Chamada: cron (x-cron-key) OU admin (JWT). Body: { module: 'b3'|'forex', force?, publish? }.
// Deploy: supabase functions deploy newsletter-module --no-verify-jwt
// Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function slugify(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" }, excerpt: { type: "STRING" }, cover_emoji: { type: "STRING" },
    teaser_md: { type: "STRING" }, body_md: { type: "STRING" },
  },
  required: ["title", "excerpt", "cover_emoji", "teaser_md", "body_md"],
};

const BASE_VOICE =
  "VOZ: analista senior - clara, direta, com personalidade; zero enchecao de linguica; portugues brasileiro com acentuacao correta. Explique cada termo tecnico na 1a vez. PRINCIPIO: conecte os dados numa TESE da semana; nao liste metricas soltas; escolha os 2-3 numeros que importam e diga O QUE SIGNIFICAM. Negrito nos termos e niveis-chave. Proibido: recomendar compra/venda, prever preco-alvo, linguagem de certeza (use 'tende a', 'historicamente', 'sugere'). NUNCA invente numeros: se faltar dado, diga indisponivel neste ciclo. Responda APENAS com um JSON valido: title (chamada forte ~6-10 palavras), excerpt (1 frase max 160 char), cover_emoji (1 emoji), teaser_md (abertura publica: lead 1-2 paragrafos + 'Resumo rapido', cortando antes do detalhe), body_md (edicao completa 500-800 palavras em markdown com EXATAMENTE as secoes pedidas).";

const CFG: Record<string, { emoji: string; label: string; system: string; intro: string }> = {
  b3: {
    emoji: "\u{1F1E7}\u{1F1F7}",
    label: "B3",
    system:
      "Voce e analista-chefe da newsletter SEMANAL de ACOES da B3 (bolsa brasileira) do OrbeView, para traders de varejo. " + BASE_VOICE +
      " Secoes do body_md (titulos exatos): ## Resumo rapido (3 bullets), ## A semana em uma frase, ## O que aconteceu (IBOV, dolar USD/BRL e as acoes que mais mexeram - e POR QUE), ## Fluxo (estrangeiro x institucional x pessoa fisica: quem esta comprando/vendendo e a leitura), ## Macro Brasil (Selic/juros, dolar, cenario e como empurra a bolsa esta semana), ## O que observar na semana (2-3 niveis/temas em bullets, cenarios NARRATIVOS e nao direcionais), ## Aviso (educacional).",
    intro: "Gere a edicao SEMANAL da newsletter de ACOES da B3 a partir dos dados abaixo.",
  },
  forex: {
    emoji: "\u{1F4B1}",
    label: "Forex",
    system:
      "Voce e analista-chefe da newsletter SEMANAL de CAMBIO (Forex) do OrbeView, para traders de varejo. " + BASE_VOICE +
      " Secoes do body_md (titulos exatos): ## Resumo rapido (3 bullets), ## A semana em uma frase, ## O que aconteceu (DXY e os principais pares - e POR QUE), ## Posicionamento (COT/CFTC: mao forte comprada/vendida, carry e diferencial de juros - a leitura), ## Macro (Fed/Copom, dados e como movem o cambio esta semana), ## O que observar na semana (2-3 niveis/temas em bullets, cenarios NARRATIVOS e nao direcionais), ## Aviso (educacional).",
    intro: "Gere a edicao SEMANAL da newsletter de CAMBIO (Forex) a partir dos dados abaixo.",
  },
};

async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 16384, temperature: 0.75, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_KEY) return json(500, { error: "GEMINI_API_KEY nao configurada" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const body = await req.json().catch(() => ({}));
  const module = String(body?.module ?? "");
  if (!CFG[module]) return json(400, { error: "module invalido (use 'b3' ou 'forex')" });
  const force = body?.force === true;
  const publish = body?.publish !== false;
  const cfg = CFG[module];

  const logRun = async (status: string, model: string | null, detail: Record<string, unknown>) => {
    try { await admin.from("automation_runs").insert({ job: "newsletter", status, model, detail: { module, ...detail } }); } catch (_e) { /* */ }
  };

  // Autorizacao: cron (x-cron-key) OU admin (JWT).
  let authorized = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey) {
    const { data: secret } = await admin.from("app_secrets").select("value").eq("key", "newsletter_cron_key").maybeSingle();
    if (secret?.value && cronKey === secret.value) authorized = true;
  }
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const u = userData?.user;
    if (u) { const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle(); if (prof?.role === "admin") authorized = true; }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  // Idempotencia: nao gera se ja houve edicao automatica DESTE modulo nos ultimos 6 dias.
  if (!force) {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await admin.from("newsletter_editions").select("slug")
      .eq("auto_generated", true).eq("module", module).gte("published_at", sixDaysAgo).limit(1).maybeSingle();
    if (recent) { await logRun("skipped", null, { reason: "edicao recente ja existe", slug: recent.slug }); return json(200, { skipped: true, slug: recent.slug }); }
  }

  // Dados: overview do modulo (edge fn interna, proxy sem auth) + tabelas + noticias.
  const callFn = async (name: string, b: unknown) => {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
        body: JSON.stringify(b),
      });
      return r.ok ? await r.json().catch(() => null) : null;
    } catch (_e) { return null; }
  };
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let dataBlocks: string[];
  if (module === "b3") {
    const [overview, flow, macro, news] = await Promise.all([
      callFn("b3-data", { mode: "overview" }),
      admin.from("b3_investor_flow").select("*").order("ts", { ascending: false }).limit(10),
      admin.from("macro_global").select("*").order("ts", { ascending: false }).limit(12),
      admin.from("news_feed").select("title, source").gte("published_at", weekAgo).order("published_at", { ascending: false }).limit(14),
    ]);
    dataBlocks = [
      "Watchlist B3 (IBOV, USD/BRL, acoes - preco/variacao) + macro BR:", JSON.stringify(overview ?? {}),
      "Fluxo por investidor (recente):", JSON.stringify(flow.data ?? []),
      "Macro global:", JSON.stringify(macro.data ?? []),
      "Noticias da semana:", (news.data ?? []).map((n: { title: string; source: string | null }) => `- ${n.title} (${n.source ?? "?"})`).join("\n") || "sem noticias",
    ];
  } else {
    const [overview, cot, macro, news] = await Promise.all([
      callFn("forex-data", { mode: "overview" }),
      admin.from("cot_positioning").select("*").order("ts", { ascending: false }).limit(20),
      admin.from("macro_global").select("*").order("ts", { ascending: false }).limit(12),
      admin.from("news_feed").select("title, source").gte("published_at", weekAgo).order("published_at", { ascending: false }).limit(14),
    ]);
    dataBlocks = [
      "Overview Forex (DXY + pares principais, preco/variacao):", JSON.stringify(overview ?? {}),
      "COT/CFTC (posicionamento, recente):", JSON.stringify(cot.data ?? []),
      "Macro global:", JSON.stringify(macro.data ?? []),
      "Noticias da semana:", (news.data ?? []).map((n: { title: string; source: string | null }) => `- ${n.title} (${n.source ?? "?"})`).join("\n") || "sem noticias",
    ];
  }
  const userMsg = [cfg.intro, "Se algum bloco vier vazio, diga que o dado esta indisponivel neste ciclo (nao invente).", "", ...dataBlocks].join("\n");

  // Geracao (PRO -> retry -> FLASH), igual a newsletter de cripto.
  let usedModel = PRIMARY_MODEL, proError = "";
  let aiResp = await callGemini(PRIMARY_MODEL, GEMINI_KEY, cfg.system, userMsg);
  if (!aiResp.ok) {
    proError = `${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`;
    if (aiResp.status === 429 || aiResp.status >= 500) { await new Promise((r) => setTimeout(r, 5000)); aiResp = await callGemini(PRIMARY_MODEL, GEMINI_KEY, cfg.system, userMsg); }
  }
  if (!aiResp.ok) { usedModel = FALLBACK_MODEL; aiResp = await callGemini(FALLBACK_MODEL, GEMINI_KEY, cfg.system, userMsg); }
  if (!aiResp.ok) { const d = await aiResp.text(); await logRun("error", usedModel, { error: "falha na IA", detail: d.slice(0, 200), pro_error: proError }); return json(502, { error: "Falha ao gerar", detail: d.slice(0, 300) }); }

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  let parsed: { title?: string; excerpt?: string; cover_emoji?: string; teaser_md?: string; body_md?: string };
  try { parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")); }
  catch { await logRun("error", usedModel, { error: "json invalido", detail: raw.slice(0, 200) }); return json(502, { error: "Resposta da IA nao e JSON valido" }); }

  const title = (parsed.title ?? "").trim();
  const bodyMd = (parsed.body_md ?? "").trim();
  if (title.length < 5 || bodyMd.length < 200) { await logRun("error", usedModel, { error: "conteudo insuficiente" }); return json(502, { error: "Conteudo insuficiente" }); }

  let slug = `${module}-${slugify(title)}`.slice(0, 66);
  const { data: clash } = await admin.from("newsletter_editions").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${new Date().toISOString().slice(0, 10)}`.slice(0, 70);

  const { error: insErr } = await admin.from("newsletter_editions").insert({
    slug, title, module,
    excerpt: (parsed.excerpt ?? "").trim().slice(0, 200),
    teaser_md: (parsed.teaser_md ?? "").trim(),
    body_md: bodyMd,
    cover_emoji: (parsed.cover_emoji ?? cfg.emoji).trim().slice(0, 8) || cfg.emoji,
    min_tier: "free",
    published: publish,
    published_at: publish ? new Date().toISOString() : null,
    auto_generated: true,
    model_used: usedModel,
  });
  if (insErr) { await logRun("error", usedModel, { error: "falha ao gravar", detail: insErr.message }); return json(500, { error: "Falha ao gravar", detail: insErr.message }); }

  await logRun("ok", usedModel, { slug, title, published: publish });
  return json(200, { ok: true, module, slug, title, published: publish, model_used: usedModel });
});
