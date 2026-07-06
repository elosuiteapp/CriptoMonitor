import { Donut, HBar } from "../../components/admin/Charts";
import { IconMoney, IconRevenue, IconTrendUp } from "../../components/admin/icons";
import { Card, Empty, ErrorBox, GatewayBadge, PageHeader, SectionTitle, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtBRL, fmtInt, fmtPct1, fmtUSD, GATEWAY_COLOR, gatewayLabel } from "../../lib/adminFormat";
import type { AdminOverview } from "../../lib/adminTypes";

const PLAN_COLORS: Record<string, string> = { free: "#64748b", pro: "#6366f1", expert: "#22c55e", mod_crypto: "#6366f1", mod_b3: "#10b981", mod_forex: "#f59e0b", complete: "#d946ef" };
// Abaixo desta base paga, churn/LTV viram ruído (cancelamentos de teste) → mostramos "—".
const MIN_PAID_BASE = 10;

export default function Subscriptions() {
  const { data: o, loading, error } = useAdminRpc<AdminOverview>("admin_overview");

  if (error) return <ErrorBox message={error} />;
  if (loading || !o) return <Empty>Carregando receita…</Empty>;

  // Churn/LTV só com base PAGA mínima (ignora free/cortesia e amostra pequena → "—").
  const paidBase = o.subs_paid_active + o.subs_paid_canceled_30d;
  const churn = paidBase >= MIN_PAID_BASE ? o.subs_paid_canceled_30d / paidBase : null;
  const arpu = o.subs_paid_active > 0 ? o.mrr_cents / o.subs_paid_active : 0;
  const ltv = churn && churn > 0 ? arpu / churn : null; // LTV ≈ ARPU / churn mensal
  const totalMrr = o.mrr_cents || 1;
  const maxMrr = Math.max(...o.plan_distribution.map((p) => p.mrr_cents), 1);
  const gw = o.gateway_distribution ?? [];

  return (
    <div className="space-y-6">
      <PageHeader icon={<IconRevenue />} title="Assinaturas & Receita" subtitle="Receita recorrente, retenção e quebra por plano e gateway." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="MRR (reais)" value={fmtBRL(o.mrr_cents)} sub={`ARR ${fmtBRL(o.arr_cents)}`} tone="good" icon={<IconMoney />} />
        <StatCard label="MRR (dólar)" value={fmtUSD(o.mrr_usd_cents)} sub={`ARR ${fmtUSD(o.arr_usd_cents)}`} icon={<IconMoney />} />
        <StatCard label="ARPU" value={fmtBRL(arpu)} sub={`${fmtInt(o.subs_paid_active)} pagantes`} icon={<IconTrendUp />} />
        <StatCard label="LTV estimado" value={ltv === null ? "—" : fmtBRL(ltv)} sub={churn === null ? "base pequena" : churn === 0 ? "sem cancelamentos 30d (LTV indefinido)" : "ARPU ÷ churn"} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assinaturas ativas" value={fmtInt(o.subs_active)} />
        <StatCard label="Pagas ativas" value={fmtInt(o.subs_paid_active)} tone="good" />
        <StatCard label="Em atraso" value={fmtInt(o.subs_past_due)} tone={o.subs_past_due > 0 ? "warn" : undefined} />
        <StatCard label="Churn 30d" value={churn === null ? "—" : fmtPct1(churn)} sub={churn === null ? "amostra pequena" : `${fmtInt(o.subs_paid_canceled_30d)} cancel. pagos`} tone={churn === null ? undefined : churn > 0.1 ? "bad" : undefined} />
      </div>

      {o.comp_active > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">cortesia</span>
          <span className="text-foreground"><b className="num">{fmtInt(o.comp_active)}</b> {o.comp_active === 1 ? "conta cortesia ativa" : "contas cortesia ativas"}</span>
          <span className="text-muted-foreground">
            ≈ <span className="num">{fmtBRL(o.comp_value_cents)}</span>/mês liberados sem cobrança (admin, afiliados, equipe) — <b>fora do MRR</b> acima.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
                  <th className="w-1/4 py-2 pl-4 font-medium"></th>
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

        {/* Receita por gateway */}
        <Card className="p-4">
          <SectionTitle hint="pagas ativas">Receita por gateway</SectionTitle>
          <div className="mt-4">
            {gw.length === 0 ? (
              <Empty>Nenhuma assinatura paga ainda.</Empty>
            ) : (
              <>
                <Donut
                  centerValue={fmtBRL(o.mrr_cents)}
                  centerLabel={gw.some((x) => x.mrr_cents > 0) ? "MRR total" : "Assinaturas"}
                  data={gw.map((g) => ({
                    label: gatewayLabel(g.gateway),
                    // unidade ÚNICA por gráfico: MRR em centavos, ou (se ninguém tem MRR) contagem — nunca misturar
                    value: gw.some((x) => x.mrr_cents > 0) ? g.mrr_cents : g.count,
                    color: GATEWAY_COLOR[g.gateway] ?? "#64748b",
                  }))}
                />
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  {gw.map((g) => (
                    <div key={g.gateway} className="flex items-center justify-between text-sm">
                      <GatewayBadge gateway={g.gateway} />
                      <span className="text-muted-foreground">
                        <span className="num">{fmtInt(g.count)}</span> assin. · <span className="num">{fmtBRL(g.mrr_cents)}</span>/mês
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
