import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";
import { fmtBRL, fmtDate, fmtDateTime, fmtInt, timeAgo } from "../../lib/adminFormat";
import type { AdminUserDetail } from "../../lib/adminTypes";
import { Badge, Card, ErrorBox, GatewayBadge, SectionTitle, StatusBadge } from "./ui";

interface PlanOption { slug: string; name: string; }

export default function UserDetailModal({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  // formulário de assinatura
  const [planSlug, setPlanSlug] = useState("free");
  const [statusVal, setStatusVal] = useState("active");
  const [periodEnd, setPeriodEnd] = useState("");
  const [comp, setComp] = useState(false);
  const [compReason, setCompReason] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(userId);
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_user_detail", { p_uid: userId });
    if (error) setError(error.message);
    else {
      const d = data as AdminUserDetail;
      setDetail(d);
      const active = d.subscriptions.find((s) => s.status === "active");
      const ref = active ?? d.subscriptions[0];
      if (ref) {
        setPlanSlug(ref.plan_slug);
        setPeriodEnd(ref.current_period_end ? ref.current_period_end.slice(0, 10) : "");
        setComp(ref.comp ?? false);
        if (ref.comp_reason) setCompReason(ref.comp_reason);
      }
      // Sem assinatura ATIVA, o admin quase sempre quer ATIVAR um plano (upgrade/troca)
      // → default "active". Se houver ativa, reflete o status real dela.
      setStatusVal(active ? active.status : "active");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    supabase
      .from("plans")
      .select("slug, name")
      .order("sort_order")
      .then(({ data }) => setPlans((data as PlanOption[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    const { error } = await supabase.rpc("admin_set_subscription", {
      p_uid: userId,
      p_plan_slug: planSlug,
      p_status: statusVal,
      p_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
      p_comp: comp,
      p_comp_reason: comp ? compReason : null,
    });
    setBusy(false);
    if (error) setActionError(error.message);
    else {
      setActionMsg("Assinatura atualizada.");
      await load();
      onChanged();
    }
  }

  async function toggleRole() {
    if (!detail) return;
    const next = detail.profile.role === "admin" ? "user" : "admin";
    if (!confirm(next === "admin" ? "Tornar este usuário administrador?" : "Remover acesso de administrador?")) return;
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    const { error } = await supabase.rpc("admin_set_user_role", { p_uid: userId, p_role: next });
    setBusy(false);
    if (error) setActionError(error.message);
    else {
      setActionMsg(next === "admin" ? "Promovido a admin." : "Rebaixado a usuário.");
      await load();
      onChanged();
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div
        className="my-8 w-full max-w-2xl rounded-2xl border border-border bg-card transition-all duration-200 hover:border-foreground/15 hover:shadow-card-hover dark:bg-card/60 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{detail?.profile.email ?? "Usuário"}</h2>
            {detail && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{detail.profile.full_name ?? "sem nome"}</span>
                {detail.profile.role === "admin" && <Badge tone="accent">admin</Badge>}
                <button onClick={copyId} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-muted" title="Copiar ID do usuário">
                  {idCopied ? "id copiado!" : `id: ${userId.slice(0, 8)}…`}
                </button>
                {detail.referral && (
                  <span>· veio de <b className="text-foreground">{detail.referral.name}</b> <span className="font-mono">({detail.referral.code})</span></span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>}
          {error && <ErrorBox message={error} />}

          {detail && (
            <>
              {/* Resumo */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Info label="Telefone" value={detail.profile.phone ?? "—"} />
                <Info label="CPF" value={detail.profile.cpf ?? "—"} />
                <Info label="Cadastro" value={fmtDate(detail.profile.created_at)} />
                <Info label="Último acesso" value={timeAgo(detail.profile.last_sign_in_at)} />
                <Info label="E-mail confirmado" value={detail.profile.email_confirmed_at ? "sim" : "não"} />
                <Info label="Análises (total)" value={fmtInt(detail.ai_total)} />
                <Info label="Uso 30d (cota)" value={fmtInt(detail.usage_30d)} />
                <Info label="Alertas" value={fmtInt(detail.alerts.length)} />
              </div>

              {/* Gerenciar assinatura */}
              <Card className="p-4">
                <SectionTitle>Gerenciar assinatura</SectionTitle>
                <form onSubmit={saveSubscription} className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-muted-foreground">
                    Plano
                    <select value={planSlug} onChange={(e) => setPlanSlug(e.target.value)} className={`mt-1 ${inputCls}`}>
                      {plans.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Status
                    <select value={statusVal} onChange={(e) => setStatusVal(e.target.value)} className={`mt-1 ${inputCls}`}>
                      <option value="active">Ativa</option>
                      <option value="past_due">Em atraso</option>
                      <option value="canceled">Cancelada</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    Vence em (opcional)
                    <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={`mt-1 ${inputCls}`} />
                  </label>
                  {/* Cortesia: libera o plano sem entrar na receita (admin, afiliado, equipe…) */}
                  <div className="rounded-lg border border-border bg-muted/40 p-3 sm:col-span-3">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={comp} onChange={(e) => setComp(e.target.checked)} className="h-4 w-4 accent-primary" />
                      Cortesia <span className="text-xs text-muted-foreground">— acesso liberado, <b>não conta como receita</b> (MRR)</span>
                    </label>
                    {comp && (
                      <label className="mt-2 block text-xs text-muted-foreground">
                        Motivo
                        <select value={compReason} onChange={(e) => setCompReason(e.target.value)} className={`mt-1 sm:max-w-xs ${inputCls}`}>
                          <option value="admin">Admin / interno</option>
                          <option value="affiliate">Afiliado</option>
                          <option value="team">Equipe</option>
                          <option value="partner">Parceiro</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <p className="-mt-1 text-[11px] text-muted-foreground sm:col-span-3">
                    Para liberar ou fazer <b>upgrade</b> de um plano, escolha o plano e deixe o status em <b>Ativa</b>. “Cancelada” derruba o acesso (volta para Free).
                    Marque <b>Cortesia</b> para liberar sem cobrar (sua conta, afiliados, equipe) — <b>não gera cobrança no Asaas/cartão</b> nem entra no faturamento.
                  </p>
                  <div className="sm:col-span-3 flex items-center gap-3">
                    <button type="submit" disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {busy ? "…" : "Salvar assinatura"}
                    </button>
                    <button type="button" onClick={toggleRole} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50">
                      {detail.profile.role === "admin" ? "Remover admin" : "Tornar admin"}
                    </button>
                    {actionMsg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{actionMsg}</span>}
                  </div>
                  {actionError && <div className="sm:col-span-3"><ErrorBox message={actionError} /></div>}
                </form>
              </Card>

              {/* Histórico de assinaturas */}
              <div>
                <SectionTitle>Histórico de assinaturas</SectionTitle>
                <div className="mt-2 space-y-2">
                  {detail.subscriptions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma.</p>}
                  {detail.subscriptions.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 text-foreground">
                        {s.plan_name} ·{" "}
                        {s.comp ? (
                          <span className="flex items-center gap-1.5">
                            <span className="num text-muted-foreground line-through">{fmtBRL(s.price_cents)}</span>
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">sem cobrança</span>
                          </span>
                        ) : (
                          <span><span className="num">{fmtBRL(s.price_cents)}</span>/mês</span>
                        )}
                        {s.comp ? <Badge tone="accent">cortesia</Badge> : <GatewayBadge gateway={s.gateway} />}
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        <StatusBadge status={s.status} />
                        <span>{fmtDate(s.created_at)} {s.current_period_end ? `→ ${fmtDate(s.current_period_end)}` : ""}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alertas */}
              <div>
                <SectionTitle>Alertas ({detail.alerts.length})</SectionTitle>
                <div className="mt-2 space-y-1">
                  {detail.alerts.length === 0 && <p className="text-sm text-muted-foreground">Nenhum.</p>}
                  {detail.alerts.map((a) => (
                    <div key={a.id} className="rounded-lg border border-border px-3 py-2 text-xs text-foreground">
                      <strong>{a.asset}</strong> · {a.metric} · {a.channel} {a.active ? "" : "(inativo)"}
                    </div>
                  ))}
                </div>
              </div>

              {/* Análises recentes */}
              <div>
                <SectionTitle>Análises recentes</SectionTitle>
                <div className="mt-2 space-y-2">
                  {detail.recent_analyses.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma.</p>}
                  {detail.recent_analyses.map((an) => (
                    <div key={an.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span><strong className="text-foreground">{an.asset}</strong> · {an.model_used} · {an.report_type}</span>
                        <span>{fmtDateTime(an.created_at)}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{an.preview}…</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  );
}
