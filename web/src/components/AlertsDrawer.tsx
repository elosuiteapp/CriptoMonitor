import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "@supabase/supabase-js";

import { useEscapeKey } from "../hooks/useEscapeKey";
import { fmtPrice } from "../lib/format";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";
import type { GammaData, Plan } from "../lib/types";

/** Seletor curto PT/EN para os textos deste painel. */
type TT = (pt: string, en: string) => string;

interface AlertRow {
  id: string;
  asset: string;
  metric: string;
  condition: { op?: string; value?: number; equals?: string };
  active: boolean;
  last_triggered_at: string | null;
}

interface Props {
  user: User;
  plan: Plan;
  currentAsset: string;        // ativo aberto no cockpit
  price: number | null;        // preço atual do ativo aberto
  funding: number | null;      // funding atual (%) do ativo aberto
  gamma: GammaData | null;     // pra snap nos níveis (Zero Gamma, Walls, Max Pain)
  onClose: () => void;
}

const METRIC_IDS = ["price", "funding", "gamma_regime"] as const;
const metricLabel = (id: string, tt: TT) =>
  id === "price" ? tt("Preço (US$)", "Price (US$)") : id === "funding" ? "Funding (%)" : tt("Regime de gamma", "Gamma regime");

const PCT_PRESETS = [-10, -5, -2, 2, 5, 10];

const fieldCls =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

/** Arredonda o alvo para uma precisão sensata conforme a magnitude do preço. */
const roundPrice = (v: number) =>
  v >= 1000 ? Math.round(v) : v >= 1 ? Math.round(v * 100) / 100 : Number(v.toPrecision(4));

/** Níveis-chave do Módulo Gamma para o usuário "snapar" o alerta — mesmos que o
 *  gráfico desenha. Put/Call Wall derivam do profile_jsonb (min/max GEX), igual ao
 *  GammaProfileLine. Ordenados do maior para o menor (lê de cima pra baixo). */
