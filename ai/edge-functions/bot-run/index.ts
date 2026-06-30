// Edge Function: bot-run
// Loop AUTOMÁTICO do robô OKX demo (v2). pg_cron a cada 5 min (x-cron-key) ou admin (JWT, force).
// Estratégia = cruzamento de EMAs (rápida × lenta). CAPITAL EM USDT: o robô controla a
// PRÓPRIA posição (compra ~order_quote_sz USDT de BTC e revende só essa parte) — ignora
// saldos pré-existentes (ex.: o 1 BTC de brinde do demo). Sempre demo (x-simulated-trading).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
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

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = async (level: string, message: string, detail: Record<string, unknown> = {}) => {
    try { await admin.from("bot_logs").insert({ level, message, detail }); } catch (_e) { /* */ }
  };

  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;

  let authorized = false, forced = false;
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
  if (!cfg.enabled && !forced) return json(200, { skipped: "robo desligado" });

  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };
  if (!creds.key || !creds.secret || !creds.passphrase) {
    await log("error", "Sem credenciais da OKX demo.");
    return json(400, { error: "sem credenciais" });
  }

  try {
    // 1) Sinal por cruzamento de EMAs (velas fechadas).
    const candlesRes = await okx("GET", `/api/v5/market/candles?instId=${encodeURIComponent(cfg.inst_id)}&bar=${cfg.bar}&limit=200`, null, creds);
    const rows = ((candlesRes.data as string[][]) ?? []).filter((r) => r[8] === "1").reverse();
    if (rows.length < cfg.ema_slow + 2) {
      await log("warn", "Velas insuficientes para o sinal.", { have: rows.length });
      return json(200, { skipped: "velas insuficientes" });
    }
    const closes = rows.map((r) => Number(r[4]));
    const lastPx = closes[closes.length - 1];
    const fast = ema(closes, cfg.ema_fast);
    const slow = ema(closes, cfg.ema_slow);
    const desired: "long" | "flat" = fast > slow ? "long" : "flat";

    // 2) Posição do PRÓPRIO robô (estado no banco), não o saldo da carteira.
    const pos: "long" | "flat" = cfg.position === "long" ? "long" : "flat";
    const sigDetail = { inst: cfg.inst_id, bar: cfg.bar, fast: +fast.toFixed(2), slow: +slow.toFixed(2), desired, position: pos, lastPx, entry: cfg.entry_px };

    // 3) Decisão.
    let act: { side: "buy" | "sell"; sz: string } | null = null;
    if (desired === "long" && pos === "flat") act = { side: "buy", sz: String(cfg.order_quote_sz) }; // compra X USDT de BTC
    else if (desired === "flat" && pos === "long" && Number(cfg.pos_base_sz) > 0) act = { side: "sell", sz: String(cfg.pos_base_sz) }; // vende o que comprou

    if (!act) {
      await log("info", pos === "long" ? "Segurou comprado (sinal de alta)." : "Fora do mercado (sinal de baixa).", sigDetail);
      return json(200, { decision: "hold", ...sigDetail });
    }
    if (!cfg.enabled) {
      await log("info", `Preview: ${act.side === "buy" ? "compraria" : "venderia"} ${act.sz} (robô desligado).`, sigDetail);
      return json(200, { decision: "preview", action: act, ...sigDetail });
    }

    // 4) Executa (mercado, spot demo).
    const ordRes = await okx("POST", "/api/v5/trade/order", { instId: cfg.inst_id, tdMode: "cash", side: act.side, ordType: "market", sz: act.sz }, creds);
    const ok = String(ordRes.code ?? "") === "0";
    const ordId = (ordRes.data as { ordId?: string }[])?.[0]?.ordId;

    // 5) Preço/qtd executados.
    let avgPx: number | null = null, fillSz: number | null = null;
    if (ok && ordId) {
      const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(cfg.inst_id)}&ordId=${ordId}`, null, creds);
      const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0];
      avgPx = d?.avgPx ? Number(d.avgPx) : null;
      fillSz = d?.accFillSz ? Number(d.accFillSz) : null;
    }

    // 6) Atualiza o estado da posição do robô + PnL realizado na venda.
    let pnl: number | null = null;
    if (ok && act.side === "buy") {
      const baseSz = fillSz ?? Number(cfg.order_quote_sz) / lastPx;
      await admin.from("bot_config").update({ position: "long", pos_base_sz: baseSz, entry_px: avgPx ?? lastPx }).eq("id", 1);
    } else if (ok && act.side === "sell") {
      if (cfg.entry_px) pnl = ((avgPx ?? lastPx) - Number(cfg.entry_px)) * Number(cfg.pos_base_sz);
      await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1);
    }

    await admin.from("bot_orders").insert({
      source: "auto", action: "order", inst_id: cfg.inst_id, side: act.side, ord_type: "market",
      sz: act.sz, avg_px: avgPx, fill_sz: fillSz, ok, result: ordRes,
      note: act.side === "sell" && pnl != null ? `EMA ${cfg.ema_fast}/${cfg.ema_slow} → flat · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : `EMA ${cfg.ema_fast}/${cfg.ema_slow} → ${desired}`,
    });
    await log(ok ? "trade" : "error", `${act.side === "buy" ? "COMPRA" : "VENDA"} ${ok ? "executada" : "falhou"} · ${act.sz} ${cfg.inst_id}${avgPx ? ` @ ${avgPx}` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}.`, { ...sigDetail, ordId, code: ordRes.code, msg: ordRes.msg });
    return json(200, { decision: act.side, ok, avgPx, pnl, ...sigDetail });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
