// Edge Function: asaas-webhook (BRL)
// Recebe eventos do Asaas e atualiza `subscriptions`. Ative o webhook no painel do
// Asaas apontando para esta URL e (recomendado) configure um token de acesso.
// Deploy: supabase functions deploy asaas-webhook --no-verify-jwt
// Secrets: ASAAS_WEBHOOK_TOKEN (opcional, recomendado).
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

  // Autenticidade: Asaas envia o token configurado no header asaas-access-token.
  if (WEBHOOK_TOKEN && req.headers.get("asaas-access-token") !== WEBHOOK_TOKEN) {
    return new Response("token inválido", { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const event = String((body as { event?: string }).event ?? "");
  const payment = (body as { payment?: Record<string, unknown> }).payment ?? {};
  const subscription = (body as { subscription?: Record<string, unknown> }).subscription ?? {};
  const extRef = String((payment.externalReference ?? subscription.externalReference ?? "") as string);
  const [userId, planSlug = "pro"] = extRef.split(":");
  if (!userId) return new Response(JSON.stringify({ ignored: "sem externalReference" }), { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const activate = event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED";
  const pastDue = event === "PAYMENT_OVERDUE";
  const cancel = event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED" || event === "PAYMENT_REFUNDED";

  if (activate) {
    const { data: plan } = await admin.from("plans").select("id").eq("slug", planSlug).single();
    if (!plan) return new Response("plano inválido", { status: 400 });
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", userId).eq("status", "active");
    await admin.from("subscriptions").insert({
      user_id: userId,
      plan_id: plan.id,
      status: "active",
      gateway: "asaas",
      gateway_customer_id: String(payment.customer ?? subscription.customer ?? ""),
      gateway_subscription_id: String(payment.subscription ?? subscription.id ?? ""),
      current_period_end: periodEnd,
    });
    return new Response(JSON.stringify({ ok: true, user: userId, plan: planSlug }), { status: 200 });
  }

  if (pastDue) {
    await admin.from("subscriptions").update({ status: "past_due" }).eq("user_id", userId).eq("status", "active");
  } else if (cancel) {
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", userId).eq("status", "active");
  }
  return new Response(JSON.stringify({ ok: true, event }), { status: 200 });
});
