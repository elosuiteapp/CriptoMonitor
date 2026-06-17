import { Link, NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import ThemeToggle from "../ui/ThemeToggle";
import {
  IconAffiliate,
  IconAudit,
  IconBack,
  IconLogout,
  IconOverview,
  IconPlans,
  IconRevenue,
  IconSystem,
  IconUsage,
  IconUsers,
} from "./icons";

const NAV = [
  { to: "/admin", label: "Visão geral", end: true, icon: IconOverview },
  { to: "/admin/users", label: "Usuários", icon: IconUsers },
  { to: "/admin/subscriptions", label: "Assinaturas & Receita", icon: IconRevenue },
  { to: "/admin/plans", label: "Planos", icon: IconPlans },
  { to: "/admin/usage", label: "Uso & IA", icon: IconUsage },
  { to: "/admin/affiliates", label: "Afiliados", icon: IconAffiliate },
  { to: "/admin/system", label: "Saúde do sistema", icon: IconSystem },
  { to: "/admin/audit", label: "Auditoria", icon: IconAudit },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const email = user?.email ?? "";

  return (
    <div className="flex min-h-full flex-col bg-background md:flex-row">
      {/* Sidebar */}
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
        {/* Marca */}
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-sm font-bold text-primary-foreground shadow-sm">
              CM
            </span>
            <div>
              <div className="text-sm font-bold leading-tight text-foreground">Crypto Monitor</div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Administração</div>
            </div>
          </div>
          <div className="md:hidden">
            <ThemeToggle />
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-1 md:flex-col md:overflow-visible">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`
                }
              >
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Rodapé: identidade + ações */}
        <div className="hidden border-t border-border px-3 py-3 md:block">
          {email && (
            <div className="mb-2 truncate px-1 text-[11px] text-muted-foreground" title={email}>
              {email}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconBack size={14} /> App
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconLogout size={14} /> Sair
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
