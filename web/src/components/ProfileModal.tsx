import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import { useEscapeKey } from "../hooks/useEscapeKey";
import type { Profile } from "../hooks/useProfile";
import { useSubscription } from "../hooks/useSubscription";

interface Props {
  user: User;
  email: string | null;
  initialName: string;
  initialPhone: string;
  initialCpf: string;
  onClose: () => void;
  onSave: (fields: Partial<Profile>) => Promise<{ error: unknown }>;
}

/** Modal "Seu perfil" — edita nome, telefone e CPF (gravados em profiles) e
 *  mostra/gerencia a assinatura (plano atual, upgrade/downgrade, cancelamento).
 *  Layout: cabeçalho e rodapé fixos; só o miolo rola (o "Salvar" nunca some). */
export default function ProfileModal({
  user,
  email,
  initialName,
  initialPhone,
  initialCpf,
  onClose,
  onSave,
}: Props) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [cpf, setCpf] = useState(initialCpf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEscapeKey(onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const { error } = await onSave({
      full_name: name.trim() || null,
      phone: phone.trim() || null,
      cpf: cpf.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar.");
      return;
    }
    setDone(true);
  }

  const fieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";

  // Renderizado via portal no <body> para escapar do contexto de empilhamento do
  // header (senão o gráfico/canvas fica por cima do modal). z alto cobre tudo.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Wrapper que centraliza verticalmente quando cabe e empurra com folga
          (py) quando não cabe — o FUNDO rola, então o topo nunca é cortado. */}
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div
          className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold text-foreground">Seu perfil</h2>
            <p className="text-xs text-muted-foreground">
              Finalize seu cadastro para liberar alertas e personalização.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-lg leading-none text-muted-foreground transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>

          {/* Corpo: 2 colunas no desktop (assinatura | formulário) — cabe tudo numa
              tela só, sem rolagem interna; se a janela for muito baixa, o fundo rola. */}
          <div className="grid gap-5 p-5 md:grid-cols-2">
          <SubscriptionPanel user={user} onNavigate={onClose} />

          <form id="profile-form" onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Nome completo</span>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Telefone / WhatsApp</span>
              <input
                type="tel"
                className={`num ${fieldClass}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+55 11 99999-9999"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Usado para alertas por WhatsApp (plano Expert).
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">CPF</span>
              <input
                type="text"
                inputMode="numeric"
                className={`num ${fieldClass}`}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Necessário para pagamento em reais (Pix/cartão via Asaas).
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">E-mail</span>
              <input
                disabled
                value={email ?? ""}
                className="w-full cursor-not-allowed truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
              />
            </label>

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            {done && <p className="text-sm text-emerald-600 dark:text-emerald-400">Perfil atualizado! ✓</p>}
          </form>
        </div>

        {/* Rodapé (fixo) */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Fechar
          </button>
          <button
            type="submit"
            form="profile-form"
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Salvando…" : "Salvar"}
          </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// Escada de planos (para o seletor de upgrade/downgrade).
const TIERS: { slug: string; name: string; order: number }[] = [
  { slug: "free", name: "Free", order: 0 },
  { slug: "pro", name: "Pro", order: 1 },
  { slug: "expert", name: "Expert", order: 2 },
];

/** Bloco de assinatura: plano atual, status/vencimento, troca de plano
 *  (upgrade/downgrade) e cancelamento self-service. */
function SubscriptionPanel({ user, onNavigate }: { user: User; onNavigate: () => void }) {
  const { subscription, loading, cancel } = useSubscription(user);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentSlug = subscription?.plan?.slug ?? "free";
  const planName = subscription?.plan?.name ?? "Free";
  const isPaid = currentSlug !== "free";
  const status = subscription?.status ?? "active";
  const periodEnd = subscription?.current_period_end ?? null;
  const canceling = Boolean(subscription?.cancel_at_period_end);
  const currentOrder = TIERS.find((t) => t.slug === currentSlug)?.order ?? 0;
  const canDowngradeFree = isPaid && status === "active" && !canceling;

  const statusBadge =
    status === "past_due"
      ? { label: "em atraso", cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400" }
      : canceling
        ? { label: "cancela ao fim", cls: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400" }
        : { label: "ativa", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400" };

  async function doCancel() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { data, error } = await cancel();
    setBusy(false);
    setConfirming(false);
    if (error) {
      setErr(error instanceof Error ? error.message : "Falha ao cancelar.");
      return;
    }
    const d = data as { ok?: boolean; code?: string; message?: string; error?: string } | null;
    if (d?.error) return setErr(d.error);
    if (d?.code === "no_active") return setMsg(d.message ?? "Sem assinatura ativa.");
    setMsg("Você voltará ao plano Free ao fim do período já pago — o acesso fica garantido até lá.");
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assinatura</span>
        {isPaid && (
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-base font-bold text-foreground">Plano {planName}</span>
          </div>

          {!isPaid ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Você está no plano gratuito. Faça upgrade para liberar todos os recursos.
            </p>
          ) : canceling ? (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              Não renova. Acesso garantido até <b>{fmtDate(periodEnd)}</b>.
            </p>
          ) : status === "past_due" ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Pagamento em atraso — regularize para manter o acesso.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Renova automaticamente em <b className="text-foreground">{fmtDate(periodEnd)}</b>.
            </p>
          )}

          {msg && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>}
          {err && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{err}</p>}

          {confirming ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
              <p className="text-xs text-rose-700 dark:text-rose-400">
                Rebaixar para o plano <b>Free</b>? Você continua com acesso até <b>{fmtDate(periodEnd)}</b> e não será cobrado de novo.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={doCancel}
                  disabled={busy}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Processando…" : "Sim, rebaixar"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Mudar de plano
              </p>
              <div className="flex flex-col gap-1.5">
                {TIERS.filter((tier) => tier.slug !== currentSlug).map((tier) => {
                  const up = tier.order > currentOrder;
                  // Rebaixar para Free = cancelar a assinatura (mantém acesso até o fim).
                  if (tier.slug === "free") {
                    return (
                      <button
                        key={tier.slug}
                        onClick={() => setConfirming(true)}
                        disabled={!canDowngradeFree}
                        title={canDowngradeFree ? undefined : "Disponível com uma assinatura ativa"}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <span>⬇ Rebaixar para <b>Free</b></span>
                        <span className="text-muted-foreground">cancelar</span>
                      </button>
                    );
                  }
                  // Upgrade ou troca entre planos pagos → checkout em /pricing.
                  return (
                    <Link
                      key={tier.slug}
                      to="/pricing"
                      onClick={onNavigate}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        up
                          ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                          : "border-border text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>
                        {up ? "⬆ Fazer upgrade para " : "⬇ Mudar para "}
                        <b>{tier.name}</b>
                      </span>
                      <span className={up ? "text-primary/70" : "text-muted-foreground"}>{up ? "upgrade" : "downgrade"}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