function gammaLevels(g: GammaData | null): { name: string; value: number }[] {
  if (!g) return [];
  const out: { name: string; value: number }[] = [];
  if (g.zero_gamma_level != null) out.push({ name: "Zero Gamma", value: g.zero_gamma_level });
  if (g.max_pain != null) out.push({ name: "Max Pain", value: g.max_pain });
  const prof = g.profile_jsonb;
  if (prof) {
    const all = Object.entries(prof)
      .map(([s, gex]) => ({ strike: Number(s), gex: Number(gex) }))
      .filter((p) => Number.isFinite(p.strike) && Number.isFinite(p.gex));
    if (all.length) {
      out.push({ name: "Call Wall", value: all.reduce((m, p) => (p.gex > m.gex ? p : m)).strike });
      out.push({ name: "Put Wall", value: all.reduce((m, p) => (p.gex < m.gex ? p : m)).strike });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

/** Estado visual do alerta: verde = ativo aguardando, laranja = já atingido,
 *  cinza = pausado. Baseado em `active` + `last_triggered_at`. */
function alertStatus(r: AlertRow, tt: TT): { label: string; box: string; dot: string; text: string } {
  if (!r.active)
    return {
      label: tt("pausado", "paused"),
      box: "border-border bg-card opacity-60 dark:bg-card/60",
      dot: "bg-muted-foreground/50",
      text: "text-muted-foreground",
    };
  if (r.last_triggered_at)
    return {
      label: tt("atingido", "triggered"),
      box: "border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
    };
  return {
    label: tt("ativo", "active"),
    box: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  };
}

/** Texto legível de um alerta para a lista ("preço acima de US$ 66.000"). */
function describe(r: AlertRow, tt: TT): string {
  if (r.metric === "gamma_regime")
    return tt(
      `regime de gamma vira ${r.condition.equals === "positive" ? "positivo" : "negativo"}`,
      `gamma regime turns ${r.condition.equals === "positive" ? "positive" : "negative"}`,
    );
  const opLabel = r.condition.op === ">" ? tt("acima de", "above") : tt("abaixo de", "below");
  if (r.metric === "funding") return `funding ${opLabel} ${r.condition.value}%`;
  return tt(`preço ${opLabel} ${fmtPrice(r.condition.value)}`, `price ${opLabel} ${fmtPrice(r.condition.value)}`);
}

/** Painel lateral de alertas — abre SOBRE o cockpit (não troca de tela), já com o
 *  ativo/preço aberto, atalhos de % e níveis de gamma, e edição/exclusão. */
export default function AlertsDrawer({ user, plan, currentAsset, price, funding, gamma, onClose }: Props) {
  const { isEn } = useT();
  const tt: TT = (pt, en) => (isEn ? en : pt);
  const assets = plan.assets ?? ["BTC"];
  const [shown, setShown] = useState(false);
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // formulário
  const [asset, setAsset] = useState(assets.includes(currentAsset) ? currentAsset : assets[0] ?? "BTC");
  const [metric, setMetric] = useState("price");
  const [op, setOp] = useState(">");
  const [value, setValue] = useState("");
  const [regime, setRegime] = useState("negative");

  const canCreate = (plan.alert_channels ?? []).length > 0;
  const isExpert = plan.slug === "expert";
  // Opt-in de e-mail (só Expert) — guardado em profiles.email_alerts.
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  // Preço/funding/níveis de referência só valem para o ativo que está aberto no cockpit.
  const isCurrent = asset === currentAsset;
  const levels = useMemo(() => (isCurrent ? gammaLevels(gamma) : []), [isCurrent, gamma]);

  function close() {
    setShown(false);
    setTimeout(onClose, 200); // deixa a animação de saída terminar
  }
  useEscapeKey(close);

  useEffect(() => {
    setShown(true);
  }, []);

  async function load() {
    const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: false });
    setRows((data as AlertRow[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  // Carrega o opt-in de e-mail atual (só faz sentido no Expert).
  useEffect(() => {
    if (!isExpert) return;
    supabase
      .from("profiles")
      .select("email_alerts")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setEmailAlerts(Boolean((data as { email_alerts?: boolean } | null)?.email_alerts)));
  }, [isExpert, user.id]);

  async function toggleEmailAlerts() {
    const next = !emailAlerts;
    setEmailAlerts(next);
    setEmailBusy(true);
    const { error } = await supabase.from("profiles").update({ email_alerts: next }).eq("id", user.id);
    if (error) setEmailAlerts(!next); // reverte se falhar
    setEmailBusy(false);
  }

  // Pré-preenche o valor com o preço/funding atual do ativo aberto (só quando vazio
  // e fora do modo edição) — o usuário só empurra pra cima/baixo. `value` fica fora
  // das deps de propósito (senão re-dispara a cada digitação).
  useEffect(() => {
    if (editingId) return;
    if (value !== "") return;
    if (metric === "price" && isCurrent && price != null) setValue(String(roundPrice(price)));
    else if (metric === "funding" && isCurrent && funding != null) setValue(String(funding));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, asset, price, funding, isCurrent, editingId]);

  function applyTarget(target: number) {
    setValue(String(roundPrice(target)));
    if (price != null) setOp(target >= price ? ">" : "<");
  }

  function startEdit(r: AlertRow) {
    setEditingId(r.id);
    setError(null);
    setAsset(r.asset);
    setMetric(r.metric);
    if (r.metric === "gamma_regime") {
      setRegime(r.condition.equals ?? "negative");
    } else {
      setOp(r.condition.op ?? ">");
      setValue(r.condition.value != null ? String(r.condition.value) : "");
    }
  }

  function resetForm() {
    setEditingId(null);
    setError(null);
    setMetric("price");
    setOp(">");
    setValue("");
    setRegime("negative");
    setAsset(assets.includes(currentAsset) ? currentAsset : assets[0] ?? "BTC");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const condition = metric === "gamma_regime" ? { equals: regime } : { op, value: Number(value) };
      if (editingId) {
        const { error } = await supabase.from("alerts").update({ asset, metric, condition }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("alerts")
          .insert({ user_id: user.id, asset, metric, condition, channel: "inapp" });
        if (error) throw error;
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("Falha ao salvar alerta", "Failed to save alert"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await supabase.from("alerts").delete().eq("id", id);
    if (editingId === id) resetForm();
    await load();
  }

  async function toggleActive(r: AlertRow) {
    await supabase.from("alerts").update({ active: !r.active }).eq("id", r.id);
    await load();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      {/* fundo escurecido — clique fora fecha */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
      />

      {/* painel deslizante (direita) */}
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{tt("Alertas", "Alerts")}</h2>
            <p className="text-xs text-muted-foreground">
              {tt(
                "Aviso no sistema (sino + pop-up) e, se permitir, push do navegador — mesmo com o app fechado.",
                "In-app alert (bell + pop-up) and, if allowed, browser push — even with the app closed.",
              )}
            </p>
          </div>
          <button
            onClick={close}
            aria-label={tt("Fechar (ESC)", "Close (ESC)")}
            title={tt("Fechar (ESC)", "Close (ESC)")}
            className="shrink-0 text-lg leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Opt-in de e-mail: toggle no Expert, vitrine de upgrade no Pro. */}
          {isExpert ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 dark:bg-card/60">
              <span className="text-sm text-foreground">
                {tt("Receber alertas por e-mail", "Receive email alerts")}
                <span className="mt-0.5 block text-xs text-muted-foreground">{tt("Enviado para", "Sent to")} {user.email}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={emailAlerts}
                aria-label={tt("Receber alertas por e-mail", "Receive email alerts")}
                disabled={emailBusy}
                onClick={toggleEmailAlerts}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${emailAlerts ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${emailAlerts ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
          ) : canCreate ? (
            <a
              href="/pricing"
              className="mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-xs text-primary transition-colors hover:bg-primary/10"
            >
              {tt("✉️ Receba alertas também por e-mail no plano Expert →", "✉️ Get email alerts too on the Expert plan →")}
            </a>
          ) : null}
          {!canCreate ? (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground dark:bg-card/60">
              {tt("Alertas estão disponíveis nos planos", "Alerts are available on the")} <strong>Pro</strong> {tt("e", "and")} <strong>Expert</strong>{tt(".", " plans.")}{" "}
              <a href="/pricing" className="text-primary hover:underline">
                {tt("Ver planos →", "See plans →")}
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4 dark:bg-card/60">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">
                  {tt("Ativo", "Asset")}
                  <select value={asset} onChange={(e) => setAsset(e.target.value)} className={`num ${fieldCls}`}>
                    {assets.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  {tt("Métrica", "Metric")}
                  <select value={metric} onChange={(e) => setMetric(e.target.value)} className={fieldCls}>
                    {METRIC_IDS.map((id) => (
                      <option key={id} value={id}>
                        {metricLabel(id, tt)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {metric === "gamma_regime" ? (
                <label className="block text-xs text-muted-foreground">
                  {tt("Quando o regime virar", "When the regime flips")}
                  <select value={regime} onChange={(e) => setRegime(e.target.value)} className={fieldCls}>
                    <option value="negative">{tt("Negativo (movimentos amplificados)", "Negative (amplified moves)")}</option>
                    <option value="positive">{tt("Positivo (volatilidade amortecida)", "Positive (dampened volatility)")}</option>
                  </select>
                </label>
              ) : (
                <>
                  {isCurrent && metric === "price" && price != null && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{asset} {tt("agora", "now")}</span>
                      <span className="num font-semibold text-foreground">{fmtPrice(price)}</span>
                    </div>
                  )}
                  {isCurrent && metric === "funding" && funding != null && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{tt("Funding agora", "Funding now")}</span>
                      <span className="num font-semibold text-foreground">{funding}%</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-muted-foreground">
                      {tt("Condição", "Condition")}
                      <select value={op} onChange={(e) => setOp(e.target.value)} className={fieldCls}>
                        <option value=">">{tt("acima de", "above")}</option>
                        <option value="<">{tt("abaixo de", "below")}</option>
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      {tt("Valor", "Value")} {metric === "funding" ? "(%)" : "(US$)"}
                      <input
                        type="number"
                        step="any"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        required
                        className={`num ${fieldCls}`}
                      />
                    </label>
                  </div>

                  {/* Atalhos: só para o ativo aberto e métrica preço */}
                  {isCurrent && metric === "price" && price != null && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {PCT_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => applyTarget(price * (1 + p / 100))}
                            className="num rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
                          >
                            {p > 0 ? `+${p}` : p}%
                          </button>
                        ))}
                      </div>
                      {levels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {levels.map((lv) => (
                            <button
                              key={lv.name}
                              type="button"
                              onClick={() => applyTarget(lv.value)}
                              title={tt(`Alertar no ${lv.name} (${fmtPrice(lv.value)})`, `Alert at ${lv.name} (${fmtPrice(lv.value)})`)}
                              className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/10"
                            >
                              {lv.name} · <span className="num">{fmtPrice(lv.value)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? "…" : editingId ? tt("Salvar alterações", "Save changes") : tt("Criar alerta", "Create alert")}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {tt("Cancelar", "Cancel")}
                  </button>
                )}
              </div>
            </form>
          )}

          <h3 className="mt-6 text-sm font-semibold text-foreground">{tt("Seus alertas", "Your alerts")}</h3>
          <div className="mt-3 space-y-2">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">{tt("Nenhum alerta criado ainda.", "No alerts created yet.")}</p>}
            {rows.map((r) => {
              const st = alertStatus(r, tt);
              const boxCls = editingId === r.id ? "border-primary bg-primary/5" : st.box;
              return (
                <div key={r.id} className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${boxCls}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-foreground">
                      <strong>{r.asset}</strong> · {describe(r, tt)}
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${st.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                    <button onClick={() => toggleActive(r)} className="text-muted-foreground transition-colors hover:text-foreground">
                      {r.active ? tt("Pausar", "Pause") : tt("Reativar", "Resume")}
                    </button>
                    <button onClick={() => startEdit(r)} className="text-primary hover:underline">
                      {tt("Editar", "Edit")}
                    </button>
                    <button onClick={() => remove(r.id)} className="text-rose-600 hover:underline dark:text-rose-400">
                      {tt("Excluir", "Delete")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
