// Edge Function: alerts-dispatch (PRD §9 Fase 5 — esqueleto)
// Avalia os alertas ativos contra o snapshot mais recente e dispara por e-mail
// (Resend, Pro) e WhatsApp (Evolution, Expert). Inclui alerta de virada de
// regime de gamma.
//
// SEGURANÇA: por padrão roda em DRY_RUN (não envia nada — apenas registra o que
// enviaria). Defina ALERTS_DRY_RUN=false para disparar de verdade.
//
// Invocação: via cron (pg_cron / Supabase scheduled) com a service_role.
// Secrets: RESEND_API_KEY, ALERTS_FROM_EMAIL, EVOLUTION_API_URL, EVOLUTION_API_KEY,
//          EVOLUTION_INSTANCE, ALERTS_DRY_RUN.
import { createClient } from "npm:@supabase/supabase-js@2";

const DRY_RUN = (Deno.env.get("ALERTS_DRY_RUN") ?? "true") !== "false";

interface AlertRow {
  id: string;
  user_id: string;
  asset: string;
  metric: string; // 'price' | 'funding' | 'gamma_regime'
  condition: { op?: string; value?: number; equals?: string };
  channel: "email" | "whatsapp";
}

/** Extrai o valor da métrica a partir do payload do snapshot. */
function metricValue(metric: string, payload: Record<string, any>): number | string | null {
  switch (metric) {
    case "price":
      return payload?.price?.binance?.price ?? payload?.gamma?.spot_price ?? null;
    case "funding":
      return payload?.derivatives?.funding_rate ?? null;
    case "gamma_regime":
      return payload?.gamma?.regime ?? null;
    default:
      return null;
  }
}

function triggered(alert: AlertRow, value: number | string | null): boolean {
  if (value == null) return false;
  const c = alert.condition ?? {};
  if (typeof value === "string") return c.equals != null && value === c.equals;
  if (c.value == null) return false;
  switch (c.op) {
    case ">":
      return value > c.value;
    case "<":
      return value < c.value;
    case ">=":
      return value >= c.value;
    case "<=":
      return value <= c.value;
    default:
      return false;
  }
}

async function sendEmail(to: string, subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("ALERTS_FROM_EMAIL");
  if (DRY_RUN || !key || !from) {
    console.log(`[dry-run email] → ${to}: ${subject}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
}

async function sendWhatsApp(phone: string, text: string) {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  if (DRY_RUN || !url || !key || !instance) {
    console.log(`[dry-run whatsapp] → ${phone}: ${text.slice(0, 60)}`);
    return;
  }
  await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ number: phone, text }),
  });
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: alerts } = await admin.from("alerts").select("*").eq("active", true);
  if (!alerts?.length) return new Response(JSON.stringify({ evaluated: 0 }), { status: 200 });

  // Cache de snapshots por ativo
  const snapByAsset: Record<string, Record<string, any>> = {};
  let fired = 0;

  for (const alert of alerts as AlertRow[]) {
    if (!snapByAsset[alert.asset]) {
      const { data } = await admin
        .from("market_snapshot")
        .select("payload")
        .eq("asset", alert.asset)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      snapByAsset[alert.asset] = data?.payload ?? {};
    }
    const value = metricValue(alert.metric, snapByAsset[alert.asset]);
    if (!triggered(alert, value)) continue;

    const msg = `Crypto Monitor · ${alert.asset}: alerta de ${alert.metric} atingido (valor ${value}).`;
    if (alert.channel === "email") {
      const { data: profile } = await admin.from("profiles").select("id").eq("id", alert.user_id).maybeSingle();
      const { data: authUser } = await admin.auth.admin.getUserById(alert.user_id);
      const email = authUser?.user?.email;
      if (email && profile) await sendEmail(email, `Alerta ${alert.asset}`, msg);
    } else {
      const { data: profile } = await admin.from("profiles").select("phone").eq("id", alert.user_id).maybeSingle();
      if (profile?.phone) await sendWhatsApp(profile.phone, msg);
    }
    fired++;
  }

  return new Response(JSON.stringify({ evaluated: alerts.length, fired, dry_run: DRY_RUN }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
