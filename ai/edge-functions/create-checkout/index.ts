// Edge Function: create-checkout (PRD §7.2)
// Cria uma preferência de pagamento no Mercado Pago para o plano escolhido e
// devolve a URL de checkout (init_point). O retorno do pagamento é tratado pela
// função payment-webhook.
//
// Deploy: supabase functions deploy create-checkout
// Secrets: MERCADOPAGO_ACCESS_TOKEN, APP_URL (URL pública do frontend).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!MP_TOKEN) return json(500, { error: "MERCADOPAGO_ACCESS_TOKEN não configurada" });

  const appUrl = Deno.env.get("APP_URL") ?? req.headers.get("origin") ?? "https://example.com";
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Autenticação
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });

  const { plan_slug } = await req.json().catch(() => ({ plan_slug: "" }));
  if (!["pro", "expert"].includes(plan_slug)) {
    return json(400, { error: "plano inválido" });
  }

  const { data: plan } = await admin
    .from("plans")
    .select("name, price_cents")
    .eq("slug", plan_slug)
    .single();
  if (!plan) return json(400, { error: "plano não encontrado" });

  // Cria a preferência no Mercado Pago
  const prefResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        title: `Crypto Monitor — ${plan.name}`,
        quantity: 1,
        unit_price: plan.price_cents / 100,
        currency_id: "BRL",
      }],
      external_reference: user.id,
      metadata: { plan_slug },
      payer: { email: user.email },
      back_urls: {
        success: `${appUrl}/?checkout=sucesso`,
        failure: `${appUrl}/pricing?checkout=falha`,
        pending: `${appUrl}/pricing?checkout=pendente`,
      },
      auto_return: "approved",
      notification_url: `${SUPABASE_URL}/functions/v1/payment-webhook`,
    }),
  });

  if (!prefResp.ok) {
    const detail = await prefResp.text();
    return json(502, { error: "Falha ao criar checkout", detail: detail.slice(0, 300) });
  }
  const pref = await prefResp.json();
  return json(200, { init_point: pref.init_point ?? pref.sandbox_init_point });
});
