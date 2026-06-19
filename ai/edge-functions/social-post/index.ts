// Edge Function: social-post
// Gera o "read institucional do BTC" do dia via Gemini e publica no Telegram e/ou X.
// Credenciais e o flag de auto-post vivem em public.app_secrets (configurados pelo /admin).
// Chamadas:
//   - cron diario (x-cron-key): so posta se social_autopost = 'on' e houver credenciais.
//   - admin (JWT): { preview: true } gera sem postar; { force: true } gera e posta agora.
// Deploy: supabase functions deploy social-post --no-verify-jwt | Secret: GEMINI_API_KEY
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMARY_MODEL = "gemini-2.5-pro";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SYSTEM_PROMPT = [
  "Voce e o social media do OrbeView, um cockpit institucional de cripto. Escreve posts curtos, magneticos e uteis para Crypto Twitter (X) e Telegram, em portugues brasileiro.",
  "Responda APENAS com um JSON valido: { tweet, telegram_text }.",
  "- tweet: ATE 270 caracteres. Use emojis, cite 2-3 dados/niveis-chave do BTC, traga 1 insight curto e afiado, inclua hashtags (#Bitcoin #BTC #cripto) e termine com o link orbeview.com. SEM markdown.",
  "- telegram_text: versao mais completa. Use emojis e *negrito* SOMENTE nos niveis-chave (Call Wall, Put Wall, Zero Gamma, Max Pain). Inclua preco, regime de gamma, funding, Fear & Greed e premio Coinbase; 1-2 linhas de leitura; termine com o link orbeview.com. NAO use _ (underscore) nem outros simbolos de markdown alem de *negrito*.",
  "FUNDING ja vem em percent: use exatamente; nao multiplique.",
  "Se o prompt disser que o gamma esta POUCO CONFIAVEL, NAO cite Call/Put Wall, Zero Gamma nem Max Pain.",
  "Proibido: recomendar compra/venda, dar preco-alvo, usar linguagem de certeza (prefira 'tende a', 'historicamente', 'sugere'). NUNCA invente numeros: se um dado faltar, omita.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: { tweet: { type: "STRING" }, telegram_text: { type: "STRING" } },
  required: ["tweet", "telegram_text"],
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Gamma coerente? put wall <= spot <= call wall (com folga).
function gammaReliable(g: Record<string, unknown> | undefined): boolean {
  if (!g) return false;
  const cw = num(g.call_wall), pw = num(g.put_wall), s = num(g.spot_price);
  if (s == null || s <= 0) return false;
  if (cw != null && pw != null && pw > cw) return false;
  if (pw != null && pw > s * 1.03) return false;
  if (cw != null && cw < s * 0.97) return false;
  return true;
}

async function callGemini(model: string, key: string, user: string): Promise<Response> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: 4096,
    temperature: 0.8,
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
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig,
      }),
    },
  );
}

// ---- Telegram ----
async function postTelegram(token: string, chatId: string, text: string) {
  const send = (payload: Record<string, unknown>) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  let r = await send({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: false });
  if (!r.ok) r = await send({ chat_id: chatId, text }); // fallback sem markdown
  return { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 300) };
}

