import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "./hooks/useAuth";
import { useReferralCapture } from "./hooks/useReferralCapture";
import { useT } from "./lib/i18n";
import Alerts from "./pages/Alerts";
import Analysis from "./pages/Analysis";
import B3Analysis from "./pages/B3Analysis";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Newsletter from "./pages/Newsletter";
import NewsletterEdition from "./pages/NewsletterEdition";
import NotFound from "./pages/NotFound";
import Obrigado from "./pages/Obrigado";
import Pricing from "./pages/Pricing";
import AdminAffiliates from "./pages/admin/Affiliates";
import AdminRoute from "./pages/admin/AdminRoute";
import AdminAudit from "./pages/admin/Audit";
import AdminNewsletter from "./pages/admin/Newsletter";
import AdminSocial from "./pages/admin/Social";
import AdminOverview from "./pages/admin/Overview";
import AdminPlans from "./pages/admin/Plans";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AdminSystem from "./pages/admin/System";
import AdminUsage from "./pages/admin/Usage";
import AdminUsers from "./pages/admin/Users";

function Loading() {
  const { t: tr } = useT();
  return <div className="grid h-full place-items-center text-muted-foreground">{tr.common.loading}</div>;
}

// Rota protegida acessada deslogado (ex.: deep-link da newsletter vindo do site):
// guarda o destino e manda para o login; o App redireciona de volta após autenticar.
function CaptureAndLogin() {
  const location = useLocation();
  useEffect(() => {
    try {
      sessionStorage.setItem("ov.after-login", location.pathname + location.search);
    } catch {
      /* indisponível */
    }
  }, [location.pathname, location.search]);
  return <Navigate to="/login" replace />;
}

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useReferralCapture(session);

  // Intenção de assinatura vinda da landing (?plan=pro|expert): guarda para abrir o
  // checkout do plano logo após o login (sobrevive ao redirect do OAuth via sessionStorage).
  useEffect(() => {
    const plan = new URLSearchParams(location.search).get("plan");
    if (plan === "pro") {
      try {
        sessionStorage.setItem("ov.pending-plan", plan);
      } catch {
        /* sessionStorage indisponível */
      }
    }
  }, [location.search]);

  // Após autenticar, volta ao destino guardado por uma rota protegida (deep-link).
  useEffect(() => {
    if (!session) return;
    let next: string | null = null;
    try {
      next = sessionStorage.getItem("ov.after-login");
    } catch {
      /* indisponível */
    }
    if (next) {
      try {
        sessionStorage.removeItem("ov.after-login");
      } catch {
        /* indisponível */
      }
      navigate(next, { replace: true });
    }
  }, [session, navigate]);

  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/obrigado" element={<Obrigado />} />
      <Route path="/newsletter" element={session ? <Newsletter /> : <CaptureAndLogin />} />
      <Route path="/newsletter/:slug" element={session ? <NewsletterEdition /> : <CaptureAndLogin />} />
      <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/analysis" element={session ? <Analysis /> : <Navigate to="/login" replace />} />
      <Route path="/b3-analysis" element={session ? <B3Analysis /> : <Navigate to="/login" replace />} />
      <Route path="/alerts" element={session ? <Alerts /> : <Navigate to="/login" replace />} />

      {/* Painel de administrador — guardado por sessão + papel admin */}
      <Route path="/admin" element={<AdminRoute />}>
        <Route index element={<AdminOverview />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="usage" element={<AdminUsage />} />
        <Route path="affiliates" element={<AdminAffiliates />} />
        <Route path="newsletter" element={<AdminNewsletter />} />
        <Route path="social" element={<AdminSocial />} />
        <Route path="system" element={<AdminSystem />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
