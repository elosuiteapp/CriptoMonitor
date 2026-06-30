// Edge Function: okx-bot
// Robô de trade PESSOAL/admin no modo DEMO da OKX (x-simulated-trading: 1). Uso isolado
// do SaaS — só admin (JWT com profiles.role='admin'). As chaves da OKX demo vivem em
// public.app_secrets (okx_api_key/secret/passphrase), nunca no front.
// Ações (body.action): 'balance' | 'positions' | 'ticker' | 'order'.
// Deploy: supabase functions deploy okx-bot
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OKX_BASE = "https://www.okx.com";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function hmacSha256B64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

interface Creds { key: string; secret: string; passphrase: string }

/** Chamada assinada à OKX no ambiente DEMO (sempre x-simulated-trading: 1). */
async function okx(method: "GET" | "POST", path: string, bodyObj: Record<string, unknown> | null, c: Creds) {
  const ts = new Date().toISOString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const sign = await hmacSha256B64(c.secret, ts + method + path + body);
  const r = await fetch(OKX_BASE + path, {
    method,
    headers: {
      "OK-ACCESS-KEY": c.key,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase,
      "x-simulated-trading": "1",
      "Content-Type": "application/json",
    },
    body: body || undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { httpStatus: r.status, ...j } as Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Autorização: só admin (JWT com profiles.role = 'admin').
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "nao autorizado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "acesso restrito ao admin" });

  // Credenciais da OKX demo (app_secrets).
  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;
  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  // 'ticker' é público (não precisa de chave); o resto exige credenciais.
  if (action !== "ticker" && (!creds.key || !creds.secret || !creds.passphrase)) {
    return json(400, { error: "Chaves da OKX demo não configuradas. Salve key, secret e passphrase no painel." });
  }

  try {
    if (action === "balance") {
      const r = await okx("GET", "/api/v5/account/balance", null, creds);
      return json(200, r);
    }
    if (action === "positions") {
      const r = await okx("GET", "/api/v5/account/positions", null, creds);
      return json(200, r);
    }
    if (action === "ticker") {
      const instId = String(body?.instId ?? "BTC-USDT");
      const r = await okx("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, null, creds);
      return json(200, r);
    }
    if (action === "order") {
      const instId = String(body?.instId ?? "");
      const side = String(body?.side ?? "");
      const ordType = String(body?.ordType ?? "market");
      const tdMode = String(body?.tdMode ?? "cash");
      const sz = String(body?.sz ?? "");
      const px = body?.px != null ? String(body.px) : undefined;
      if (!instId || !side || !sz) return json(400, { error: "Informe instId, side e tamanho (sz)." });
      const orderBody: Record<string, unknown> = { instId, tdMode, side, ordType, sz };
      if (ordType === "limit" && px) orderBody.px = px;
      const r = await okx("POST", "/api/v5/trade/order", orderBody, creds);
      const ok = String((r.code as string) ?? "") === "0";
      await admin.from("bot_orders").insert({ action: "order", inst_id: instId, side, ord_type: ordType, sz, px: px ?? null, ok, result: r });
      return json(200, r);
    }
    return json(400, { error: "ação inválida" });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha ao falar com a OKX" });
  }
});
