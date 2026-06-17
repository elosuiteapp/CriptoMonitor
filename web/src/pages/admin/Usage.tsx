import { BarChart, HBar } from "../../components/admin/Charts";
import { IconCpu, IconUsage } from "../../components/admin/icons";
import { Card, Empty, ErrorBox, PageHeader, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtInt } from "../../lib/adminFormat";
import type { AdminOverview, ModelUsage, UsagePoint } from "../../lib/adminTypes";

export default function Usage() {
  const { data: o } = useAdminRpc<AdminOverview>("admin_overview");
  const { data: series, loading, error } = useAdminRpc<UsagePoint[]>("admin_usage_timeseries", { p_days: 90 });
  const { data: byModel } = useAdminRpc<ModelUsage[]>("admin_usage_by_model");

  if (error) return <ErrorBox message={error} />;

  const total90 = (series ?? []).reduce((a, p) => a + p.analyses, 0);
  const maxModel = Math.max(...(byModel ?? []).map((m) => m.analyses), 1);

  return (
    <div className="space-y-6">
      <PageHeader icon={<IconUsage />} title="Uso & IA" subtitle="Consumo do copiloto de IA e distribuição por modelo." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Análises hoje" value={fmtInt(o?.ai_today)} icon={<IconCpu />} />
        <StatCard label="Análises 30d" value={fmtInt(o?.ai_30d)} />
        <StatCard label="Análises 90d" value={fmtInt(total90)} />
        <StatCard label="Total acumulado" value={fmtInt(o?.ai_total)} tone="good" />
      </div>

      <Card className="p-4">
        <SectionTitle hint="últimos 90 dias">Análises de IA geradas / dia</SectionTitle>
        <div className="mt-3">
          {loading ? <Empty>Carregando…</Empty> : <BarChart values={(series ?? []).map((p) => p.analyses)} height={96} color="#22c55e" />}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>Uso por modelo</SectionTitle>
        <div className="mt-4 space-y-3">
          {(byModel ?? []).length === 0 && <Empty>Nenhuma análise ainda.</Empty>}
          {(byModel ?? []).map((m) => (
            <div key={m.model_used} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{m.model_used}</span>
                <span className="num text-muted-foreground">{fmtInt(m.analyses)}</span>
              </div>
              <HBar value={m.analyses} max={maxModel} color="#6366f1" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
