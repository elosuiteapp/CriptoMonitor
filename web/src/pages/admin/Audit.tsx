import { useEffect, useState } from "react";

import { Badge, Card, Empty, ErrorBox } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtDateTime } from "../../lib/adminFormat";
import type { AuditRow } from "../../lib/adminTypes";

const ACTION_LABEL: Record<string, string> = {
  set_role: "Alterou papel",
  set_subscription: "Alterou assinatura",
  update_plan: "Editou plano",
};

export default function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data as AuditRow[]);
      });
  }, []);

  if (error) return <ErrorBox message={error} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Auditoria</h1>
        <p className="text-sm text-slate-500">Últimas 100 ações administrativas registradas.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-600 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">Alvo</th>
                <th className="px-4 py-3 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-b border-ink-700/60 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">{fmtDateTime(r.created_at)}</td>
                  <td className="px-4 py-3 text-slate-300">{r.admin_email ?? "—"}</td>
                  <td className="px-4 py-3"><Badge tone="accent">{ACTION_LABEL[r.action] ?? r.action}</Badge></td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {r.target_type ? `${r.target_type}: ${r.target_id}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {r.detail ? JSON.stringify(r.detail) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows && rows.length === 0 && <Empty>Nenhuma ação registrada ainda.</Empty>}
        {!rows && <Empty>Carregando…</Empty>}
      </Card>
    </div>
  );
}
