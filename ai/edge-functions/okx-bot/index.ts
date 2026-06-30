// Edge Function: okx-bot
// Robô de trade PESSOAL/admin no modo DEMO da OKX (x-simulated-trading: 1). Uso isolado
// do SaaS — só admin (JWT com profiles.role='admin'). As chaves da OKX demo vivem em
// public.app_secrets (okx_api_key/secret/passphrase), nunca no front.
// Ações (body.action): 'balance' | 'positions' | 'ticker' | 'candles' | 'order' | 'close' | 'cancel'.
// Futuros (instId -SWAP): 'order' aceita quoteSz (USDT→contratos), reduceOnly; 'close' fecha a
// posição do robô (reduceOnly) e zera o bot_config; 'cancel' cancela ordem pendente por ordId.
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
    if (action === "candles") {
      const instId = String(body?.instId ?? "BTC-USDT");
      const bar = String(body?.bar ?? "1H");
      const limit = String(body?.limit ?? "200");
      const r = await okx("GET", `/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${limit}`, null, creds);
      return json(200, r);
    }
    if (action === "order") {
      const instId = String(body?.instId ?? "");
      const side = String(body?.side ?? "");
      const ordType = String(body?.ordType ?? "market");
      const isSwap = instId.toUpperCase().endsWith("-SWAP");
      const tdMode = String(body?.tdMode ?? (isSwap ? "cross" : "cash"));
      const px = body?.px != null ? String(body.px) : undefined;
      const reduceOnly = body?.reduceOnly === true;
      let sz = String(body?.sz ?? "");
      // Futuros: tamanho informado em USDT (nocional) → converte p/ nº de contratos.
      if (isSwap && body?.quoteSz != null && String(body.quoteSz).trim() !== "") {
        const usdt = Number(body.quoteSz);
        const tk = await okx("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, null, creds);
        const last = Number((tk.data as { last?: string }[])?.[0]?.last) || (px ? Number(px) : 0);
        const inst = await okx("GET", `/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`, null, creds);
        const spec = ((inst.data as Record<string, string>[]) ?? [])[0] ?? {};
        const ctVal = Number(spec.ctVal) || 0.01, lotSz = Number(spec.lotSz) || 0.1, minSz = Number(spec.minSz) || 0.1;
        const dec = (String(lotSz).split(".")[1] || "").length;
        let contracts = last > 0 ? Math.floor((usdt / (last * ctVal)) / lotSz) * lotSz : 0;
        if (contracts < minSz) contracts = minSz;
        sz = contracts.toFixed(dec);
      }
      if (!instId || !side || !sz) return json(400, { error: "Informe instId, side e tamanho." });
      const orderBody: Record<string, unknown> = { instId, tdMode, side, ordType, sz };
      if (ordType === "limit" && px) orderBody.px = px;
      if (isSwap && reduceOnly) orderBody.reduceOnly = true;
      const r = await okx("POST", "/api/v5/trade/order", orderBody, creds);
      const ok = String((r.code as string) ?? "") === "0";
      const ordId = (r.data as { ordId?: string }[])?.[0]?.ordId;
      // Preço médio de execução (pra marcar no gráfico/histórico).
      let avgPx: number | null = null, fillSz: number | null = null;
      if (ok && ordId) {
        const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(instId)}&ordId=${ordId}`, null, creds);
        const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0];
        avgPx = d?.avgPx ? Number(d.avgPx) : null;
        fillSz = d?.accFillSz ? Number(d.accFillSz) : null;
      }
      await admin.from("bot_orders").insert({ source: "manual", action: "order", inst_id: instId, side, ord_type: ordType, sz, px: px ?? null, avg_px: avgPx, fill_sz: fillSz, ok, result: r });
      return json(200, r);
    }
    if (action === "close") {
      // Fecha a posição atual do robô (reduceOnly a mercado) e zera o bot_config.
      const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
      if (!cfg || cfg.position === "flat" || !Number(cfg.pos_base_sz)) return json(200, { closed: false, note: "sem posição aberta" });
      const instId = cfg.inst_id as string;
      const isSwap = instId.toUpperCase().endsWith("-SWAP");
      const closeSide = cfg.position === "long" ? "sell" : "buy";
      const orderBody: Record<string, unknown> = { instId, tdMode: isSwap ? cfg.mgn_mode : "cash", side: closeSide, ordType: "market", sz: String(cfg.pos_base_sz), ...(isSwap ? { reduceOnly: true } : {}) };
      const r = await okx("POST", "/api/v5/trade/order", orderBody, creds);
      const ok = String((r.code as string) ?? "") === "0";
      const ordId = (r.data as { ordId?: string }[])?.[0]?.ordId;
      let avgPx: number | null = null, fillSz: number | null = null;
      if (ok && ordId) { const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(instId)}&ordId=${ordId}`, null, creds); const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0]; avgPx = d?.avgPx ? Number(d.avgPx) : null; fillSz = d?.accFillSz ? Number(d.accFillSz) : null; }
      if (!ok) { await admin.from("bot_orders").insert({ source: "manual", action: "close", inst_id: instId, side: closeSide, ord_type: "market", sz: String(cfg.pos_base_sz), ok: false, result: r }); return json(200, r); }
      let pnl: number | null = null;
      if (cfg.entry_px) {
        let ctVal = 1;
        if (isSwap) { const inst = await okx("GET", `/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(instId)}`, null, creds); ctVal = Number(((inst.data as Record<string, string>[]) ?? [])[0]?.ctVal) || 0.01; }
        pnl = ((avgPx ?? 0) - Number(cfg.entry_px)) * Number(cfg.pos_base_sz) * ctVal * (cfg.position === "long" ? 1 : -1);
      }
      await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1);
      await admin.from("bot_orders").insert({ source: "manual", action: "close", inst_id: instId, side: closeSide, ord_type: "market", sz: String(cfg.pos_base_sz), avg_px: avgPx, fill_sz: fillSz, ok: true, result: r, note: `fechada manualmente${pnl != null ? ` · PnL ${pnl.toFixed(2)}` : ""}` });
      await admin.from("bot_logs").insert({ level: "trade", message: `Posição ${cfg.position} fechada manualmente${avgPx ? ` @ ${avgPx}` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}.`, detail: { ordId } });
      return json(200, { ...r, closed: true, pnl });
    }
    if (action === "cancel") {
      // Cancela uma ordem pendente (ex.: limite que não executou) na OKX.
      const instId = String(body?.instId ?? "");
      const ordId = String(body?.ordId ?? "");
      if (!instId || !ordId) return json(400, { error: "Informe instId e ordId." });
      const r = await okx("POST", "/api/v5/trade/cancel-order", { instId, ordId }, creds);
      return json(200, r);
    }
    return json(400, { error: "ação inválida" });
  } catch (e) {
    return json(502, { error: e instanceof Error ? e.message : "falha ao falar com a OKX" });
  }
});
