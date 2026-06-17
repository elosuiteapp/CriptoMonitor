// Edge Function: paddle-webhook (USD — público internacional)
// Recebe eventos do Paddle Billing e atualiza `subscriptions`. Mapeia o price id
// (data.items[].price.id) → plano via plans.paddle_price_id, e o user via
// custom_data.user_id (enviado no checkout). Ativa quando a conta Paddle existir.
// Deploy: supabase functions deploy paddle-webhook --no-verify-jwt
// Secrets: PADDLE_WEBHOOK_SECRET (notification secret key do Paddle).
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function verify(secret: string, ts: string, raw: string, h1: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${raw}`));
  return hex(sig) === h1;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET");
  if (!SECRET) return new Response("Paddle não configurado", { status: 500 });

  const raw = await req.text();
  const header = req.headers.get("paddle-signature") ?? "";
  const parts: Record<string, string> = {};
  for (const piece of header.split(";")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  if (!parts.ts || !parts.h1 || !(await verify(SECRET, parts.ts, raw, parts.h1))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  const evt = JSON.parse(raw) as { event_type?: string; data?: Record<string, unknown> };
  const type = evt.event_type ?? "";
  const data = (evt.data ?? {}) as Record<string, unknown>;
  const uid = (data.custom_data as { user_id?: string } | undefined)?.user_id;
  if (!uid) return new Response(JSON.stringify({ ignored: "sem user_id" }), { status: 200 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const items = (data.items as { price?: { id?: string } }[] | undefined) ?? [];
  const priceId = items[0]?.price?.id;
  const status = String(data.status ?? "");

  const active = ["subscription.created", "subscription.activated", "subscription.updated"].includes(type) && status === "active";
  const cancel = type === "subscription.canceled" || status === "canceled";

  if (active) {
    if (!priceId) return new Response("sem price id", { status: 200 });
    const { data: plan } = await admin.from("plans").select("id").eq("paddle_price_id", priceId).maybeSingle();
    if (!plan) return new Response("price id não mapeado a um plano", { status: 200 });
    const ends = (data.current_billing_period as { ends_at?: string } | undefined)?.ends_at;
    const periodEnd = ends ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", uid).eq("status", "active");
    await admin.from("subscriptions").insert({
      user_id: uid,
      plan_id: plan.id,
      status: "active",
      gateway: "paddle",
      gateway_subscription_id: String(data.id ?? ""),
      current_period_end: periodEnd,
    });
    return new Response(JSON.stringify({ ok: true, user: uid }), { status: 200 });
  }
  if (cancel) {
    await admin.from("subscriptions").update({ status: "canceled" }).eq("user_id", uid).eq("status", "active");
  }
  return new Response(JSON.stringify({ ok: true, event: type }), { status: 200 });
});
