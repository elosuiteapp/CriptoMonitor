// Edge Function: bot-run
// Loop AUTOMÁTICO do robô OKX demo (v2). Roda por pg_cron a cada 5 min (x-cron-key) ou
// manualmente pelo admin (JWT, body.force). Estratégia inicial = cruzamento de EMAs
// (rápida × lenta), CIENTE DE POSIÇÃO: compra quando vira pra cima e está fora; vende
// quando vira pra baixo e está comprado. Sempre no modo DEMO (x-simulated-trading: 1).
// Deploy: supabase functions deploy bot-run --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const OKX_BASE = "https://www.okx.com";
const MIN_NOTIONAL = 5; // USDT — abaixo disso considera "sem posição" (poeira)

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function hmacSha256B64(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

interface Creds { key: string; secret: string; passphrase: string }
async function okx(method: "GET" | "POST", path: string, bodyObj: Record<string, unknown> | null, c: Creds) {
  const ts = new Date().toISOString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const sign = await hmacSha256B64(c.secret, ts + method + path + body);
  const r = await fetch(OKX_BASE + path, {
    method,
    headers: {
      "OK-ACCESS-KEY": c.key, "OK-ACCESS-SIGN": sign, "OK-ACCESS-TIMESTAMP": ts,
      "OK-ACCESS-PASSPHRASE": c.passphrase, "x-simulated-trading": "1", "Content-Type": "application/json",
    },
    body: body || undefined,
  });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Última EMA de uma série (semente = primeiro valor). */
function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const log = async (level: string, message: string, detail: Record<string, unknown> = {}) => {
    try { await admin.from("bot_logs").insert({ level, message, detail }); } catch (_e) { /* best-effort */ }
  };

  // Segredos + config.
  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;

  // Autorização: cron (x-cron-key) OU admin (JWT).
  let authorized = false;
  let forced = false;
  const cronKey = req.headers.get("x-cron-key");
  if (cronKey && secrets["newsletter_cron_key"] && cronKey === secrets["newsletter_cron_key"]) authorized = true;
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const u = userData?.user;
    if (u) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
      if (prof?.role === "admin") { authorized = true; forced = true; }
    }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return json(500, { error: "sem config" });

  // Cron só roda com o robô ligado; admin (force) pode rodar pra ver o sinal (preview).
  if (!cfg.enabled && !forced) return json(200, { skipped: "robo desligado" });

  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };
  if (!creds.key || !creds.secret || !creds.passphrase) {
    await log("error", "Sem credenciais da OKX demo.");
    return json(400, { error: "sem credenciais" });
  }

  try {
    // 1) Velas → sinal por cruzamento de EMAs (só velas fechadas).
    const candlesRes = await okx("GET", `/api/v5/market/candles?instId=${encodeURIComponent(cfg.inst_id)}&bar=${cfg.bar}&limit=200`, null, creds);
    const rows = ((candlesRes.data as string[][]) ?? []).filter((r) => r[8] === "1").reverse(); // oldest-first, confirmadas
    if (rows.length < cfg.ema_slow + 2) {
      await log("warn", "Velas insuficientes para o sinal.", { have: rows.length });
      return json(200, { skipped: "velas insuficientes" });
    }
    const closes = rows.map((r) => Number(r[4]));
    const lastPx = closes[closes.length - 1];
    const fast = ema(closes, cfg.ema_fast);
    const slow = ema(closes, cfg.ema_slow);
    const desired: "long" | "flat" = fast > slow ? "long" : "flat";

    // 2) Posição atual (saldo da moeda base).
    const balRes = await okx("GET", "/api/v5/account/balance", null, creds);
    const details = ((balRes.data as { details?: { ccy: string; availBal: string; eq: string }[] }[]) ?? [])[0]?.details ?? [];
    const baseDet = details.find((d) => d.ccy === cfg.base_ccy);
    const baseBal = Number(baseDet?.availBal ?? 0);
    const inPosition = baseBal * lastPx >= MIN_NOTIONAL;

    const sigDetail = { inst: cfg.inst_id, bar: cfg.bar, fast: +fast.toFixed(2), slow: +slow.toFixed(2), desired, inPosition, lastPx, baseBal };

    // 3) Decisão.
    let act: { side: "buy" | "sell"; sz: string } | null = null;
    if (desired === "long" && !inPosition) act = { side: "buy", sz: String(cfg.order_quote_sz) };
    else if (desired === "flat" && inPosition) act = { side: "sell", sz: String(baseBal) };

    if (!act) {
      await log("info", desired === "long" ? "Segurou comprado (sinal de alta, já posicionado)." : "Fora do mercado (sinal de baixa).", sigDetail);
      return json(200, { decision: "hold", ...sigDetail });
    }

    // Preview (admin rodando com robô desligado): não envia ordem.
    if (!cfg.enabled) {
      await log("info", `Preview: ${act.side === "buy" ? "compraria" : "venderia"} ${act.sz} ${cfg.inst_id} (robô desligado).`, sigDetail);
      return json(200, { decision: "preview", action: act, ...sigDetail });
    }

    // 4) Executa (mercado, spot demo).
    const orderBody = { instId: cfg.inst_id, tdMode: "cash", side: act.side, ordType: "market", sz: act.sz };
    const ordRes = await okx("POST", "/api/v5/trade/order", orderBody, creds);
    const ok = String(ordRes.code ?? "") === "0";
    const ordId = (ordRes.data as { ordId?: string }[])?.[0]?.ordId;

    // 5) Busca o preço médio de execução pra registrar/marcar no gráfico.
    let avgPx: number | null = null, fillSz: number | null = null;
    if (ok && ordId) {
      const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(cfg.inst_id)}&ordId=${ordId}`, null, creds);
      const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0];
      avgPx = d?.avgPx ? Number(d.avgPx) : null;
      fillSz = d?.accFillSz ? Number(d.accFillSz) : null;
    }
    await admin.from("bot_orders").insert({
      source: "auto", action: "order", inst_id: cfg.inst_id, side: act.side, ord_type: "market",
      sz: act.sz, avg_px: avgPx, fill_sz: fillSz, ok, result: ordRes,
      note: `EMA ${cfg.ema_fast}/${cfg.ema_slow} → ${desired}`,
    });
    await log(ok ? "trade" : "error", `${act.side === "buy" ? "COMPRA" : "VENDA"} ${ok ? "executada" : "falhou"} · ${act.sz} ${cfg.inst_id}${avgPx ? ` @ ${avgPx}` : ""}.`, { ...sigDetail, ordId, code: ordRes.code, msg: ordRes.msg });
    return json(200, { decision: act.side, ok, avgPx, ...sigDetail });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
