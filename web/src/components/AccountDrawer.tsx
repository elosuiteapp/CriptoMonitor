import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";

import { getLocale } from "../hooks/useLocale";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useProfile } from "../hooks/useProfile";
import { useSubscription } from "../hooks/useSubscription";
import { useT } from "../lib/i18n";
import { supabase } from "../lib/supabase";

const ANNUAL_DISCOUNT = 0.3; // sincronizar com Pricing/asaas-checkout

interface Props {
  user: User;
  welcome?: boolean; // primeiro acesso (boas-vindas)
  intentPlan?: "pro" | "expert"; // veio da landing querendo assinar este plano
  onClose: () => void;
}

const PLAN_NAME: Record<string, string> = { free: "Free", pro: "Pro", expert: "Expert" };

const fieldCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(getLocale() === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/** Painel "Sua conta" — slide-over (direita) com PLANO (upgrade/checkout direto +
 *  troca/cancelamento) e PERFIL (nome, telefone, CPF). Substitui o ProfileModal. */
export default function AccountDrawer({ user, welcome, intentPlan, onClose }: Props) {
  const { t } = useT();
  const UPGRADE: { slug: "pro" | "expert"; tag?: string; features: string[] }[] = [
    { slug: "pro", tag: t.accountDrawer.tagPopular, features: t.accountDrawer.proFeatures },
    { slug: "expert", features: t.accountDrawer.expertFeatures },
  ];
  const navigate = useNavigate();
  const { profile, save } = useProfile(user);
  const { subscription, loading: subLoading, cancel } = useSubscription(user);

  const [shown, setShown] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

  // perfil
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // plano
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  function close() {
    setShown(false);
    setTimeout(onClose, 200);
  }
  useEscapeKey(close);
  useEffect(() => setShown(true), []);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setCpf(profile.cpf ?? "");
    }
  }, [profile]);

  useEffect(() => {
    supabase
      .from("plans")
      .select("slug, price_cents")
      .then(({ data }) => {
        const m: Record<string, number> = {};
        (data as { slug: string; price_cents: number }[] | null)?.forEach((p) => (m[p.slug] = p.price_cents));
        setPrices(m);
      });
  }, []);

  const currentSlug = subscription?.plan?.slug ?? "free";
  const isPaid = currentSlug !== "free";
  const status = subscription?.status ?? "active";
  const periodEnd = subscription?.current_period_end ?? null;
  const canceling = Boolean(subscription?.cancel_at_period_end);

  const brl = (cents: number) => `R$ ${Math.round(cents / 100)}`;
  const annualCents = (monthlyCents: number) => Math.round((monthlyCents / 100) * 12 * (1 - ANNUAL_DISCOUNT)) * 100;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await save({ full_name: name.trim() || null, phone: phone.trim() || null, cpf: cpf.trim() || null });
    setSavingProfile(false);
    setProfileMsg(error ? t.accountDrawer.saveError : t.accountDrawer.saved);
  }

  async function startCheckout(slug: "pro" | "expert") {
    setCheckoutMsg(null);
    setCheckoutBusy(slug);
    try {
      const { data, error } = await supabase.functions.invoke("asaas-checkout", { body: { plan_slug: slug, cycle } });
      if (error) throw error;
      if (data?.code === "cpf_required") {
        setCheckoutMsg(t.accountDrawer.cpfRequired);
        return;
      }
      if (data?.url) {
        window.location.href = data.url as string;
        return;
      }
      throw new Error(data?.error || t.accountDrawer.checkoutUnavailable);
    } catch (e) {
      setCheckoutMsg(e instanceof Error ? e.message : t.accountDrawer.checkoutFail);
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function doDowngrade() {
    setCheckoutBusy("free");
    setCancelMsg(null);
    const { data, error } = await cancel();
    setCheckoutBusy(null);
    setConfirming(false);
    if (error) return setCancelMsg(error instanceof Error ? error.message : t.accountDrawer.cancelFail);
    const d = data as { code?: string; message?: string } | null;
    setCancelMsg(d?.message ?? t.accountDrawer.downgradeOk);
  }

  const statusLine = canceling
    ? t.accountDrawer.statusNoRenew.replace("{date}", fmtDate(periodEnd))
    : status === "past_due"
      ? t.accountDrawer.statusPastDue
      : isPaid
        ? t.accountDrawer.statusRenews.replace("{date}", fmtDate(periodEnd))
        : t.accountDrawer.statusFree;

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={close}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ${shown ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold text-foreground">{welcome ? t.accountDrawer.welcomeTitle : t.accountDrawer.accountTitle}</h2>
            <p className="text-xs text-muted-foreground">
              {welcome ? t.accountDrawer.welcomeSub : t.accountDrawer.accountSub}
            </p>
          </div>
          <button onClick={close} aria-label={t.accountDrawer.closeAria} className="shrink-0 text-lg leading-none text-muted-foreground transition-colors hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* ─── PLANO ─── */}
          <section>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.accountDrawer.plan}</span>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  isPaid
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {PLAN_NAME[currentSlug] ?? currentSlug}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{subLoading ? t.common.loading : statusLine}</p>
            {intentPlan && !isPaid && (
              <p className="mt-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                {t.accountDrawer.chosePlan.replace("{plan}", PLAN_NAME[intentPlan])}
              </p>
            )}

            {!isPaid ? (
              <>
                {/* Toggle ciclo */}
                <div className="mt-4 inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs dark:bg-card/60">
                  {(["monthly", "annual"] as const).map((cy) => (
                    <button
                      key={cy}
                      onClick={() => setCycle(cy)}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${cycle === cy ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {cy === "monthly" ? t.accountDrawer.monthly : t.accountDrawer.annualOff}
                    </button>
                  ))}
                </div>

                {/* Cards de upgrade */}
                <div className="mt-3 space-y-3">
                  {UPGRADE.map((u) => {
                    const m = prices[u.slug];
                    const showAnnual = cycle === "annual" && m;
                    return (
                      <div
                        key={u.slug}
                        className={`rounded-xl border p-4 ${
                          u.slug === intentPlan
                            ? "border-primary bg-primary/[0.08] ring-2 ring-primary/40"
                            : u.tag
                              ? "border-primary/40 bg-primary/[0.06]"
                              : "border-border bg-card dark:bg-card/60"
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{PLAN_NAME[u.slug]}</span>
                            {u.tag && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{u.tag}</span>}
                          </div>
                          {m ? (
                            <div className="text-right">
                              <span className="num text-lg font-bold text-foreground">
                                {showAnnual ? brl(annualCents(m)) : brl(m)}
                              </span>
                              <span className="text-xs text-muted-foreground">{showAnnual ? t.accountDrawer.perYear : t.accountDrawer.perMonth}</span>
                            </div>
                          ) : null}
                        </div>
                        <ul className="mt-2.5 space-y-1.5 text-xs text-muted-foreground">
                          {u.features.map((f) => (
                            <li key={f} className="flex gap-1.5">
                              <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => startCheckout(u.slug)}
                          disabled={checkoutBusy !== null}
                          className={`mt-3 w-full rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${u.tag ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"}`}
                        >
                          {checkoutBusy === u.slug ? t.accountDrawer.redirecting : t.accountDrawer.subscribe.replace("{plan}", PLAN_NAME[u.slug])}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {checkoutMsg && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{checkoutMsg}</p>}
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{t.accountDrawer.payNote}</p>
              </>
            ) : (
              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    close();
                    navigate("/pricing");
                  }}
                  className="w-full rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  {t.accountDrawer.changePlan}
                </button>
                {status === "active" && !canceling &&
                  (confirming ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                      <p className="text-xs text-rose-700 dark:text-rose-400">
                        {t.accountDrawer.downgradeConfirmPre} <b>Free</b>{t.accountDrawer.downgradeConfirmMid} <b>{fmtDate(periodEnd)}</b>{t.accountDrawer.downgradeConfirmPost}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button onClick={doDowngrade} disabled={checkoutBusy === "free"} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
                          {checkoutBusy === "free" ? "…" : t.accountDrawer.yesDowngrade}
                        </button>
                        <button onClick={() => setConfirming(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
                          {t.accountDrawer.back}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirming(true)} className="w-full rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {t.accountDrawer.downgrade}
                    </button>
                  ))}
                {cancelMsg && <p className="text-xs text-emerald-600 dark:text-emerald-400">{cancelMsg}</p>}
              </div>
            )}
          </section>

          {/* ─── PERFIL ─── */}
          <section className="border-t border-border pt-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.accountDrawer.profile}</span>
            <form onSubmit={saveProfile} className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.accountDrawer.fullName}</span>
                <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.accountDrawer.namePlaceholder} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.accountDrawer.phone}</span>
                <input type="tel" className={`num ${fieldCls}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-9999" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.accountDrawer.cpf}</span>
                <input inputMode="numeric" className={`num ${fieldCls}`} value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
                <span className="mt-1 block text-[11px] text-muted-foreground">{t.accountDrawer.cpfNote}</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t.accountDrawer.email}</span>
                <input disabled value={user.email ?? ""} className="w-full cursor-not-allowed truncate rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground" />
              </label>
              <div className="flex items-center justify-between gap-3 pt-1">
                {profileMsg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{profileMsg}</span>}
                <button type="submit" disabled={savingProfile} className="ml-auto rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                  {savingProfile ? t.accountDrawer.saving : t.accountDrawer.save}
                </button>
              </div>
            </form>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
