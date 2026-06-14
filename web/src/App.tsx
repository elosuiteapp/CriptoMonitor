import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./hooks/useAuth";
import Alerts from "./pages/Alerts";
import Analysis from "./pages/Analysis";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Pricing from "./pages/Pricing";

function Loading() {
  return <div className="grid h-full place-items-center text-slate-500">Carregando…</div>;
}

export default function App() {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="/analysis" element={session ? <Analysis /> : <Navigate to="/login" replace />} />
      <Route path="/alerts" element={session ? <Alerts /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
