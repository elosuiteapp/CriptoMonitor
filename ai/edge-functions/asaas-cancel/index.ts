// Edge Function: asaas-cancel (cancelamento self-service da assinatura)
// O usuário cancela pelo app: removemos a assinatura no Asaas (não gera nova
// cobrança) e marcamos cancel_at_period_end=true. O acesso continua até o fim do
// período já pago (current_period_end) — current_plan_slug() respeita essa data.
// Deploy: supabase functions deploy asaas-cancel
// Secrets: ASAAS_API_KEY (mesma do checkout), ASAAS_BASE_URL (opcional).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "método não permitido" });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });

  // Assinatura ativa do usuário.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, gateway, gateway_subscription_id, current_period_end")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!sub) return json(200, { code: "no_active", message: "Você não tem uma assinatura ativa para cancelar." });

  // Asaas: remove a assinatura remota para interromper as próximas cobranças.
  if (sub.gateway === "asaas" && sub.gateway_subscription_id) {
    const KEY = Deno.env.get("ASAAS_API_KEY");
    if (!KEY) return json(500, { error: "Cancelamento em configuração (ASAAS_API_KEY ausente)." });
    const BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api.asaas.com/v3";
    const r = await fetch(`${BASE}/subscriptions/${sub.gateway_subscription_id}`, {
      method: "DELETE",
      headers: { access_token: KEY, "Content-Type": "application/json" },
    });
    // Se a assinatura já não existir no Asaas (404), seguimos: o objetivo é não cobrar mais.
    if (!r.ok && r.status !== 404) {
      return json(502, { error: "Falha ao cancelar no Asaas", detail: (await r.text()).slice(0, 300) });
    }
  }

  // Mantém o acesso até o fim do período pago; só marca que não renova.
  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
    .eq("id", sub.id);

  return json(200, { ok: true, current_period_end: sub.current_period_end });
});
