import { BarChart, Donut, HBar, LineChart } from "../../components/admin/Charts";
import { IconAlert, IconCpu, IconMoney, IconOverview, IconTrendUp, IconUsers } from "../../components/admin/icons";
import { Card, Empty, ErrorBox, PageHeader, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtBRL, fmtInt, fmtPct1, fmtUSD, GATEWAY_COLOR, gatewayLabel } from "../../lib/adminFormat";
import type { AdminOverview, SignupPoint, UsagePoint } from "../../lib/adminTypes";

const PLAN_COLORS: Record<string, string> = { free: "#64748b", pro: "#6366f1", expert: "#22c55e" };
// Abaixo desta base paga, churn/LTV viram ruído (cancelamentos de teste) → mostramos "—".
const MIN_PAID_BASE = 10;

export default function Overview() {
  const { data: o, loading, error } = useAdminRpc<AdminOverview>("admin_overview");
  const { data: signups } = useAdminRpc<SignupPoint[]>("admin_signups_timeseries", { p_days: 30 });
  const { data: usage } = useAdminRpc<UsagePoint[]>("admin_usage_timeseries", { p_days: 30 });

  if (error) return <ErrorBox message={error} />;
  if (loading || !o) return <Empty>Carregando métricas…</Empty>;

  // Churn só com base PAGA mínima (ignora free/cortesia e amostra pequena → "—").
  const paidBase = o.subs_paid_active + o.subs_paid_canceled_30d;
  const churn = paidBase >= MIN_PAID_BASE ? o.subs_paid_canceled_30d / paidBase : null;
  const arpu = o.subs_paid_active > 0 ? o.mrr_cents / o.subs_paid_active : 0;
  const maxPlan = Math.max(...o.plan_distribution.map((p) => p.count), 1);
  const gw = o.gateway_distribution ?? [];

  return (
    <div className="space-y-6">
      <PageHeader icon={<IconOverview />} title="Visão geral" subtitle="Saúde do negócio em tempo real." />

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR (receita recorrente)" value={fmtBRL(o.mrr_cents)} sub={`ARR ${fmtBRL(o.arr_cents)}`} tone="good" icon={<IconMoney />} />
        <StatCard label="MRR internacional" value={fmtUSD(o.mrr_usd_cents)} sub={`ARR ${fmtUSD(o.arr_usd_cents)}`} icon={<IconMoney />} />
        <StatCard label="ARPU (média / pagante)" value={fmtBRL(arpu)} sub={`${fmtInt(o.subs_paid_active)} pagantes`} icon={<IconTrendUp />} />
        <StatCard
          label="Churn 30d"
          value={churn === null ? "—" : fmtPct1(churn)}
          sub={churn === null ? "amostra pequena" : `${fmtInt(o.subs_paid_canceled_30d)} cancel. pagos`}
          tone={churn === null ? undefined : churn > 0.1 ? "bad" : churn > 0 ? "warn" : "good"}
        />
      </div>

      {/* KPIs de usuários / engajamento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Usuários totais" value={fmtInt(o.users_total)} sub={`+${fmtInt(o.users_today)} hoje · +${fmtInt(o.users_7d)} 7d`} icon={<IconUsers />} />
        <StatCard label="Assinaturas ativas" value={fmtInt(o.subs_active)} sub={`${fmtInt(o.subs_paid_active)} pagas · ${fmtInt(o.subs_free_active)} free · ${fmtInt(o.comp_active)} cortesia · ${fmtInt(o.subs_past_due)} atraso`} />
        <StatCard label="Análises de IA (30d)" value={fmtInt(o.ai_30d)} sub={`${fmtInt(o.ai_today)} hoje · ${fmtInt(o.ai_total)} total`} icon={<IconCpu />} />
        <StatCard label="Alertas ativos" value={fmtInt(o.alerts_active)} icon={<IconAlert />} />
      </div>

      {o.comp_active > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">cortesia</span>
          <span className="text-foreground"><b className="num">{fmtInt(o.comp_active)}</b> {o.comp_active === 1 ? "conta cortesia ativa" : "contas cortesia ativas"}</span>
          <span className="text-muted-foreground">≈ <span className="num">{fmtBRL(o.comp_value_cents)}</span>/mês liberados sem cobrança — <b>fora do MRR</b>.</span>
        </div>
      )}

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

      {/* Distribuição de planos + gateways */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle>Distribuição por plano</SectionTitle>
          <div className="mt-4 space-y-3">
            {o.plan_distribution.length === 0 && <Empty>Nenhum plano.</Empty>}
            {o.plan_distribution.map((p) => (
              <div key={p.slug} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{p.name}</span>
                  <span className="text-muted-foreground">
                    <span className="num">{fmtInt(p.count)}</span> assinantes · <span className="num">{fmtBRL(p.mrr_cents)}</span>/mês
                  </span>
                </div>
                <HBar value={p.count} max={maxPlan} color={PLAN_COLORS[p.slug] ?? "#6366f1"} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle hint="assinaturas pagas ativas">Receita por gateway</SectionTitle>
          <div className="mt-4">
            {gw.length === 0 ? (
              <Empty>Nenhuma assinatura paga ainda.</Empty>
            ) : (
              <Donut
                centerValue={fmtBRL(o.mrr_cents)}
                centerLabel="MRR total"
                data={gw.map((g) => ({
                  label: `${gatewayLabel(g.gateway)} (${fmtInt(g.count)})`,
                  value: g.mrr_cents || g.count,
                  color: GATEWAY_COLOR[g.gateway] ?? "#64748b",
                }))}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
