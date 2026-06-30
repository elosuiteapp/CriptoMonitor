// Edge Function: binance-bot
// Robô de trade PESSOAL/admin na BINANCE USDⓈ-M Futures TESTNET (testnet.binancefuture.com).
// Espelha a okx-bot, mas p/ a Binance (a OKX bloqueia derivativos p/ conta BR). Só admin
// (JWT profiles.role='admin'). Chaves em app_secrets (binance_test_key/secret), nunca no front.
// Ações: 'balance' | 'positions' | 'ticker' | 'candles' | 'order' | 'close' | 'cancel'.
// 'order' aceita quoteSz (USDT nocional → quantidade) e reduceOnly; 'close' fecha a posição do
// robô (reduceOnly) e zera o bot_config; 'cancel' cancela ordem pendente por orderId.
// Deploy: supabase functions deploy binance-bot
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BASE = "https://testnet.binancefuture.com";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
interface Creds { key: string; secret: string }
// deno-lint-ignore no-explicit-any
async function bnb(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string | number | boolean>, c: Creds, signed: boolean): Promise<any> {
  let qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  if (signed) { qs += (qs ? "&" : "") + "recvWindow=5000&timestamp=" + Date.now(); qs += "&signature=" + await hmacHex(c.secret, qs); }
  const r = await fetch(BASE + path + (qs ? "?" + qs : ""), { method, headers: { "X-MBX-APIKEY": c.key } });
  return await r.json().catch(() => ({}));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "metodo nao permitido" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Só admin.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "nao autorizado" });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return json(403, { error: "acesso restrito ao admin" });

  const { data: secretRows } = await admin.from("app_secrets").select("key, value");
  const secrets: Record<string, string> = {};
  for (const s of (secretRows as { key: string; value: string }[]) ?? []) secrets[s.key] = s.value;
  const creds: Creds = { key: secrets.binance_test_key ?? "", secret: secrets.binance_test_secret ?? "" };

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (action !== "ticker" && action !== "candles" && (!creds.key || !creds.secret)) {
    return json(400, { error: "Chaves da Binance testnet não configuradas. Salve key e secret no painel." });
  }

  try {
    if (action === "balance") {
      const r = await bnb("GET", "/fapi/v2/balance", {}, creds, true);
      const usdt = (Array.isArray(r) ? r : []).find((a: { asset?: string }) => a.asset === "USDT");
      return json(200, { data: [{ totalEq: usdt?.balance ?? "0", avail: usdt?.availableBalance ?? "0" }], raw: r });
    }
    if (action === "positions") {
      const symbol = String(body?.symbol ?? body?.instId ?? "BTCUSDT");
      const r = await bnb("GET", "/fapi/v2/positionRisk", { symbol }, creds, true);
      return json(200, { data: r });
    }
    if (action === "ticker") {
      const symbol = String(body?.symbol ?? body?.instId ?? "BTCUSDT");
      const r = await bnb("GET", "/fapi/v1/ticker/price", { symbol }, creds, false);
      return json(200, { data: [{ last: r?.price }] });
    }
    if (action === "candles") {
      const symbol = String(body?.instId ?? body?.symbol ?? "BTCUSDT");
      const interval = String(body?.bar ?? "15m").replace("1H", "1h").replace("4H", "4h").replace("1D", "1d");
      const limit = String(body?.limit ?? "200");
      const r = await bnb("GET", "/fapi/v1/klines", { symbol, interval, limit }, creds, false);
      // newest-first p/ casar com o reverse do front (que espera ordem da OKX).
      const data = (Array.isArray(r) ? r : []).slice().reverse();
      return json(200, { data });
    }
    if (action === "order") {
      const symbol = String(body?.instId ?? body?.symbol ?? "");
      const side = String(body?.side ?? "").toUpperCase(); // BUY | SELL
      const ordType = String(body?.ordType ?? "market").toUpperCase(); // MARKET | LIMIT
      const reduceOnly = body?.reduceOnly === true;
      const px = body?.px != null ? String(body.px) : undefined;
      let qty = body?.sz != null ? String(body.sz) : "";
      // tamanho em USDT (nocional) → quantidade na moeda base.
      if ((!qty || body?.quoteSz != null) && body?.quoteSz != null && String(body.quoteSz).trim() !== "") {
        const usdt = Number(body.quoteSz);
        const tk = await bnb("GET", "/fapi/v1/ticker/price", { symbol }, creds, false);
        const last = Number(tk?.price) || (px ? Number(px) : 0);
        const info = await bnb("GET", "/fapi/v1/exchangeInfo", {}, creds, false);
        const sym = ((info?.symbols as { symbol: string; filters: { filterType: string; stepSize?: string; minQty?: string; notional?: string }[] }[]) ?? []).find((s) => s.symbol === symbol);
        const lot = sym?.filters?.find((f) => f.filterType === "LOT_SIZE") ?? {};
        const stepSz = Number(lot.stepSize) || 0.001, minQty = Number(lot.minQty) || 0.001;
        const dec = String(stepSz).includes(".") ? String(stepSz).replace(/0+$/, "").split(".")[1].length : 0;
        let q = last > 0 ? Math.floor((usdt / last) / stepSz) * stepSz : 0;
        if (q < minQty) q = minQty;
        qty = q.toFixed(dec);
      }
      if (!symbol || !side || !qty) return json(400, { error: "Informe símbolo, lado e tamanho." });
      const params: Record<string, string | number | boolean> = { symbol, side, type: ordType, quantity: qty, newOrderRespType: "RESULT" };
      if (ordType === "LIMIT" && px) { params.price = px; params.timeInForce = "GTC"; }
      if (reduceOnly) params.reduceOnly = true;
      const r = await bnb("POST", "/fapi/v1/order", params, creds, true);
      const ok = !!r?.orderId && !r?.code;
      await admin.from("bot_orders").insert({ source: "manual", action: "order", inst_id: symbol, side: side.toLowerCase(), ord_type: ordType.toLowerCase(), sz: qty, px: px ?? null, avg_px: Number(r?.avgPrice) || null, fill_sz: Number(r?.executedQty) || null, ok, result: r });
      return json(200, r);
    }
    if (action === "close") {
      const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg || cfg.position === "flat" || !Number(cfg.pos_base_sz)) return json(200, { closed: false, note: "sem posição aberta" });
      const symbol = cfg.inst_id as string;
      const closeSide = cfg.position === "long" ? "SELL" : "BUY";
      const r = await bnb("POST", "/fapi/v1/order", { symbol, side: closeSide, type: "MARKET", quantity: String(cfg.pos_base_sz), reduceOnly: true, newOrderRespType: "RESULT" }, creds, true);
      const ok = !!r?.orderId && !r?.code;
      if (!ok) { await admin.from("bot_orders").insert({ source: "manual", action: "close", inst_id: symbol, side: closeSide.toLowerCase(), ord_type: "market", sz: String(cfg.pos_base_sz), ok: false, result: r }); return json(200, r); }
      const avgPx = Number(r?.avgPrice) || null;
      let pnl: number | null = null;
      if (cfg.entry_px && avgPx) pnl = (avgPx - Number(cfg.entry_px)) * Number(cfg.pos_base_sz) * (cfg.position === "long" ? 1 : -1);
      await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1);
      await admin.from("bot_orders").insert({ source: "manual", action: "close", inst_id: symbol, side: closeSide.toLowerCase(), ord_type: "market", sz: String(cfg.pos_base_sz), avg_px: avgPx, fill_sz: Number(r?.executedQty) || null, ok: true, result: r, note: `fechada manualmente${pnl != null ? ` · PnL ${pnl.toFixed(2)}` : ""}` });
      await admin.from("bot_logs").insert({ level: "trade", message: `Posição ${cfg.position} fechada manualmente${avgPx ? ` @ ${avgPx}` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}.`, detail: { orderId: r?.orderId } });
      return json(200, { ...r, closed: true, pnl });
    }
    if (action === "cancel") {
      const symbol = String(body?.instId ?? body?.symbol ?? "");
      const orderId = String(body?.ordId ?? body?.orderId ?? "");
      if (!symbol || !orderId) return json(400, { error: "Informe símbolo e orderId." });
      const r = await bnb("DELETE", "/fapi/v1/order", { symbol, orderId }, creds, true);
      return json(200, r);
    }
    return json(400, { error: "ação inválida" });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha ao falar com a Binance" });
  }
});
