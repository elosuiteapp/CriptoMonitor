import { BarChart, HBar } from "../../components/admin/Charts";
import { IconCpu, IconMoney, IconUsage } from "../../components/admin/icons";
import { Card, Empty, ErrorBox, PageHeader, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtInt } from "../../lib/adminFormat";
import type { AdminOverview, AiCosts, UsagePoint } from "../../lib/adminTypes";

// Custo do Gemini é em USD; guardamos em micro-USD (1e6 = US$ 1).
const usd = (m?: number) => "$" + ((m ?? 0) / 1e6).toFixed((m ?? 0) > 0 && (m ?? 0) < 1e6 ? 4 : 2);
const tokens = (n?: number) => (n == null ? "0" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function Usage() {
  // Os 3 erros importam: engolir o de admin_ai_costs mostrava "Custo hoje $0.00" em falha (zero falso).
  const { data: o, error: errOverview } = useAdminRpc<AdminOverview>("admin_overview");
  const { data: series, loading, error } = useAdminRpc<UsagePoint[]>("admin_usage_timeseries", { p_days: 90 });
  const { data: costs, error: errCosts } = useAdminRpc<AiCosts>("admin_ai_costs");

  const firstErr = error ?? errCosts ?? errOverview;
  if (firstErr) return <ErrorBox message={firstErr} />;

  const total90 = (series ?? []).reduce((a, p) => a + p.analyses, 0);
  const byModel = costs?.by_model ?? [];
  const maxModelCost = Math.max(...byModel.map((m) => m.cost_micros), 1);
  const daily = costs?.daily_30d ?? [];
  const topUsers = costs?.top_users ?? [];

  return (
    <div className="space-y-6">
      <PageHeader icon={<IconUsage />} title="Uso & IA" subtitle="Consumo de TODA a IA (copiloto + relatórios cockpit/B3/Forex): custo do Gemini e distribuição por modelo." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Análises hoje" value={fmtInt(o?.ai_today)} icon={<IconCpu />} />
        <StatCard label="Análises 30d" value={fmtInt(o?.ai_30d)} />
        <StatCard label="Análises 90d" value={fmtInt(total90)} />
        <StatCard label="Total acumulado" value={fmtInt(o?.ai_total)} tone="good" />
      </div>

      {/* Custo de IA (Gemini) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Custo hoje" value={usd(costs?.cost_today_micros)} icon={<IconMoney />} />
        <StatCard label="Custo 30d" value={usd(costs?.cost_30d_micros)} tone={(costs?.cost_30d_micros ?? 0) > 0 ? "warn" : undefined} />
        <StatCard label="Custo total" value={usd(costs?.cost_total_micros)} />
        <StatCard label="Tokens 30d" value={tokens(costs?.tokens_in_30d)} sub={`${tokens(costs?.tokens_out_30d)} saída`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle hint="últimos 90 dias">Análises de IA geradas / dia</SectionTitle>
          <div className="mt-3">
            {loading ? <Empty>Carregando…</Empty> : <BarChart values={(series ?? []).map((p) => p.analyses)} height={96} color="#22c55e" />}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle hint="últimos 30 dias">Custo de IA / dia (US$)</SectionTitle>
          <div className="mt-3">
            {daily.length === 0 ? <Empty>Sem custo registrado ainda.</Empty> : <BarChart values={daily.map((d) => d.cost_micros)} height={96} color="#f59e0b" />}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle hint="análises · tokens · custo">Uso e custo por modelo</SectionTitle>
        <div className="mt-4 space-y-3">
          {byModel.length === 0 && <Empty>Nenhuma análise com custo registrado ainda.</Empty>}
          {byModel.map((m) => (
            <div key={m.model_used} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">{m.model_used}</span>
                <span className="num text-muted-foreground">
                  {fmtInt(m.analyses)} · {tokens(m.in_tokens)}→{tokens(m.out_tokens)} tok · <span className="text-foreground">{usd(m.cost_micros)}</span>
                </span>
              </div>
              <HBar value={m.cost_micros} max={maxModelCost} color="#f59e0b" />
            </div>
          ))}
        </div>
      </Card>

      {topUsers.length > 0 && (
        <Card className="p-4">
          <SectionTitle hint="top 10 por custo">Maiores consumidores de IA</SectionTitle>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Usuário</th>
                  <th className="py-2 text-right font-medium">Análises</th>
                  <th className="py-2 text-right font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u) => (
                  <tr key={u.email} className="border-t border-border">
                    <td className="py-2 text-foreground">{u.email}</td>
                    <td className="num py-2 text-right text-muted-foreground">{fmtInt(u.analyses)}</td>
                    <td className="num py-2 text-right text-foreground">{usd(u.cost_micros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
