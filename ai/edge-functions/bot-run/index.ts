// Edge Function: bot-run (v3) — robô OKX demo com estratégia de FLUXO & MICROESTRUTURA.
// Lê o snapshot do mercado (book, paredes, gamma, funding, CVD, liquidações, ETF, prêmio
// Coinbase, stablecoins, Fear&Greed), pontua cada sinal (-100..+100 × peso), soma num viés
// líquido + convicção e decide comprar/vender/segurar. Guarda a "leitura" (raciocínio) em
// bot_config.last_reading. Capital em USDT, posição própria, sempre demo (x-simulated-trading).
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
    headers: { "OK-ACCESS-KEY": c.key, "OK-ACCESS-SIGN": sign, "OK-ACCESS-TIMESTAMP": ts, "OK-ACCESS-PASSPHRASE": c.passphrase, "x-simulated-trading": "1", "Content-Type": "application/json" },
    body: body || undefined,
  });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}
const clamp = (v: number) => Math.max(-100, Math.min(100, v));
const N = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

interface Signal { key: string; group: string; label: string; score: number; weight: number; note: string }

/** Motor de confluência de fluxo — pontua cada sinal de microestrutura/fluxo/opções. */
function computeReading(p: any, imb: any[], walls: any[], spot: number) {
  const sig: Signal[] = [];
  const add = (key: string, group: string, label: string, weight: number, score: number, note: string) =>
    sig.push({ key, group, label, weight, score: Math.round(clamp(score)), note });
  const der = p?.derivatives ?? {}, g = p?.gamma ?? {}, sent = p?.sentiment ?? {}, liq = p?.liquidity ?? {}, etf = p?.etf_flows ?? {}, px = p?.price ?? {};

  // ── Microestrutura: book (institucional = Coinbase wide; varejo = Binance+OKX near) ──
  const byEx: Record<string, any> = {};
  for (const r of imb) if (!byEx[r.exchange]) byEx[r.exchange] = r;
  const cb = byEx["coinbase"];
  if (cb) {
    const bid = Number(cb.bid_wide_usd || cb.bid_near_usd || 0), ask = Number(cb.ask_wide_usd || cb.ask_near_usd || 0);
    if (bid + ask > 0) { const r = (bid - ask) / (bid + ask); add("book_inst", "Microestrutura", "Book institucional (Coinbase)", 0.16, r * 150, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((bid / (bid + ask)) * 100)}% bid`); }
  }
  let rbid = 0, rask = 0;
  for (const ex of ["binance", "okx"]) { const r = byEx[ex]; if (r) { rbid += Number(r.bid_near_usd || 0); rask += Number(r.ask_near_usd || 0); } }
  if (rbid + rask > 0) { const r = (rbid - rask) / (rbid + rask); add("book_retail", "Microestrutura", "Book varejo (Binance+OKX)", 0.08, r * 140, `${r >= 0 ? "comprador" : "vendedor"} · ${Math.round((rbid / (rbid + rask)) * 100)}% bid`); }

  // Paredes: suporte (bids abaixo) × resistência (asks acima), por "pull" = tamanho/distância.
  if (spot > 0 && walls.length) {
    const agg: Record<string, number> = {};
    for (const w of walls) { const k = w.side + ":" + Math.round(Number(w.price)); agg[k] = (agg[k] || 0) + Number(w.notional_usd || 0); }
    let supPull = 0, resPull = 0, supPx = 0, resPx = 0, supN = 0, resN = 0;
    for (const k in agg) {
      const [side, pstr] = k.split(":"); const price = Number(pstr), n = agg[k];
      const distPct = Math.abs(price - spot) / spot * 100;
      if (distPct > 5) continue;
      const pull = n / Math.max(distPct, 0.15);
      if (side === "bid" && price < spot && pull > supPull) { supPull = pull; supPx = price; supN = n; }
      if (side === "ask" && price > spot && pull > resPull) { resPull = pull; resPx = price; resN = n; }
    }
    if (supPull > 0 || resPull > 0) {
      const r = (supPull - resPull) / (supPull + resPull || 1);
      add("walls", "Microestrutura", "Paredes (suporte × resistência)", 0.16, r * 110, `sup ${supPx ? "$" + Math.round(supPx / 1000) + "k (" + (supN / 1e6).toFixed(1) + "M)" : "—"} × res ${resPx ? "$" + Math.round(resPx / 1000) + "k (" + (resN / 1e6).toFixed(1) + "M)" : "—"}`);
    }
  }

  // ── Fluxo de derivativos ──
  let netCvd = 0, haveCvd = false;
  for (const ex of ["binance", "okx", "coinbase"]) { const v = N(px?.[ex]?.cvd); if (v != null) { netCvd += v; haveCvd = true; } }
  if (haveCvd) add("cvd", "Fluxo", "CVD (delta de volume)", 0.08, (netCvd / 300000) * 60, `${netCvd >= 0 ? "compra" : "venda"} líquida ${Math.round(netCvd / 1000)}k`);
  const f = N(der.funding_rate);
  if (f != null) add("funding", "Fluxo", "Funding (contrário)", 0.08, -(f / 0.03) * 60, `${f >= 0 ? "longs pagam" : "shorts pagam"} ${f.toFixed(4)}%`);
  const ls = N(der.long_short_ratio);
  if (ls != null && ls > 0) add("ls", "Fluxo", "Long/Short (contrário)", 0.07, -Math.log(ls) * 45, ls < 1 ? `shorts lotados (${ls.toFixed(2)})` : `longs lotados (${ls.toFixed(2)})`);
  const ll = N(der.liq_long_usd) ?? 0, lsh = N(der.liq_short_usd) ?? 0;
  if (ll + lsh > 0) add("liqs", "Fluxo", "Liquidações", 0.06, ((lsh - ll) / (ll + lsh)) * 90, ll > lsh ? `cascata de longs ($${(ll / 1e6).toFixed(1)}M)` : `cascata de shorts ($${(lsh / 1e6).toFixed(1)}M)`);

  // ── Opções / gamma ──
  const pw = N(g.put_wall), cw = N(g.call_wall);
  if (pw != null && cw != null && cw > pw && spot > 0) {
    const posPct = (spot - pw) / (cw - pw);
    add("gamma", "Opções", "Posição vs Put/Call Wall", 0.10, (0.5 - posPct) * 120, `${Math.round(posPct * 100)}% entre Put $${Math.round(pw / 1000)}k e Call $${Math.round(cw / 1000)}k · ${g.regime === "negative" ? "γ− amplifica" : "γ+ gruda"}`);
  }
  const pc = N(g.put_call_ratio);
  if (pc != null && pc > 0) add("pc", "Opções", "Put/Call (posicionamento)", 0.05, (1 - pc) * 70, pc < 1 ? `calls dominam (${pc.toFixed(2)})` : `puts dominam (${pc.toFixed(2)})`);

  // ── Institucional ──
  const cbp = N(p?.coinbase_premium);
  if (cbp != null) add("cb_prem", "Institucional", "Prêmio Coinbase", 0.08, cbp * 100 * 60, `${cbp >= 0 ? "+" : ""}${(cbp * 100).toFixed(3)}%`);
  const ef = N(etf.net_flow_usd), streak = N(etf.streak_days);
  if (ef != null) add("etf", "Institucional", "Fluxo de ETF", 0.10, (ef / 300e6) * 70, `${ef >= 0 ? "entrada" : "saída"} $${Math.abs(ef / 1e6).toFixed(0)}M${streak != null ? ` · ${streak}d` : ""}`);
  const sc = N(liq.stablecoin_chg_7d_pct);
  if (sc != null) add("stables", "Institucional", "Liquidez stablecoins (7d)", 0.05, sc * 40, `${sc >= 0 ? "+" : ""}${sc.toFixed(2)}%`);

  // ── Sentimento (contrário) ──
  const fng = N(sent.fng_value);
  if (fng != null) add("fng", "Sentimento", "Fear & Greed (contrário)", 0.07, (50 - fng) * 1.8, `${fng} (${sent.classification ?? ""})`);

  let num = 0, den = 0;
  for (const x of sig) { num += x.score * x.weight; den += x.weight; }
  const bias = den ? Math.round(clamp(num / den)) : 0;
  const voting = sig.filter((x) => Math.abs(x.score) > 8);
  const agree = voting.filter((x) => Math.sign(x.score) === Math.sign(bias)).length;
  const conviction = voting.length ? Math.round((agree / voting.length) * 100) : 0;
  return { bias, conviction, signals: sig };
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
    if (u) { const { data: prof } = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle(); if (prof?.role === "admin") { authorized = true; forced = true; } }
  }
  if (!authorized) return json(401, { error: "nao autorizado" });

  const { data: cfg } = await admin.from("bot_config").select("*").eq("id", 1).maybeSingle();
  if (!cfg) return json(500, { error: "sem config" });
  if (!cfg.enabled && !forced) return json(200, { skipped: "robo desligado" });

  const creds: Creds = { key: secrets.okx_api_key ?? "", secret: secrets.okx_api_secret ?? "", passphrase: secrets.okx_api_passphrase ?? "" };
  if (!creds.key || !creds.secret || !creds.passphrase) { await log("error", "Sem credenciais da OKX demo."); return json(400, { error: "sem credenciais" }); }

  try {
    const base = cfg.base_ccy;
    // Dados de fluxo (coletados pela plataforma).
    const [{ data: snap }, { data: imbRows }, { data: wallRows }] = await Promise.all([
      admin.from("market_snapshot").select("payload, ts").eq("asset", base).order("ts", { ascending: false }).limit(1).maybeSingle(),
      admin.from("orderbook_imbalance").select("exchange, bid_near_usd, ask_near_usd, bid_wide_usd, ask_wide_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(30),
      admin.from("orderbook_walls").select("side, price, notional_usd, ts").eq("asset", base).order("ts", { ascending: false }).limit(80),
    ]);
    if (!snap?.payload) { await log("warn", `Sem snapshot de ${base} — robô aguardando dados.`); return json(200, { skipped: "sem dados de mercado" }); }

    // Preço atual (OKX, venue de execução) p/ proximidade das paredes e PnL.
    const tk = await okx("GET", `/api/v5/market/ticker?instId=${encodeURIComponent(cfg.inst_id)}`, null, creds);
    const lastPx = Number((tk.data as { last?: string }[])?.[0]?.last) || Number((snap.payload as any)?.gamma?.spot_price) || 0;

    const walls = (wallRows ?? []).filter((w) => w.ts === (wallRows ?? [])[0]?.ts); // só o último lote
    const { bias, conviction, signals } = computeReading(snap.payload, imbRows ?? [], walls, lastPx);

    const desired: "long" | "flat" | "neutral" = bias >= cfg.buy_threshold ? "long" : bias <= -cfg.sell_threshold ? "flat" : "neutral";
    const pos: "long" | "flat" = cfg.position === "long" ? "long" : "flat";

    let act: { side: "buy" | "sell"; sz: string } | null = null;
    if (desired === "long" && pos === "flat") act = { side: "buy", sz: String(cfg.order_quote_sz) };
    else if (desired === "flat" && pos === "long" && Number(cfg.pos_base_sz) > 0) act = { side: "sell", sz: String(cfg.pos_base_sz) };

    const decision = !cfg.enabled ? "preview" : act ? act.side : "hold";
    const reading = { bias, conviction, signals, spot: lastPx, desired, position: pos, ts: new Date().toISOString() };
    await admin.from("bot_config").update({ last_bias: bias, last_conviction: conviction, last_decision: decision, last_reading: reading, last_run: new Date().toISOString() }).eq("id", 1);

    const top = signals.slice().sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)).slice(0, 3).map((s) => `${s.label} ${s.score >= 0 ? "+" : ""}${s.score}`).join(", ");

    if (!act) { await log("info", `Leitura: viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%) → ${pos === "long" ? "segura comprado" : "fora"}. ${top}`, reading); return json(200, { decision: "hold", bias, conviction, signals }); }
    if (!cfg.enabled) { await log("info", `Preview: viés ${bias >= 0 ? "+" : ""}${bias} → ${act.side === "buy" ? "compraria" : "venderia"}. ${top}`, reading); return json(200, { decision: "preview", action: act, bias, conviction, signals }); }

    // Executa (mercado, spot demo).
    const ordRes = await okx("POST", "/api/v5/trade/order", { instId: cfg.inst_id, tdMode: "cash", side: act.side, ordType: "market", sz: act.sz }, creds);
    const ok = String(ordRes.code ?? "") === "0";
    const ordId = (ordRes.data as { ordId?: string }[])?.[0]?.ordId;
    let avgPx: number | null = null, fillSz: number | null = null;
    if (ok && ordId) {
      const det = await okx("GET", `/api/v5/trade/order?instId=${encodeURIComponent(cfg.inst_id)}&ordId=${ordId}`, null, creds);
      const d = (det.data as { avgPx?: string; accFillSz?: string }[])?.[0];
      avgPx = d?.avgPx ? Number(d.avgPx) : null; fillSz = d?.accFillSz ? Number(d.accFillSz) : null;
    }
    let pnl: number | null = null;
    if (ok && act.side === "buy") { const baseSz = fillSz ?? Number(cfg.order_quote_sz) / lastPx; await admin.from("bot_config").update({ position: "long", pos_base_sz: baseSz, entry_px: avgPx ?? lastPx }).eq("id", 1); }
    else if (ok && act.side === "sell") { if (cfg.entry_px) pnl = ((avgPx ?? lastPx) - Number(cfg.entry_px)) * Number(cfg.pos_base_sz); await admin.from("bot_config").update({ position: "flat", pos_base_sz: 0, entry_px: null }).eq("id", 1); }

    await admin.from("bot_orders").insert({ source: "auto", action: "order", inst_id: cfg.inst_id, side: act.side, ord_type: "market", sz: act.sz, avg_px: avgPx, fill_sz: fillSz, ok, result: ordRes, note: `viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%)${act.side === "sell" && pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}` });
    await log(ok ? "trade" : "error", `${act.side === "buy" ? "COMPRA" : "VENDA"} ${ok ? "executada" : "falhou"} · viés ${bias >= 0 ? "+" : ""}${bias} (conv ${conviction}%)${avgPx ? ` @ ${avgPx}` : ""}${pnl != null ? ` · PnL ${pnl.toFixed(2)} ${cfg.quote_ccy}` : ""}. ${top}`, { ...reading, ordId, code: ordRes.code, msg: ordRes.msg });
    return json(200, { decision: act.side, ok, bias, conviction, avgPx, pnl, signals });
  } catch (e) {
    await log("error", "Erro no loop do robô.", { error: e instanceof Error ? e.message : String(e) });
    return json(502, { error: e instanceof Error ? e.message : "falha" });
  }
});
