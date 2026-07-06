import { useEffect, useState } from "react";

import UserDetailModal from "../../components/admin/UserDetailModal";
import { IconDownload, IconUsers } from "../../components/admin/icons";
import { Badge, Card, Empty, ErrorBox, GatewayBadge, PageHeader, Skeleton, StatusBadge } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { supabase } from "../../lib/supabase";
import { fmtDate, fmtDateTime, fmtInt, timeAgo } from "../../lib/adminFormat";
import type { AdminUserRow } from "../../lib/adminTypes";

const PAGE_SIZE = 50;

export default function Users() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Planos do catálogo REAL (o filtro era hardcoded free/pro/expert — não achava mod_crypto/b3/forex/complete).
  const [planOpts, setPlanOpts] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    supabase.from("plans").select("slug, name").order("sort_order").then(({ data }) => setPlanOpts((data as { slug: string; name: string }[] | null) ?? []));
  }, []);

  const params = {
    p_search: search,
    p_plan: plan,
    p_status: status,
    p_role: role,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  };
  const { data, loading, error, reload } = useAdminRpc<AdminUserRow[]>("admin_list_users", params);

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim() || null);
  }

  function reset() {
    setSearchInput("");
    setSearch(null);
    setPlan(null);
    setStatus(null);
    setRole(null);
    setPage(0);
  }

  // Exporta TODOS os usuários do filtro atual (não só a página) como CSV.
  async function exportCsv() {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_users", {
        p_search: search,
        p_plan: plan,
        p_status: status,
        p_role: role,
        p_limit: 100000,
        p_offset: 0,
      });
      if (error) throw error;
      const all = (data as AdminUserRow[]) ?? [];
      const headers = ["email", "nome", "telefone", "cpf", "papel", "plano", "status", "gateway", "criado", "ultimo_acesso", "ia_30d", "alertas"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = all.map((u) =>
        [u.email, u.full_name, u.phone, u.cpf, u.role, u.plan_name, u.sub_status, u.gateway, u.created_at, u.last_sign_in_at, u.ai_30d, u.alerts_active]
          .map(esc)
          .join(","),
      );
      const csv = "﻿" + [headers.join(","), ...lines].join("\r\n"); // BOM p/ Excel
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao exportar.");
    } finally {
      setExporting(false);
    }
  }

  const selectCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconUsers />}
        title="Usuários"
        subtitle={`${fmtInt(total)} no total · clique em uma linha para gerenciar.`}
        actions={
          <button
            onClick={exportCsv}
            disabled={exporting || total === 0}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <IconDownload size={16} /> {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        }
      />

      {/* Filtros */}
      <form onSubmit={applySearch} className="flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por e-mail ou nome…"
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
        />
        <select value={plan ?? ""} onChange={(e) => { setPlan(e.target.value || null); setPage(0); }} className={selectCls}>
          <option value="">Todos os planos</option>
          {planOpts.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
        <select value={status ?? ""} onChange={(e) => { setStatus(e.target.value || null); setPage(0); }} className={selectCls}>
          <option value="">Todos os status</option>
          <option value="active">Ativa</option>
          <option value="past_due">Em atraso</option>
          <option value="canceled">Cancelada</option>
        </select>
        <select value={role ?? ""} onChange={(e) => { setRole(e.target.value || null); setPage(0); }} className={selectCls}>
          <option value="">Todos os papéis</option>
          <option value="admin">Admin</option>
          <option value="user">Usuário</option>
        </select>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90">
          Buscar
        </button>
        {(search || plan || status || role) && (
          <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
            Limpar
          </button>
        )}
      </form>

      {error && <ErrorBox message={error} />}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Usuário</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Gateway</th>
                <th className="px-4 py-3 font-medium">Criado</th>
                <th className="px-4 py-3 font-medium">Último acesso</th>
                <th className="px-4 py-3 text-right font-medium">IA 30d</th>
                <th className="px-4 py-3 text-right font-medium">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{u.email}</span>
                      {u.role === "admin" && <Badge tone="accent">admin</Badge>}
                    </div>
                    {u.full_name && <div className="text-xs text-muted-foreground">{u.full_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-foreground">{u.plan_name ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={u.sub_status} /></td>
                  <td className="px-4 py-3">{u.sub_status ? <GatewayBadge gateway={u.gateway} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="num px-4 py-3 text-muted-foreground" title={fmtDateTime(u.created_at)}>{fmtDate(u.created_at)}</td>
                  <td className="num px-4 py-3 text-muted-foreground">{timeAgo(u.last_sign_in_at)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{fmtInt(u.ai_30d)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{fmtInt(u.alerts_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && rows.length === 0 && <Empty>Nenhum usuário encontrado.</Empty>}
        {loading && rows.length === 0 && <Skeleton rows={8} />}
      </Card>

      {/* Paginação */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 transition-colors hover:bg-muted disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {selected && (
        <UserDetailModal
          userId={selected}
          onClose={() => setSelected(null)}
          onChanged={() => reload()}
        />
      )}
    </div>
  );
}
