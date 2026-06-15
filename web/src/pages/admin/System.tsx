import { Card, Empty, ErrorBox, StatCard } from "../../components/admin/ui";
import { useAdminRpc } from "../../hooks/useAdminRpc";
import { fmtDateTime, fmtInt, timeAgo } from "../../lib/adminFormat";
import type { DataHealthRow } from "../../lib/adminTypes";

function freshness(age: number | null): { color: string; label: string } {
  if (age == null) return { color: "#ef4444", label: "sem dados" };
  if (age <= 15) return { color: "#22c55e", label: "fresco" };
  if (age <= 60) return { color: "#eab308", label: "atrasando" };
  return { color: "#ef4444", label: "obsoleto" };
}

export default function System() {
  const { data, loading, error, reload } = useAdminRpc<DataHealthRow[]>("admin_data_health");

  if (error) return <ErrorBox message={error} />;

  const rows = data ?? [];
  const stale = rows.filter((r) => r.age_min == null || r.age_min > 60).length;
  const totalRows = rows.reduce((a, r) => a + Number(r.row_count), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Saúde do sistema</h1>
          <p className="text-sm text-slate-500">Frescor e volume de cada fonte do pipeline de coleta.</p>
        </div>
        <button onClick={() => reload()} className="rounded-lg border border-ink-500 px-3 py-1.5 text-sm text-slate-300 hover:bg-ink-700">
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Fontes monitoradas" value={fmtInt(rows.length)} />
        <StatCard label="Fontes obsoletas (>60min)" value={fmtInt(stale)} tone={stale > 0 ? "bad" : "good"} />
        <StatCard label="Registros totais" value={fmtInt(totalRows)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-600 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fonte</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Última atualização</th>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 text-right font-medium">Registros</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const f = freshness(r.age_min);
                return (
                  <tr key={r.source} className="border-b border-ink-700/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{r.source}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} />
                        {f.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDateTime(r.last_ts)}</td>
                    <td className="px-4 py-3 text-slate-400">{timeAgo(r.last_ts)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{fmtInt(Number(r.row_count))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Carregando…</Empty>}
      </Card>
    </div>
  );
}
