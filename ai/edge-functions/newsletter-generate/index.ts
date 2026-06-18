// Edge Function: newsletter-generate
// Gera a edicao SEMANAL da newsletter do OrbeView (mercado cripto) via Google Gemini
// e grava em newsletter_editions ja PUBLICADA (auto_generated=true, min_tier='free').
// Chamada de duas formas:
//   - cron semanal (pg_cron + pg_net): header x-cron-key = public.app_secrets.value
//   - manual (admin): Authorization Bearer <jwt do admin>, body { force: true } regenera
// Deploy: supabase functions deploy newsletter-generate --no-verify-jwt
// Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";
const ASSETS = ["BTC", "ETH", "SOL"];

// Prompt em ASCII (seguranca de deploy); o modelo responde em PT-BR com acentuacao.
const SYSTEM_PROMPT = [
  "Voce e o editor da newsletter SEMANAL do OrbeView, um cockpit institucional de cripto para traders de varejo.",
  "Escreva uma edicao envolvente, clara e util, SEMPRE em portugues brasileiro com acentuacao correta.",
  "Ao usar termo tecnico (gamma, GEX, Zero Gamma, Call/Put Wall, Max Pain, funding, OI, CVD, premio Coinbase, DXY, dominancia), explique em poucas palavras.",
  "Responda APENAS com um JSON valido com estes campos: title, excerpt, cover_emoji, teaser_md, body_md.",
  "- title: chamada curta e atraente da edicao (sem aspas, ~6-10 palavras).",
  "- excerpt: 1 frase (max 160 caracteres) para SEO/preview.",
  "- cover_emoji: UM emoji que represente o tema.",
  "- teaser_md: a ABERTURA publica (markdown) - 2 ou 3 paragrafos curtos + um topico de 'O que olhar', cortando ANTES da conclusao para dar gancho. Sem titulo grande.",
  "- body_md: a edicao COMPLETA em markdown, com estas secoes (use os titulos):",
  "    ## A semana em uma frase  (o quadro geral)",
  "    ## O que aconteceu  (variacao de BTC/ETH/SOL e o regime de gamma)",
  "    ## Onde esta o dinheiro  (Call/Put Wall, Zero Gamma, funding e fluxo institucional via premio Coinbase)",
  "    ## Macro  (DXY, correlacoes, Fear & Greed, dominancia do BTC quando houver)",
  "    ## O que observar na semana  (niveis-chave e cenarios NARRATIVOS e NAO direcionais)",
  "    ## Aviso  (informativo/educacional, nao e recomendacao de compra/venda)",
  "FUNDING (unidades): use os valores de funding JA convertidos para percent que o prompt fornece; NUNCA multiplique o CEX por 100.",
  "Proibido: recomendar compra/venda, prever preco-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere').",
  "Use apenas os dados fornecidos; se uma metrica vier ausente, diga que esta indisponivel neste ciclo e NUNCA invente numeros.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    excerpt: { type: "STRING" },
    cover_emoji: { type: "STRING" },
    teaser_md: { type: "STRING" },
    body_md: { type: "STRING" },
  },
  required: ["title", "excerpt", "cover_emoji", "teaser_md", "body_md"],
};

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

function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/\p{Diacritic}/gu, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Coerencia dos niveis de gamma: put wall <= spot <= call wall (com folga). Dados ralos
// (ex.: SOL via relay Bybit) as vezes invertem os niveis; nesse caso a IA nao deve cita-los.
function gammaReliable(g: Record<string, unknown> | undefined): boolean {
  if (!g) return false;
  const cw = Number(g.call_wall), pw = Number(g.put_wall), s = Number(g.spot_price);
  if (!isFinite(s) || s <= 0) return false;
  if (isFinite(cw) && isFinite(pw) && pw > cw) return false; // put acima do call (invertido)
  if (isFinite(pw) && pw > s * 1.03) return false; // put wall acima do spot
  if (isFinite(cw) && cw < s * 0.97) return false; // call wall abaixo do spot
  return true;
}

