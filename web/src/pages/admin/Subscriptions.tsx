import { HBar } from "../../components/admin/Charts";
import { Card, Empty, ErrorBox, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtBRL, fmtInt, fmtPct1 } from "../../lib/adminFormat";
import type { AdminOverview } from "../../lib/adminTypes";

const PLAN_COLORS: Record<string, string> = { free: "#64748b", pro: "#6366f1", expert: "#22c55e" };

export default function Subscriptions() {
  const { data: o, loading, error } = useAdminRpc<AdminOverview>("admin_overview");

  if (error) return <ErrorBox message={error} />;
  if (loading || !o) return <Empty>Carregando receita…</Empty>;

  const churn = o.subs_active + o.subs_canceled_30d > 0 ? o.subs_canceled_30d / (o.subs_active + o.subs_canceled_30d) : 0;
  const arpu = o.subs_paid_active > 0 ? o.mrr_cents / o.subs_paid_active : 0;
  const ltv = churn > 0 ? arpu / churn : 0; // LTV ≈ ARPU / churn mensal
  const totalMrr = o.mrr_cents || 1;
  const maxMrr = Math.max(...o.plan_distribution.map((p) => p.mrr_cents), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas & Receita</h1>
        <p className="text-sm text-muted-foreground">Receita recorrente, retenção e quebra por plano.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR" value={fmtBRL(o.mrr_cents)} tone="good" />
        <StatCard label="ARR" value={fmtBRL(o.arr_cents)} />
        <StatCard label="ARPU" value={fmtBRL(arpu)} sub={`${fmtInt(o.subs_paid_active)} pagantes`} />
        <StatCard label="LTV estimado" value={ltv > 0 ? fmtBRL(ltv) : "—"} sub={churn > 0 ? `ARPU ÷ churn` : "sem churn"} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assinaturas ativas" value={fmtInt(o.subs_active)} />
        <StatCard label="Pagas ativas" value={fmtInt(o.subs_paid_active)} tone="good" />
        <StatCard label="Em atraso" value={fmtInt(o.subs_past_due)} tone={o.subs_past_due > 0 ? "warn" : undefined} />
        <StatCard label="Churn 30d" value={fmtPct1(churn)} sub={`${fmtInt(o.subs_canceled_30d)} canc. / ${fmtInt(o.subs_canceled)} total`} tone={churn > 0.1 ? "bad" : undefined} />
      </div>

      {/* Receita por plano */}
      <Card className="p-4">
        <SectionTitle hint="MRR por plano">Receita por plano</SectionTitle>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Plano</th>
                <th className="py-2 text-right font-medium">Assinantes</th>
                <th className="py-2 text-right font-medium">MRR</th>
                <th className="py-2 text-right font-medium">% receita</th>
                <th className="w-1/3 py-2 pl-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {o.plan_distribution.map((p) => (
                <tr key={p.slug} className="border-t border-border">
                  <td className="py-2.5 text-foreground">{p.name}</td>
                  <td className="num py-2.5 text-right text-muted-foreground">{fmtInt(p.count)}</td>
                  <td className="num py-2.5 text-right text-muted-foreground">{fmtBRL(p.mrr_cents)}</td>
                  <td className="num py-2.5 text-right text-muted-foreground">{fmtPct1(p.mrr_cents / totalMrr)}</td>
                  <td className="py-2.5 pl-4">
                    <HBar value={p.mrr_cents} max={maxMrr} color={PLAN_COLORS[p.slug] ?? "#6366f1"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
