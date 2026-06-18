import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "./hooks/useAuth";
import { useReferralCapture } from "./hooks/useReferralCapture";
import Alerts from "./pages/Alerts";
import Analysis from "./pages/Analysis";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Pricing from "./pages/Pricing";
import AdminAffiliates from "./pages/admin/Affiliates";
import AdminRoute from "./pages/admin/AdminRoute";
import AdminAudit from "./pages/admin/Audit";
import AdminOverview from "./pages/admin/Overview";
import AdminPlans from "./pages/admin/Plans";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AdminSystem from "./pages/admin/System";
import AdminUsage from "./pages/admin/Usage";
import AdminUsers from "./pages/admin/Users";

function Loading() {
  return <div className="grid h-full place-items-center text-muted-foreground">Carregando…</div>;
}

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();
  useReferralCapture(session);

  // Intenção de assinatura vinda da landing (?plan=pro|expert): guarda para abrir o
  // checkout do plano logo após o login (sobrevive ao redirect do OAuth via sessionStorage).
  useEffect(() => {
    const plan = new URLSearchParams(location.search).get("plan");
    if (plan === "pro" || plan === "expert") {
      try {
        sessionStorage.setItem("ov.pending-plan", plan);
      } catch {
        /* sessionStorage indisponível */
      }
    }
  }, [location.search]);

  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/analysis" element={session ? <Analysis /> : <Navigate to="/login" replace />} />
      <Route path="/alerts" element={session ? <Alerts /> : <Navigate to="/login" replace />} />

      {/* Painel de administrador — guardado por sessão + papel admin */}
      <Route path="/admin" element={<AdminRoute />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="usage" element={<AdminUsage />} />
        <Route path="affiliates" element={<AdminAffiliates />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
