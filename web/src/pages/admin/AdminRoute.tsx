import { Navigate } from "react-router-dom";

import AdminLayout from "../../components/admin/AdminLayout";
import { useAuth } from "../../hooks/useAuth";
import { useIsAdmin } from "../../hooks/useIsAdmin";

/** Guarda de rota: só renderiza o painel se houver sessão E papel admin. */
export default function AdminRoute() {
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin(user?.id);

  if (loading || adminLoading) {
    return <div className="grid h-full place-items-center text-muted-foreground">Carregando…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <AdminLayout />;
}
