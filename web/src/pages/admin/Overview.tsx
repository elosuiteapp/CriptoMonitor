import { BarChart, HBar, LineChart } from "../../components/admin/Charts";
import { Card, Empty, ErrorBox, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtBRL, fmtInt, fmtPct1 } from "../../lib/adminFormat";
import type { AdminOverview, SignupPoint, UsagePoint } from "../../lib/adminTypes";

const PLAN_COLORS: Record<string, string> = { free: "#64748b", pro: "#6366f1", expert: "#22c55e" };

export default function Overview() {
  const { data: o, loading, error } = useAdminRpc<AdminOverview>("admin_overview");
  const { data: signups } = useAdminRpc<SignupPoint[]>("admin_signups_timeseries", { p_days: 30 });
  const { data: usage } = useAdminRpc<UsagePoint[]>("admin_usage_timeseries", { p_days: 30 });

  if (error) return <ErrorBox message={error} />;
  if (loading || !o) return <Empty>Carregando métricas…</Empty>;

  const churn = o.subs_active + o.subs_canceled_30d > 0 ? o.subs_canceled_30d / (o.subs_active + o.subs_canceled_30d) : 0;
  const arpu = o.subs_paid_active > 0 ? o.mrr_cents / o.subs_paid_active : 0;
  const maxPlan = Math.max(...o.plan_distribution.map((p) => p.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Visão geral</h1>
        <p className="text-sm text-slate-500">Saúde do negócio em tempo real.</p>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR (receita recorrente mensal)" value={fmtBRL(o.mrr_cents)} sub={`ARR ${fmtBRL(o.arr_cents)}`} tone="good" />
        <StatCard label="ARPU (receita média / assinante pago)" value={fmtBRL(arpu)} sub={`${fmtInt(o.subs_paid_active)} pagantes`} />
        <StatCard
          label="Churn 30d"
          value={fmtPct1(churn)}
          sub={`${fmtInt(o.subs_canceled_30d)} cancelamentos`}
          tone={churn > 0.1 ? "bad" : churn > 0 ? "warn" : "good"}
        />
        <StatCard label="Em atraso (past due)" value={fmtInt(o.subs_past_due)} tone={o.subs_past_due > 0 ? "warn" : undefined} />
      </div>

      {/* KPIs de usuários / engajamento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Usuários totais" value={fmtInt(o.users_total)} sub={`+${fmtInt(o.users_today)} hoje · +${fmtInt(o.users_7d)} 7d`} />
        <StatCard label="Assinaturas ativas" value={fmtInt(o.subs_active)} sub={`${fmtInt(o.subs_paid_active)} pagas`} />
        <StatCard label="Análises de IA (30d)" value={fmtInt(o.ai_30d)} sub={`${fmtInt(o.ai_today)} hoje · ${fmtInt(o.ai_total)} no total`} />
        <StatCard label="Alertas ativos" value={fmtInt(o.alerts_active)} />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle hint="últimos 30 dias">Base de usuários (acumulado)</SectionTitle>
          <div className="mt-3">
            <LineChart values={(signups ?? []).map((p) => p.cumulative)} id="cum" />
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle hint="últimos 30 dias">Novos cadastros / dia</SectionTitle>
          <div className="mt-3">
            <BarChart values={(signups ?? []).map((p) => p.signups)} color="#6366f1" />
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle hint="últimos 30 dias">Análises de IA geradas / dia</SectionTitle>
        <div className="mt-3">
          <BarChart values={(usage ?? []).map((p) => p.analyses)} color="#22c55e" />
        </div>
      </Card>

      {/* Distribuição de planos */}
      <Card className="p-4">
        <SectionTitle>Distribuição por plano</SectionTitle>
        <div className="mt-4 space-y-3">
          {o.plan_distribution.length === 0 && <Empty>Nenhum plano.</Empty>}
          {o.plan_distribution.map((p) => (
            <div key={p.slug} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-200">{p.name}</span>
                <span className="text-slate-400">
                  {fmtInt(p.count)} assinantes · <span className="text-slate-300">{fmtBRL(p.mrr_cents)}/mês</span>
                </span>
              </div>
              <HBar value={p.count} max={maxPlan} color={PLAN_COLORS[p.slug] ?? "#6366f1"} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
