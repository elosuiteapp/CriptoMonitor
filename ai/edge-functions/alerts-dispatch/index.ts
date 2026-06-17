// Edge Function: alerts-dispatch (notificação in-app + Web Push)
// Avalia os alertas ativos contra o snapshot mais recente. Quando um dispara:
//   1) grava uma linha em `notifications` (in-app: sino, central, toast via Realtime);
//   2) envia Web Push para os navegadores inscritos do usuário (chega com o app fechado).
//
// Anti-spam: cada alerta tem um cooldown (last_triggered_at). Enquanto a condição
// segue verdadeira, NÃO re-notifica antes da janela de silêncio expirar.
//
// Invocação: via cron (pg_cron + pg_net) a cada 5 min. Protegida por DISPATCH_SECRET
// (header x-dispatch-secret). Deploy: supabase functions deploy alerts-dispatch --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, DISPATCH_SECRET,
//          ALERTS_COOLDOWN_MIN (opcional, default 30).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const COOLDOWN_MIN = Number(Deno.env.get("ALERTS_COOLDOWN_MIN") ?? "30");

interface AlertRow {
  id: string;
  user_id: string;
  asset: string;
  metric: string; // 'price' | 'funding' | 'gamma_regime'
  condition: { op?: string; value?: number; equals?: string };
  last_triggered_at: string | null;
}

const METRIC_LABEL: Record<string, string> = {
  price: "Preço",
  funding: "Funding",
  gamma_regime: "Regime de gamma",
};

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
    case ">": return value > c.value;
    case "<": return value < c.value;
    case ">=": return value >= c.value;
    case "<=": return value <= c.value;
    default: return false;
  }
}

/** Texto legível do disparo (título + corpo). */
function describe(alert: AlertRow, value: number | string): { title: string; body: string } {
  const label = METRIC_LABEL[alert.metric] ?? alert.metric;
  const c = alert.condition ?? {};
  if (alert.metric === "gamma_regime") {
    return {
      title: `${alert.asset} · regime de gamma`,
      body: `O regime de gamma do ${alert.asset} virou ${value}.`,
    };
  }
  const cond = `${c.op === "<" ? "abaixo de" : "acima de"} ${c.value}${alert.metric === "funding" ? "%" : ""}`;
  const shown = alert.metric === "price" ? `US$ ${value}` : `${value}${alert.metric === "funding" ? "%" : ""}`;
  return {
    title: `${alert.asset} · ${label} ${cond}`,
    body: `${label} do ${alert.asset} está em ${shown}.`,
  };
}

Deno.serve(async (req) => {
  // Autenticidade: só o cron (ou um admin com o segredo) pode acionar.
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (secret && req.headers.get("x-dispatch-secret") !== secret) {
    return new Response("forbidden", { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // VAPID é opcional: sem ele, o in-app (notifications) ainda funciona; só não envia push.
  const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@backhub.com.br";
  const pushReady = Boolean(vapidPub && vapidPriv);
  if (pushReady) webpush.setVapidDetails(vapidSubject, vapidPub!, vapidPriv!);

  const { data: alerts } = await admin
    .from("alerts")
    .select("id, user_id, asset, metric, condition, last_triggered_at")
    .eq("active", true);
  if (!alerts?.length) {
    return new Response(JSON.stringify({ evaluated: 0 }), { status: 200 });
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_MIN * 60 * 1000;
  const snapByAsset: Record<string, Record<string, any>> = {};
  let fired = 0;
  let pushed = 0;

  for (const alert of alerts as AlertRow[]) {
    // Cooldown: não re-notifica enquanto a janela de silêncio não expirou.
    if (alert.last_triggered_at && now - new Date(alert.last_triggered_at).getTime() < cooldownMs) {
      continue;
    }

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

    const { title, body } = describe(alert, value as number | string);

    // 1) in-app — grava a notificação (dispara o Realtime no front)
    await admin.from("notifications").insert({
      user_id: alert.user_id,
      alert_id: alert.id,
      title,
      body,
      asset: alert.asset,
      metric: alert.metric,
      value: String(value),
    });
    // marca o cooldown
    await admin.from("alerts").update({ last_triggered_at: new Date().toISOString() }).eq("id", alert.id);
    fired++;

    // 2) Web Push — para todos os navegadores inscritos do usuário
    if (pushReady) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", alert.user_id);
      const payload = JSON.stringify({ title, body, url: "/alerts", tag: `alert-${alert.id}` });
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          pushed++;
        } catch (err) {
          // Inscrição expirada/cancelada → remove para não tentar de novo.
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await admin.from("push_subscriptions").delete().eq("id", s.id);
          }
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ evaluated: alerts.length, fired, pushed, push_ready: pushReady }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
