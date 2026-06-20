// Tipos das respostas das funções RPC de admin (sql/019_admin.sql).

export interface PlanDistribution {
  slug: string;
  name: string;
  count: number;
  mrr_cents: number;
  price_cents: number;
  price_usd_cents: number;
}

export interface GatewayDistribution {
  gateway: string; // mercadopago | asaas | paddle | manual
  count: number;
  mrr_cents: number;
}

export interface AdminOverview {
  users_total: number;
  users_today: number;
  users_7d: number;
  users_30d: number;
  subs_active: number;
  subs_paid_active: number;
  subs_canceled: number;
  subs_canceled_30d: number;
  subs_past_due: number;
  comp_active: number;
  comp_value_cents: number;
  mrr_cents: number;
  arr_cents: number;
  mrr_usd_cents: number;
  arr_usd_cents: number;
  ai_today: number;
  ai_30d: number;
  ai_total: number;
  alerts_active: number;
  plan_distribution: PlanDistribution[];
  gateway_distribution: GatewayDistribution[];
}

export interface SignupPoint {
  day: string;
  signups: number;
  cumulative: number;
}

export interface UsagePoint {
  day: string;
  analyses: number;
}

export interface ModelUsage {
  model_used: string;
  analyses: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  cpf: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
  plan_slug: string | null;
  plan_name: string | null;
  sub_status: string | null;
  gateway: string | null;
  current_period_end: string | null;
  ai_30d: number;
  alerts_active: number;
  total_count: number;
}

export interface AdminUserDetail {
  profile: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    full_name: string | null;
    phone: string | null;
    cpf: string | null;
    role: string;
  };
  subscriptions: Array<{
    id: string;
    status: string;
    current_period_end: string | null;
    created_at: string;
    gateway: string | null;
    gateway_customer_id: string | null;
    gateway_subscription_id: string | null;
    comp: boolean;
    comp_reason: string | null;
    plan_slug: string;
    plan_name: string;
    price_cents: number;
  }>;
  alerts: Array<{
    id: string;
    asset: string;
    metric: string;
    condition: Record<string, unknown>;
    channel: string;
    active: boolean;
    created_at: string;
  }>;
  recent_analyses: Array<{
    id: string;
    asset: string;
    model_used: string;
    report_type: string;
    created_at: string;
    preview: string;
  }>;
  usage_30d: number;
  ai_total: number;
}

export interface DataHealthRow {
  source: string;
  last_ts: string | null;
  age_min: number | null;
  row_count: number;
}

export interface AuditRow {
  id: number;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

/** Linha completa da tabela `plans` (admin edita todos os campos). */
export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  price_usd_cents: number;
  paddle_price_id: string | null;
  sort_order: number;
  assets: string[];
  snapshot_interval_min: number;
  advanced_metrics: boolean;
  chart_layers: boolean;
  smart_money: boolean;
  ai_daily_limit: number | null;
  ai_model: string;
  alert_channels: string[];
  history_days: number | null;
}
