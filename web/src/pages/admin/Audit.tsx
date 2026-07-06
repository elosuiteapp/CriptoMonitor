import { useEffect, useMemo, useState } from "react";

import { IconAudit } from "../../components/admin/icons";
import { Badge, Card, Empty, ErrorBox, PageHeader, Skeleton } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtDateTime } from "../../lib/adminFormat";
import type { AuditRow } from "../../lib/adminTypes";

const PAGE = 200;

const ACTION_LABEL: Record<string, string> = {
  set_role: "Alterou papel",
  set_subscription: "Alterou assinatura",
  update_plan: "Editou plano",
  create_affiliate: "Criou afiliado",
  update_affiliate: "Editou afiliado",
  mark_commissions_paid: "Pagou comissões",
  set_affiliate_comp: "Cortesia de afiliado",
  link_affiliate_user: "Vinculou conta a afiliado",
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
  comp: "cortesia",
  comp_reason: "motivo",
  grant: "concedeu",
  user_id: "usuário",
  amount_cents: "valor R$",
  percent: "comissão %",
  code: "código",
  email: "e-mail",
};

function fmtVal(key: string, v: unknown): string {
  if (v == null) return "—";
  if ((key === "price_cents" || key === "price_usd_cents" || key === "amount_cents") && typeof v === "number") {
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
  const [adminFilter, setAdminFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    setRows(null);
    setError(null); // sem isso, um erro antigo curto-circuitava a tela pra sempre (sem retry)
    let q = supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (dateFrom) q = q.gte("created_at", dateFrom); // filtro de data no BANCO (client-side só via as 200 recentes)
    q.then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data as AuditRow[]);
    });
  }, [limit, dateFrom]);

  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (!filter || r.action === filter) &&
          (!adminFilter || r.admin_email === adminFilter),
      ),
    [rows, filter, adminFilter],
  );
  const actions = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.action))), [rows]);
  const admins = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.admin_email).filter(Boolean))) as string[], [rows]);

  if (error) return <ErrorBox message={error} />;

  const selectCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";
  const canLoadMore = rows != null && rows.length === limit;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconAudit />}
        title="Auditoria"
        subtitle="Ações administrativas registradas."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectCls}>
              <option value="">Todas as ações</option>
              {actions.map((a) => (
                <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>
              ))}
            </select>
            <select value={adminFilter} onChange={(e) => setAdminFilter(e.target.value)} className={selectCls}>
              <option value="">Todos os admins</option>
              {admins.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectCls} title="A partir de" />
            {(filter || adminFilter || dateFrom) && (
              <button onClick={() => { setFilter(""); setAdminFilter(""); setDateFrom(""); }} className="text-xs text-muted-foreground hover:text-foreground">
                Limpar
              </button>
            )}
          </div>
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
        {rows && shown.length === 0 && <Empty>{filter || adminFilter || dateFrom ? `Nada encontrado para o filtro (nas ${rows.length} ações carregadas — "Carregar mais" busca períodos anteriores).` : "Nenhuma ação registrada."}</Empty>}
        {!rows && <Skeleton rows={6} />}
      </Card>

      {canLoadMore && (
        <div className="flex justify-center">
          <button onClick={() => setLimit((l) => l + PAGE)} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted">
            Carregar mais
          </button>
        </div>
      )}
    </div>
  );
}
