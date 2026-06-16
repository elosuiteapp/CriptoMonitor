import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Relay da Farside (ETFs spot). O coletor (httpx) toma 403 do Cloudflare da Farside;
// o fetch do Deno aqui tem outro fingerprint TLS e passa. Proxy puro: busca a página
// e devolve o HTML pro coletor parsear. Pública (verify_jwt=false), igual ao bybit-relay.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const coin = (url.searchParams.get("coin") || "btc").toLowerCase();
  if (coin !== "btc" && coin !== "eth") {
    return new Response(JSON.stringify({ error: "coin deve ser btc|eth" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const r = await fetch(`https://farside.co.uk/${coin}/`, {
      headers: {
        "User-Agent": UA,
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://farside.co.uk/",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Upstream-Status": String(r.status),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
