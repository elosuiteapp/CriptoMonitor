import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Disclaimer from "../components/Disclaimer";
import { useAuth } from "../hooks/useAuth";
import { usePlan } from "../hooks/usePlan";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";

interface AlertRow {
  id: string;
  asset: string;
  metric: string;
  condition: { op?: string; value?: number; equals?: string };
  active: boolean;
}

export default function Alerts() {
  const { t } = useT();
  const { user } = useAuth();
  const { plan } = usePlan(user?.id);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formulário
  const [asset, setAsset] = useState("BTC");
  const [metric, setMetric] = useState("price");
  const [op, setOp] = useState(">");
  const [value, setValue] = useState("");
  const [regime, setRegime] = useState("negative");

  const assets = plan?.assets ?? ["BTC"];
  const METRICS = [
    { id: "price", label: t.pages.alerts.metricPrice },
    { id: "funding", label: t.pages.alerts.metricFunding },
    { id: "gamma_regime", label: t.pages.alerts.metricRegime },
  ];
  // Alertas seguem sendo um recurso de plano pago (Pro/Expert). A entrega agora é
  // sempre no sistema (sino + pop-up) e, se o usuário permitir, push do navegador.
  const canCreate = (plan?.alert_channels ?? []).length > 0;

  async function load() {
    const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: false });
    setRows((data as AlertRow[]) ?? []);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  useEffect(() => {
    if (assets.length && !assets.includes(asset)) setAsset(assets[0]);
  }, [plan]);

  async function createAlert(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Funding é comparado contra derivatives.funding_rate, que está em PERCENT
      // (Coinalyze: 0,01 = 0,01%). O usuário digita em % → guarda em % (sem /100).
      const condition =
        metric === "gamma_regime"
          ? { equals: regime }
          : { op, value: Number(value) };
      const { error } = await supabase.from("alerts").insert({
        user_id: user!.id,
        asset,
        metric,
        condition,
        channel: "inapp",
      });
      if (error) throw error;
      setValue("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.pages.alerts.createFail);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await supabase.from("alerts").delete().eq("id", id);
    await load();
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          {t.pages.backCockpit}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-foreground">{t.pages.alerts.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.pages.alerts.sub}
        </p>

        {!canCreate ? (
          <div className="mt-6 rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 p-6 text-sm text-muted-foreground">
            {t.pages.alerts.gatedPre}<strong>Pro</strong>{t.pages.alerts.gatedAnd}<strong>Expert</strong>{t.pages.alerts.gatedPost}
            <Link to="/pricing" className="text-primary hover:underline">
              {t.pages.alerts.seePlans}
            </Link>
          </div>
        ) : (
          <form onSubmit={createAlert} className="mt-6 grid gap-3 rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 p-5 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              {t.pages.alerts.asset}
              <select value={asset} onChange={(e) => setAsset(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground num">
                {assets.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              {t.pages.alerts.metric}
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>

            {metric === "gamma_regime" ? (
              <label className="text-xs text-muted-foreground sm:col-span-2">
                {t.pages.alerts.whenRegime}
                <select value={regime} onChange={(e) => setRegime(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                  <option value="negative">{t.pages.alerts.regimeNeg}</option>
                  <option value="positive">{t.pages.alerts.regimePos}</option>
                </select>
              </label>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">
                  {t.pages.alerts.condition}
                  <select value={op} onChange={(e) => setOp(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <option value=">">{t.pages.alerts.above}</option>
                    <option value="<">{t.pages.alerts.below}</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {metric === "funding" ? t.pages.alerts.valuePct : t.pages.alerts.valueUsd}
                  <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} required className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground num" />
                </label>
              </>
            )}

            <div className="flex items-end sm:col-span-2">
              <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? "…" : t.pages.alerts.create}
              </button>
            </div>
            {error && <p className="text-sm text-rose-600 dark:text-rose-400 sm:col-span-2">{error}</p>}
          </form>
        )}

        <h2 className="mt-8 text-sm font-semibold text-foreground">{t.pages.alerts.yourAlerts}</h2>
        <div className="mt-3 space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">{t.pages.alerts.none}</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 px-4 py-3 text-sm">
              <span className="text-foreground">
                <strong>{r.asset}</strong> · {r.metric}{" "}
                {r.condition.equals ? `→ ${r.condition.equals}` : `${r.condition.op} ${r.condition.value}`}
              </span>
              <button onClick={() => remove(r.id)} className="text-xs text-rose-600 dark:text-rose-400 hover:underline">
                {t.pages.alerts.delete}
              </button>
            </div>
          ))}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}
