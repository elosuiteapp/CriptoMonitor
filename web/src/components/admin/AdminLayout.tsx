import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";

const NAV = [
  { to: "/admin", label: "Visão geral", end: true },
  { to: "/admin/users", label: "Usuários" },
  { to: "/admin/subscriptions", label: "Assinaturas & Receita" },
  { to: "/admin/plans", label: "Planos" },
  { to: "/admin/usage", label: "Uso & IA" },
  { to: "/admin/system", label: "Saúde do sistema" },
  { to: "/admin/audit", label: "Auditoria" },
];

export default function AdminLayout() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-full flex-col bg-background md:flex-row">
      {/* Sidebar */}
      <aside className="shrink-0 border-b border-border bg-card dark:bg-card/60 md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-sm font-bold text-foreground">Crypto Monitor</div>
            <div className="text-xs text-primary">Administração</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-border px-4 py-3 md:block">
          <Link to="/" className="block text-xs text-muted-foreground hover:text-foreground">
            ← Voltar ao app
          </Link>
          <button onClick={() => signOut()} className="mt-2 block text-xs text-muted-foreground hover:text-foreground">
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
