// Edge Function: asaas-checkout (BRL — público PT)
// Cria/recupera o cliente no Asaas, abre uma ASSINATURA mensal e devolve a URL da
// fatura (invoiceUrl) para redirecionar. O retorno é tratado por asaas-webhook.
// Deploy: supabase functions deploy asaas-checkout
// Secrets: ASAAS_API_KEY (obrigatória), ASAAS_BASE_URL (opcional; default produção).
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
  const KEY = Deno.env.get("ASAAS_API_KEY");
  if (!KEY) return json(500, { error: "Pagamento em configuração (ASAAS_API_KEY ausente)." });
  const BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api.asaas.com/v3";
  const ah = { access_token: KEY, "Content-Type": "application/json" };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json(401, { error: "não autenticado" });

  const { plan_slug, cycle: cycleIn } = await req.json().catch(() => ({ plan_slug: "" }));
  if (!["pro", "expert"].includes(plan_slug)) return json(400, { error: "plano inválido" });
  const cycle = cycleIn === "annual" ? "annual" : "monthly";

  const { data: plan } = await admin.from("plans").select("name, price_cents").eq("slug", plan_slug).single();
  if (!plan) return json(400, { error: "plano não encontrado" });

  const { data: prof } = await admin.from("profiles").select("full_name, cpf").eq("id", user.id).maybeSingle();
  const name = (prof?.full_name as string) || user.email?.split("@")[0] || "Cliente";
  const cpf = String((prof?.cpf as string) ?? "").replace(/\D/g, "");
  // Asaas exige CPF/CNPJ no cliente. Sem isso, pede pra completar o perfil.
  if (cpf.length !== 11 && cpf.length !== 14) {
    return json(200, {
      code: "cpf_required",
      error: "Informe seu CPF no perfil (menu do seu nome → Editar perfil) para assinar em reais.",
    });
  }

  // 1) Cliente Asaas (reusa pelo externalReference = user.id)
  let customerId: string | undefined;
  const find = await fetch(`${BASE}/customers?externalReference=${user.id}`, { headers: ah });
  if (find.ok) customerId = (await find.json())?.data?.[0]?.id;
  if (!customerId) {
    const c = await fetch(`${BASE}/customers`, {
      method: "POST",
      headers: ah,
      body: JSON.stringify({ name, email: user.email, cpfCnpj: cpf, externalReference: user.id }),
    });
    if (!c.ok) return json(502, { error: "Falha ao criar cliente Asaas", detail: (await c.text()).slice(0, 300) });
    customerId = (await c.json()).id;
  }

  // 1b) UMA assinatura por cliente: cancela assinaturas Asaas ativas anteriores antes
  //     de abrir a nova. Sem isso, trocar de plano (upgrade/downgrade) deixaria a
  //     assinatura antiga cobrando em paralelo (cobrança dupla).
  try {
    const ex = await fetch(`${BASE}/subscriptions?customer=${customerId}`, { headers: ah });
    if (ex.ok) {
      const list = (await ex.json())?.data ?? [];
      for (const old of list) {
        if (old?.id && old?.status === "ACTIVE") {
          await fetch(`${BASE}/subscriptions/${old.id}`, { method: "DELETE", headers: ah });
        }
      }
    }
  } catch (_) { /* não bloqueia a nova assinatura */ }

  // 2) Assinatura. externalReference carrega user.id:plan_slug:cycle para o webhook
  //    saber quem ativar, em qual plano e por quanto tempo. Anual = 12 meses com 30%
  //    OFF de lançamento. Manter ANNUAL_DISCOUNT em sincronia com o Pricing.tsx
  //    (preço exibido == preço cobrado).
  const ANNUAL_DISCOUNT = 0.30;
  const monthly = plan.price_cents / 100;
  const value = cycle === "annual" ? Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT)) : monthly;
  const asaasCycle = cycle === "annual" ? "YEARLY" : "MONTHLY";
  const cycleLabel = cycle === "annual" ? "anual" : "mensal";

  // Forma de pagamento por ciclo:
  //   · MENSAL  → CREDIT_CARD apenas. Mensalidade é recorrência real e só o cartão
  //     de crédito renova/cobra automaticamente; Pix/boleto exigiriam pagamento
  //     manual a cada mês e a assinatura venceria (churn involuntário).
  //   · ANUAL   → UNDEFINED (cliente escolhe Pix/boleto/cartão na fatura): a fricção
  //     de renovação é uma vez por ano e o Pix tem taxa menor para o lojista.
  const billingType = cycle === "annual" ? "UNDEFINED" : "CREDIT_CARD";

  const today = new Date().toISOString().slice(0, 10);
  const s = await fetch(`${BASE}/subscriptions`, {
    method: "POST",
    headers: ah,
    body: JSON.stringify({
      customer: customerId,
      billingType,
      value,
      nextDueDate: today,
      cycle: asaasCycle,
      description: `OrbeView — ${plan.name} (${cycleLabel})`,
      externalReference: `${user.id}:${plan_slug}:${cycle}`,
    }),
  });
  if (!s.ok) return json(502, { error: "Falha ao criar assinatura Asaas", detail: (await s.text()).slice(0, 300) });
  const sub = await s.json();

  // 3) URL da primeira fatura para redirecionar
  const pay = await fetch(`${BASE}/payments?subscription=${sub.id}&limit=1`, { headers: ah });
  const url = pay.ok ? (await pay.json())?.data?.[0]?.invoiceUrl : null;
  if (!url) return json(502, { error: "Assinatura criada, mas sem link de pagamento." });
  return json(200, { url });
});