// ---- X (Twitter) OAuth 1.0a ----
function pe(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
async function hmacSha1(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function postTweet(text: string, c: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }) {
  const url = "https://api.twitter.com/2/tweets";
  const oauth: Record<string, string> = {
    oauth_consumer_key: c.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: c.accessToken,
    oauth_version: "1.0",
  };
  // Corpo JSON nao entra na assinatura (so os parametros oauth).
  const paramStr = Object.keys(oauth).sort().map((k) => `${pe(k)}=${pe(oauth[k])}`).join("&");
  const base = `POST&${pe(url)}&${pe(paramStr)}`;
  const signature = await hmacSha1(`${pe(c.apiSecret)}&${pe(c.accessSecret)}`, base);
  const all = { ...oauth, oauth_signature: signature };
  const header = "OAuth " + Object.keys(all).sort().map((k) => `${pe(k)}="${pe(all[k])}"`).join(", ");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 300) };
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
  const preview = body?.preview === true;
  const force = body?.force === true;

  // Segredos (app_secrets)
  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;

  // Autorizacao: cron (x-cron-key) OU admin (JWT).
  let authorized = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && secrets["newsletter_cron_key"] && cronKey === secrets["newsletter_cron_key"]) authorized = true;
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

  // Cron so posta com auto-post ligado.
  if (!preview && !force && (secrets["social_autopost"] ?? "off") !== "on") {
    return json(200, { skipped: "auto-post desligado" });
  }

  // Dados do BTC (+ ETH/SOL para contexto).
  const { data: snap } = await admin
    .from("market_snapshot").select("payload").eq("asset", "BTC").order("ts", { ascending: false }).limit(1).maybeSingle();
  if (!snap) return json(503, { error: "sem dados de mercado (BTC)" });
  const btc = (snap.payload ?? {}) as Record<string, unknown>;
  const gamma = (btc.gamma ?? {}) as Record<string, unknown>;
  const reliable = gammaReliable(gamma);
  const cexF = num((btc.derivatives as Record<string, unknown> | undefined)?.funding_rate);
  const fng = (btc.sentiment ?? {}) as Record<string, unknown>;

  const others: Record<string, number | null> = {};
  for (const a of ["ETH", "SOL"]) {
    const { data: s } = await admin
      .from("market_snapshot").select("payload").eq("asset", a).order("ts", { ascending: false }).limit(1).maybeSingle();
    others[a] = num(((s?.payload as Record<string, unknown> | undefined)?.gamma as Record<string, unknown> | undefined)?.spot_price);
  }

  const userMsg = [
    "Dados do BTC agora (gere o read institucional do dia):",
    `- Preco BTC: US$ ${num(gamma.spot_price) ?? "indisponivel"}`,
    `- Regime de gamma: ${gamma.regime ?? "indisponivel"}`,
    reliable
      ? `- Niveis: Call Wall ${gamma.call_wall}, Put Wall ${gamma.put_wall}, Zero Gamma ${gamma.zero_gamma_level}, Max Pain ${gamma.max_pain}`
      : "- Gamma POUCO CONFIAVEL neste ciclo: NAO cite Call/Put Wall, Zero Gamma nem Max Pain.",
    `- Funding CEX (8h, ja em percent): ${cexF == null ? "indisponivel" : cexF.toFixed(4) + "%"}`,
    `- Premio Coinbase: ${btc.coinbase_premium ?? "indisponivel"}`,
    `- Fear & Greed: ${fng.fng_value ?? "indisponivel"} (${fng.classification ?? "?"})`,
    `- ETH: US$ ${others.ETH ?? "indisponivel"} | SOL: US$ ${others.SOL ?? "indisponivel"}`,
  ].join("\n");

  // Geracao
  let usedModel = PRIMARY_MODEL;
  let aiResp = await callGemini(PRIMARY_MODEL, GEMINI_KEY, userMsg);
  if (!aiResp.ok) {
    usedModel = FALLBACK_MODEL;
    aiResp = await callGemini(FALLBACK_MODEL, GEMINI_KEY, userMsg);
  }
  if (!aiResp.ok) return json(502, { error: "falha na IA", detail: (await aiResp.text()).slice(0, 300) });
  const aiData = await aiResp.json();
  const raw = (aiData.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  let parsed: { tweet?: string; telegram_text?: string };
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    return json(502, { error: "IA nao retornou JSON", detail: raw.slice(0, 300) });
  }
  const tweet = (parsed.tweet ?? "").trim();
  const telegram = (parsed.telegram_text ?? "").trim();
  if (tweet.length < 10 || telegram.length < 10) return json(502, { error: "conteudo insuficiente" });

  if (preview) return json(200, { preview: true, tweet, telegram_text: telegram, model_used: usedModel });

  // Publicar
  const result: Record<string, unknown> = {};
  let postedTelegram = false;
  let postedX = false;

  if (secrets["telegram_bot_token"] && secrets["telegram_channel_id"]) {
    const r = await postTelegram(secrets["telegram_bot_token"], secrets["telegram_channel_id"], telegram);
    result.telegram = r;
    postedTelegram = r.ok;
  } else {
    result.telegram = { skipped: "sem credenciais" };
  }

  if (secrets["x_api_key"] && secrets["x_api_secret"] && secrets["x_access_token"] && secrets["x_access_secret"]) {
    const r = await postTweet(tweet, {
      apiKey: secrets["x_api_key"], apiSecret: secrets["x_api_secret"],
      accessToken: secrets["x_access_token"], accessSecret: secrets["x_access_secret"],
    });
    result.x = r;
    postedX = r.ok;
  } else {
    result.x = { skipped: "sem credenciais" };
  }

  await admin.from("social_posts").insert({
    tweet, telegram_md: telegram, posted_x: postedX, posted_telegram: postedTelegram, result,
  });

  return json(200, { ok: true, posted_telegram: postedTelegram, posted_x: postedX, model_used: usedModel, result });
});
