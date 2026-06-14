// Edge Function: payment-webhook (PRD §7.2)
// Recebe a notificação do Mercado Pago, valida a assinatura (x-signature),
// consulta o pagamento e atualiza a tabela `subscriptions`.
//
// Deploy: supabase functions deploy payment-webhook --no-verify-jwt
// (o MP não envia JWT do Supabase; a autenticidade vem da assinatura HMAC).
// Secrets: MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET.
//
// Premissas (ajustar conforme o checkout da Fase 5):
//   · external_reference do pagamento = user_id do Supabase;
//   · metadata.plan_slug = 'pro' | 'expert'.
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validSignature(secret: string, manifest: string, v1: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  return hex(sig) === v1;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const MP_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  if (!MP_TOKEN || !MP_SECRET) {
    return new Response("gateway não configurado", { status: 500 });
  }

  const url = new URL(req.url);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dataId = url.searchParams.get("data.id") ?? (body as { data?: { id?: string } }).data?.id;

  // 1. Validação da assinatura (x-signature: "ts=...,v1=...")
  const sigHeader = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts: Record<string, string> = {};
  for (const piece of sigHeader.split(",")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  if (!parts.v1 || !(await validSignature(MP_SECRET, manifest, parts.v1))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  // 2. Consulta o pagamento no Mercado Pago
  if (!dataId) return new Response("sem data.id", { status: 400 });
  const payResp = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  });
  if (!payResp.ok) return new Response("falha ao consultar pagamento", { status: 502 });
  const payment = await payResp.json();

  // 3. Só ativa em pagamento aprovado
  if (payment.status !== "approved") {
    return new Response(JSON.stringify({ ignored: payment.status }), { status: 200 });
  }

  const userId = payment.external_reference as string | undefined;
  const planSlug = (payment.metadata?.plan_slug as string | undefined) ?? "pro";
  if (!userId) return new Response("sem external_reference", { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: plan } = await admin.from("plans").select("id").eq("slug", planSlug).single();
  if (!plan) return new Response("plano inválido", { status: 400 });

  // 4. Atualiza/cria a assinatura ativa (período de 30 dias)
  const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", userId).eq("status", "active");
  await admin.from("subscriptions").insert({
    user_id: userId,
    plan_id: plan.id,
    status: "active",
    gateway_customer_id: String(payment.payer?.id ?? ""),
    gateway_subscription_id: String(payment.id ?? ""),
    current_period_end: periodEnd,
  });

  return new Response(JSON.stringify({ ok: true, user: userId, plan: planSlug }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
