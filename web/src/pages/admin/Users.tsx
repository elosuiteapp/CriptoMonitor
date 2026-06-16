import { useState } from "react";

import UserDetailModal from "../../components/admin/UserDetailModal";
import { Badge, Card, Empty, ErrorBox, StatusBadge } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtDate, fmtInt, timeAgo } from "../../lib/adminFormat";
import type { AdminUserRow } from "../../lib/adminTypes";

const PAGE_SIZE = 50;

export default function Users() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const params = {
    p_search: search,
    p_plan: plan,
    p_status: status,
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
    setPage(0);
  }

  const selectCls = "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">{fmtInt(total)} no total · clique em uma linha para gerenciar.</p>
        </div>
      </div>

      {/* Filtros */}
      <form onSubmit={applySearch} className="flex flex-wrap items-center gap-2">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por e-mail ou nome…"
          className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <select value={plan ?? ""} onChange={(e) => { setPlan(e.target.value || null); setPage(0); }} className={selectCls}>
          <option value="">Todos os planos</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="expert">Expert</option>
        </select>
        <select value={status ?? ""} onChange={(e) => { setStatus(e.target.value || null); setPage(0); }} className={selectCls}>
          <option value="">Todos os status</option>
          <option value="active">Ativa</option>
          <option value="past_due">Em atraso</option>
          <option value="canceled">Cancelada</option>
        </select>
        <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Buscar
        </button>
        {(search || plan || status) && (
          <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
            Limpar
          </button>
        )}
      </form>

      {error && <ErrorBox message={error} />}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Usuário</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                  className="cursor-pointer border-b border-border hover:bg-muted"
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
                  <td className="num px-4 py-3 text-muted-foreground">{fmtDate(u.created_at)}</td>
                  <td className="num px-4 py-3 text-muted-foreground">{timeAgo(u.last_sign_in_at)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{fmtInt(u.ai_30d)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{fmtInt(u.alerts_active)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && <Empty>Nenhum usuário encontrado.</Empty>}
        {loading && <Empty>Carregando…</Empty>}
      </Card>

      {/* Paginação */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page + 1} de {pages}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted"
            >
              Anterior
            </button>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted"
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
