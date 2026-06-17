import { useEffect, useMemo, useState } from "react";

import { IconAudit } from "../../components/admin/icons";
import { Badge, Card, Empty, ErrorBox, PageHeader, Skeleton } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtDateTime } from "../../lib/adminFormat";
import type { AuditRow } from "../../lib/adminTypes";

const ACTION_LABEL: Record<string, string> = {
  set_role: "Alterou papel",
  set_subscription: "Alterou assinatura",
  update_plan: "Editou plano",
};

// Rótulos amigáveis para as chaves do detalhe (jsonb).
const KEY_LABEL: Record<string, string> = {
  role: "papel",
  plan: "plano",
  status: "status",
  period_end: "vence em",
  name: "nome",
  price_cents: "preço R$",
  price_usd_cents: "preço US$",
  ai_model: "modelo IA",
  smart_money: "smart money",
  assets: "ativos",
};

function fmtVal(key: string, v: unknown): string {
  if (v == null) return "—";
  if ((key === "price_cents" || key === "price_usd_cents") && typeof v === "number") {
    const sym = key === "price_usd_cents" ? "US$ " : "R$ ";
    return sym + (v / 100).toFixed(2);
  }
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (key === "period_end" && typeof v === "string") return fmtDateTime(v);
  return String(v);
}

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data as AuditRow[]);
      });
  }, []);

  const shown = useMemo(() => (rows ?? []).filter((r) => !filter || r.action === filter), [rows, filter]);
  const actions = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.action))), [rows]);

  if (error) return <ErrorBox message={error} />;

  const selectCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconAudit />}
        title="Auditoria"
        subtitle="Últimas ações administrativas registradas."
        actions={
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectCls}>
            <option value="">Todas as ações</option>
            {actions.map((a) => (
              <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
            ))}
          </select>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">Alvo</th>
                <th className="px-4 py-3 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="num whitespace-nowrap px-4 py-3 text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.admin_email ?? "—"}</td>
                  <td className="px-4 py-3"><Badge tone="accent">{ACTION_LABEL[r.action] ?? r.action}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.target_type ? (
                      <span>
                        <span className="text-foreground">{r.target_type}</span>
                        <span className="num"> · {r.target_id}</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.detail && Object.keys(r.detail).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(r.detail).map(([k, v]) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[11px]">
                            <span className="text-muted-foreground">{KEY_LABEL[k] ?? k}:</span>
                            <span className="num text-foreground">{fmtVal(k, v)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && shown.length === 0 && <Empty>Nenhuma ação registrada.</Empty>}
        {!rows && <Skeleton rows={6} />}
      </Card>
    </div>
  );
}
