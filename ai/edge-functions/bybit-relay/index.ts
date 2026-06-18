// Edge Function: bybit-relay
// Ponte para Bybit e Binance (opções) — o Supabase (sa-east-1) alcança as duas, que
// bloqueiam a região do coletor (Railway US). Repassa apenas dados PÚBLICOS de mercado.
//   ?coin=SOL                     → tickers de opções da Bybit (gamma): IV+OI+spot por strike
//   ?coin=SOL&kind=trades         → trades de opções da Bybit (HIRO): side+IV+spot por trade
//   ?venue=binance&coin=BNB       → tickers de opções da Binance (gamma): IV+OI+spot por strike
//   ?venue=binance&kind=coverage  → cobertura (quantos strikes por moeda)
// verify_jwt=false; o gateway aceita sem apikey. Deploy: supabase functions deploy bybit-relay
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function jget(u: string): Promise<{ ok: boolean; status: number; body: any }> {
  const r = await fetch(u, { headers: { "User-Agent": "cm-relay/1.0" } });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const coin = (url.searchParams.get("coin") || "SOL").toUpperCase().replace(/[^A-Z]/g, "");
  const kind = (url.searchParams.get("kind") || "tickers").toLowerCase();
  const venue = (url.searchParams.get("venue") || "bybit").toLowerCase();
  try {
    // ─── Binance European Options ──────────────────────────────────────────────
    if (venue === "binance") {
      if (kind === "coverage") {
        const { ok, status, body } = await jget("https://eapi.binance.com/eapi/v1/exchangeInfo");
        const syms = (body?.optionSymbols as Record<string, string>[]) ?? [];
        const byUnderlying: Record<string, number> = {};
        for (const s of syms) {
          const u = String(s.underlying ?? "");
          byUnderlying[u] = (byUnderlying[u] ?? 0) + 1;
        }
        return json(ok ? 200 : 502, { venue, kind, status, total: syms.length, byUnderlying });
      }
      // tickers (gamma): IV (mark, todos os símbolos) + OI (por expiração mais próxima) + spot (index)
      const mk = await jget("https://eapi.binance.com/eapi/v1/mark");
      const marks = (Array.isArray(mk.body) ? mk.body : [])
        .filter((m: Record<string, string>) => String(m.symbol).startsWith(coin + "-"));
      const exps = [...new Set(marks.map((m: Record<string, string>) => String(m.symbol).split("-")[1]))].sort();
      const nearest = exps.slice(0, 6);
      const oi: Record<string, string> = {};
      const oiResults = await Promise.all(
        nearest.map((exp) => jget(`https://eapi.binance.com/eapi/v1/openInterest?underlyingAsset=${coin}&expiration=${exp}`)),
      );
      for (const r of oiResults) {
        for (const o of (Array.isArray(r.body) ? r.body : [])) oi[String(o.symbol)] = o.sumOpenInterest;
      }
      const idx = await jget(`https://eapi.binance.com/eapi/v1/index?underlying=${coin}USDT`);
      const u = idx.body?.indexPrice ?? null;
      const list = marks
        .filter((m: Record<string, string>) => oi[String(m.symbol)] != null)
        .map((m: Record<string, string>) => ({ s: m.symbol, iv: m.markIV, oi: oi[String(m.symbol)], u }));
      return json(mk.ok ? 200 : 502, { venue, coin, status: mk.status, count: list.length, exps: nearest, list });
    }

    // ─── Bybit ─────────────────────────────────────────────────────────────────
    // kind=trades: negociações recentes de opções (HIRO).
    if (kind === "trades") {
      const { ok, status, body } = await jget(
        `https://api.bybit.com/v5/market/recent-trade?category=option&baseCoin=${coin}&limit=1000`,
      );
      const raw = (body?.result?.list as Record<string, string>[]) ?? [];
      const list = raw.map((x) => ({ s: x.symbol, side: x.side, q: x.size, iv: x.iv, ip: x.iP, t: x.time }));
      return json(ok ? 200 : 502, { coin, kind, status, count: list.length, list });
    }

    // tickers (gamma): só os campos que o motor usa.
    const { ok, status, body } = await jget(
      `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${coin}`,
    );
    const list = ((body?.result?.list as Record<string, string>[]) ?? []).map((x) => ({
      s: x.symbol,
      iv: x.markIv,
      oi: x.openInterest,
      u: x.underlyingPrice,
    }));
    return json(ok ? 200 : 502, { coin, status, count: list.length, list });
  } catch (e) {
    return json(502, { coin, error: String(e) });
  }
});
