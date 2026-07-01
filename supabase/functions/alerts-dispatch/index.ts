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
//          ALERTS_COOLDOWN_MIN (opcional, default 30),
//          RESEND_API_KEY + ALERTS_FROM_EMAIL (opcionais — habilitam e-mail no Expert).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const COOLDOWN_MIN = Number(Deno.env.get("ALERTS_COOLDOWN_MIN") ?? "30");

interface AlertRow {
  id: string;
  user_id: string;
  asset: string;
  metric: string; // 'price' | 'funding' | 'gamma_regime'
  condition: { op?: string; value?: number; equals?: string };
  module: string | null; // crypto | b3 | forex — isolamento de módulos
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

  // E-mail é opcional e exclusivo do Expert (opt-in por usuário). Sem RESEND_API_KEY
  // configurado, simplesmente não envia — o in-app/push seguem normais.
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ALERTS_FROM_EMAIL") ?? "OrbeView <alertas@orbeview.com>";
  const emailReady = Boolean(resendKey);

  // Resolve (com cache) o destinatário de e-mail de um usuário: só quando ele optou
  // (profiles.email_alerts) E o plano ativo inclui o canal 'email' (Expert).
  const emailCache: Record<string, string | null> = {};
  async function emailTarget(userId: string): Promise<string | null> {
    if (userId in emailCache) return emailCache[userId];
    let target: string | null = null;
    const { data: prof } = await admin
      .from("profiles")
      .select("email_alerts")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.email_alerts) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("plans(alert_channels)")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      const channels: string[] = ((sub?.plans as { alert_channels?: string[] } | null)?.alert_channels) ?? [];
      if (channels.includes("email")) {
        const { data: u } = await admin.auth.admin.getUserById(userId);
        target = u?.user?.email ?? null;
      }
    }
    emailCache[userId] = target;
    return target;
  }

  // E-mail simples e legível do disparo (HTML mínimo, marca OrbeView).
  function emailHtml(title: string, body: string): string {
    return `<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <div style="font-weight:700;color:#6366f1;font-size:18px;margin-bottom:16px">OrbeView</div>
      <div style="border:1px solid #e5e7eb;border-radius:14px;padding:20px">
        <div style="font-weight:600;font-size:16px;color:#111827">${title}</div>
        <div style="margin-top:8px;color:#374151;font-size:14px">${body}</div>
        <a href="https://app.orbeview.com/alerts" style="display:inline-block;margin-top:16px;background:#6366f1;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px">Abrir no OrbeView →</a>
      </div>
      <div style="color:#9ca3af;font-size:11px;margin-top:14px">Você recebe este e-mail porque ativou alertas por e-mail no plano Expert. Desative no painel de alertas.</div>
    </div>`;
  }

  const { data: alerts } = await admin
    .from("alerts")
    .select("id, user_id, asset, metric, condition, module, last_triggered_at")
    .eq("active", true);
  if (!alerts?.length) {
    return new Response(JSON.stringify({ evaluated: 0 }), { status: 200 });
  }

  const now = Date.now();
  const cooldownMs = COOLDOWN_MIN * 60 * 1000;
  const snapByAsset: Record<string, Record<string, any>> = {};
  let fired = 0;
  let pushed = 0;
  let emailed = 0;

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
      module: alert.module ?? "crypto",
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

    // 3) E-mail (Expert + opt-in) — camada opcional por cima do in-app/push.
    if (emailReady) {
      const to = await emailTarget(alert.user_id);
      if (to) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: fromEmail, to, subject: `OrbeView · ${title}`, html: emailHtml(title, body) }),
          });
          if (res.ok) emailed++;
        } catch {
          // falha de e-mail não bloqueia o disparo (in-app/push já foram entregues)
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ evaluated: alerts.length, fired, pushed, emailed, push_ready: pushReady, email_ready: emailReady }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