async function callGemini(model: string, key: string, system: string, user: string): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 8192,
    temperature: 0.7,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
  };
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

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

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
    const user = userData?.user;
    if (user) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (prof?.role === "admin") authorized = true;
    }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  // Idempotencia: nao gera se ja houve edicao automatica nos ultimos 6 dias.
  if (!force) {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await admin
      .from("newsletter_editions").select("slug")
      .eq("auto_generated", true).gte("published_at", sixDaysAgo).limit(1).maybeSingle();
    if (recent) return json(200, { skipped: true, reason: "edicao recente ja existe", slug: recent.slug });
  }

  // Dados da semana.
  const snaps: Record<string, unknown> = {};
  for (const a of ASSETS) {
    const { data: s } = await admin
      .from("market_snapshot").select("payload, ts")
      .eq("asset", a).order("ts", { ascending: false }).limit(1).maybeSingle();
    if (s) snaps[a] = s.payload;
  }
  if (!snaps.BTC) return json(503, { error: "Sem dados de mercado (BTC) para gerar a newsletter." });

  // Ativos cujo gamma saiu incoerente neste ciclo (a IA nao deve citar os niveis deles).
  const unreliableGamma = ASSETS.filter(
    (a) => snaps[a] && !gammaReliable((snaps[a] as Record<string, unknown>).gamma as Record<string, unknown> | undefined),
  );

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: btcPrev } = await admin
    .from("market_snapshot").select("payload, ts")
    .eq("asset", "BTC").lte("ts", weekAgo).order("ts", { ascending: false }).limit(1).maybeSingle();

  const [{ data: news }, { data: macroAssets }, { data: macroCorr }] = await Promise.all([
    admin.from("news_feed").select("title, source, assets")
      .gte("published_at", weekAgo).order("published_at", { ascending: false }).limit(14),
    admin.from("macro_assets").select("symbol, name, price, change_24h, change_7d").order("ts", { ascending: false }).limit(20),
    admin.from("macro_correlations").select("macro_symbol, corr_30d").eq("asset", "BTC").order("ts", { ascending: false }).limit(12),
  ]);

  const newsText = (news && news.length)
    ? news.map((n) => `- ${n.title} (${n.source ?? "?"})`).join("\n")
    : "Nenhuma noticia relevante na semana.";

  // Funding do BTC ja convertido p/ PERCENT (evita a IA tratar a unidade errada).
  const btc = snaps.BTC as Record<string, unknown>;
  const cexF = (btc?.derivatives as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;
  const onchF = (btc?.onchain_perps as Record<string, unknown> | undefined)?.funding_rate as number | null | undefined;

  const userMsg = [
    "Gere a edicao SEMANAL da newsletter de cripto a partir dos dados abaixo.",
    "Em cada snapshot: price.coinbase (institucional) vs price.binance/price.okx (varejo) tem volume e CVD; use o campo coinbase_premium.",
    unreliableGamma.length
      ? `ATENCAO: gamma POUCO CONFIAVEL neste ciclo para: ${unreliableGamma.join(", ")}. Para esses ativos NAO cite Call/Put Wall, Zero Gamma nem Max Pain; diga que os niveis estao indisponiveis/em revisao neste ciclo.`
      : "Gamma consistente para todos os ativos neste ciclo.",
    "FUNDING do BTC ja convertido para PERCENT (use exatamente; nao multiplique de novo):",
    `- CEX agregado (Coinalyze, 8h): ${cexF == null ? "indisponivel" : cexF.toFixed(4) + "%"}`,
    `- Onchain (Hyperliquid, 1h): ${onchF == null ? "indisponivel" : (onchF * 100).toFixed(4) + "%"}`,
    "",
    "Snapshots atuais por ativo (JSON):",
    JSON.stringify(snaps),
    "",
    "Snapshot do BTC de ~7 dias atras (para a variacao da semana; pode faltar se o historico for curto):",
    btcPrev ? JSON.stringify(btcPrev.payload) : "indisponivel (historico < 7 dias)",
    "",
    "Macro (ativos + correlacoes 30d do BTC):",
    JSON.stringify({
      assets: dedupeBy((macroAssets as Record<string, unknown>[]) ?? [], "symbol"),
      correlations: dedupeBy((macroCorr as Record<string, unknown>[]) ?? [], "macro_symbol"),
    }),
    "",
    "Noticias da semana:",
    newsText,
  ].join("\n");

  // Geracao (Gemini).
  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  if (!aiResp.ok && usedModel !== FALLBACK_MODEL) {
    console.error(`modelo ${usedModel} falhou (${aiResp.status}) - fallback ${FALLBACK_MODEL}`);
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(usedModel, GEMINI_KEY, SYSTEM_PROMPT, userMsg);
  }
  if (!aiResp.ok) {
    const detail = await aiResp.text();
    return json(502, { error: "Falha ao gerar newsletter", detail: detail.slice(0, 300) });
  }

  const aiData = await aiResp.json();
  const parts = aiData.candidates?.[0]?.content?.parts ?? [];
  const raw = parts.map((p: { text?: string }) => p.text ?? "").join("").trim();
  let parsed: { title?: string; excerpt?: string; cover_emoji?: string; teaser_md?: string; body_md?: string };
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    return json(502, { error: "Resposta da IA nao e JSON valido", detail: raw.slice(0, 300) });
  }
  const title = (parsed.title ?? "").trim();
  const bodyMd = (parsed.body_md ?? "").trim();
  if (title.length < 5 || bodyMd.length < 200) {
    return json(502, { error: "Conteudo gerado insuficiente; nada publicado." });
  }

  // Slug unico + insert publicado.
  let slug = slugify(title);
  const { data: clash } = await admin.from("newsletter_editions").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${new Date().toISOString().slice(0, 10)}`.slice(0, 70);

  const { error: insErr } = await admin.from("newsletter_editions").insert({
    slug,
    title,
    excerpt: (parsed.excerpt ?? "").trim().slice(0, 200),
    teaser_md: (parsed.teaser_md ?? "").trim(),
    body_md: bodyMd,
    cover_emoji: (parsed.cover_emoji ?? "\u{1F4CA}").trim().slice(0, 8) || "\u{1F4CA}",
    min_tier: "free",
    published: true,
    published_at: new Date().toISOString(),
    auto_generated: true,
  });
  if (insErr) return json(500, { error: "Falha ao gravar a edicao", detail: insErr.message });

  return json(200, { ok: true, slug, title, model_used: usedModel });
});
