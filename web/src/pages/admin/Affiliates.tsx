import { useEffect, useState } from "react";

import { IconAffiliate } from "../../components/admin/icons";
import { Badge, Card, Empty, ErrorBox, PageHeader, SectionTitle, Skeleton } from "../../components/admin/ui";
import { fmtBRL, fmtDate, fmtInt } from "../../lib/adminFormat";
import { supabase } from "../../lib/supabase";

type Affiliate = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  pix_key: string | null;
  commission_percent: number;
  status: "active" | "disabled";
  created_at: string;
  referred_total: number;
  customers_active: number;
  pending_cents: number;
  paid_cents: number;
  lifetime_cents: number;
  account_user_id: string | null;
  account_plan: string | null;
  account_comp: boolean;
};

type Detail = {
  affiliate: { id: string; code: string; name: string; email: string | null; pix_key: string | null; commission_percent: number; status: string; notes: string | null; created_at: string };
  referrals: { id: string; email: string; full_name: string | null; created_at: string; plan_slug: string | null; sub_status: string | null }[];
  commissions: { id: string; created_at: string; gross_amount_cents: number; currency: string; commission_percent: number; commission_amount_cents: number; status: string; paid_at: string | null; customer_email: string | null }[];
};

const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";
const labelCls = "text-xs text-muted-foreground";

function refLink(code: string) {
  return `${window.location.origin}/?ref=${code}`;
}

export default function Affiliates() {
  const [rows, setRows] = useState<Affiliate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setError(null);
    const { data, error } = await supabase.rpc("admin_list_affiliates");
    if (error) setError(error.message);
    else setRows((data ?? []) as Affiliate[]);
  }

  useEffect(() => {
    load();
  }, []);

  const totalPending = (rows ?? []).reduce((s, a) => s + a.pending_cents, 0);
  const totalActiveCustomers = (rows ?? []).reduce((s, a) => s + a.customers_active, 0);
  const term = q.trim().toLowerCase();
  const filtered = (rows ?? []).filter((a) => !term || [a.code, a.name, a.email].some((s) => (s ?? "").toLowerCase().includes(term)));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<IconAffiliate />}
        title="Afiliados"
        subtitle="Indicação por link → comissão recorrente a cada mensalidade paga. Repasse manual via Pix."
        actions={
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90"
          >
            {creating ? "Fechar" : "Novo afiliado"}
          </button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="Afiliados ativos" value={fmtInt(rows.filter((a) => a.status === "active").length)} />
          <MiniStat label="Clientes ativos indicados" value={fmtInt(totalActiveCustomers)} />
          <MiniStat label="Saldo a pagar (todos)" value={fmtBRL(totalPending)} tone />
        </div>
      )}

      {creating && <CreateForm onDone={() => { setCreating(false); load(); }} />}

      {rows && rows.length > 0 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por código, nome ou e-mail…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
        />
      )}

      {error && <ErrorBox message={error} />}
      {!rows && <Skeleton rows={4} />}
      {rows && rows.length === 0 && (
        <Empty>Nenhum afiliado ainda. Clique em “Novo afiliado” para criar o primeiro.</Empty>
      )}
      {rows && rows.length > 0 && filtered.length === 0 && <Empty>Nenhum afiliado para “{q}”.</Empty>}

      {filtered.map((a) => (
        <AffiliateCard
          key={a.id}
          a={a}
          open={openId === a.id}
          onToggle={() => setOpenId((id) => (id === a.id ? null : a.id))}
          onChanged={load}
        />
      ))}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num mt-1 text-2xl font-bold ${tone ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>{value}</div>
    </Card>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [pix, setPix] = useState("");
  const [percent, setPercent] = useState("20");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_create_affiliate", {
      p_name: name,
      p_code: code,
      p_email: email || null,
      p_pix_key: pix || null,
      p_commission_percent: parseFloat(percent || "0"),
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onDone();
  }

  return (
    <Card className="p-5" hover>
      <SectionTitle hint="o afiliado não precisa ter conta no app">Novo afiliado</SectionTitle>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelCls}>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Ex: João Vendedor" />
        </label>
        <label className={labelCls}>
          Código de indicação
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`num ${inputCls}`} placeholder="JOAO10" />
        </label>
        <label className={labelCls}>
          Comissão (%)
          <input type="number" step="0.5" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={`num ${inputCls}`} />
        </label>
        <label className={labelCls}>
          E-mail <span className="text-muted-foreground">(opcional)</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="contato@…" />
        </label>
        <label className={`${labelCls} sm:col-span-2`}>
          Chave Pix <span className="text-muted-foreground">(para o repasse)</span>
          <input value={pix} onChange={(e) => setPix(e.target.value)} className={inputCls} placeholder="CPF, e-mail, telefone ou aleatória" />
        </label>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button onClick={submit} disabled={busy || !name || !code} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50">
          {busy ? "Criando…" : "Criar afiliado"}
        </button>
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

function AffiliateCard({ a, open, onToggle, onChanged }: { a: Affiliate; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  async function linkAccount() {
    if (!linkInput.trim()) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_link_affiliate_user", { p_affiliate_id: a.id, p_query: linkInput.trim() });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Conta vinculada.");
      setLinking(false);
      setLinkInput("");
      onChanged();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(refLink(a.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  }

  async function markPaid() {
    // A RPC liquida TODAS as comissões pendentes/aprovadas NO MOMENTO do clique — o valor abaixo
    // é do último carregamento e pode ter entrado comissão nova desde então (por isso o "≈").
    if (!confirm(`Confirmar que você pagou via Pix para ${a.name}? Isso marca TODAS as comissões pendentes/aprovadas como pagas (≈ ${fmtBRL(a.pending_cents)} no último carregamento).`)) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_mark_commissions_paid", { p_affiliate_id: a.id });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Comissões marcadas como pagas.");
      onChanged();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  // Cortesia: libera o app (Expert) para a CONTA do afiliado, sem cobrança e sem
  // entrar na receita. Exige que o afiliado tenha conta com o e-mail cadastrado.
  async function toggleComp() {
    const grant = !a.account_comp;
    const verb = grant ? "conceder cortesia Expert a" : "remover a cortesia de";
    if (!confirm(`Confirma ${verb} ${a.name}? ${grant ? "A conta dele passa a ter acesso completo sem cobrança." : "A conta volta para o plano Free."}`)) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_set_affiliate_comp", { p_affiliate_id: a.id, p_grant: grant, p_plan_slug: "expert" });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg(grant ? "Cortesia concedida." : "Cortesia removida.");
      onChanged();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  return (
    <Card className="p-5" hover>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle hint={`${a.commission_percent}% por venda`}>{a.name}</SectionTitle>
            <Badge tone={a.status === "active" ? "green" : "neutral"}>{a.status === "active" ? "ativo" : "desativado"}</Badge>
            {a.account_comp && <Badge tone="accent">cortesia {a.account_plan ?? "expert"}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{a.code}</code>
            <span className="truncate">{refLink(a.code)}</span>
            <button onClick={copyLink} className="rounded-md border border-border px-2 py-0.5 text-foreground transition-colors hover:bg-muted">
              {copied ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Saldo a pagar</div>
          <div className="num text-xl font-bold text-emerald-600 dark:text-emerald-400">{fmtBRL(a.pending_cents)}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Indicados" value={fmtInt(a.referred_total)} />
        <Metric label="Clientes ativos" value={fmtInt(a.customers_active)} />
        <Metric label="Já pago" value={fmtBRL(a.paid_cents)} />
        <Metric label="Total gerado" value={fmtBRL(a.lifetime_cents)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={markPaid}
          disabled={busy || a.pending_cents <= 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "…" : "Marcar como pago"}
        </button>
        <button onClick={onToggle} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
          {open ? "Ocultar detalhe" : "Ver detalhe"}
        </button>
        <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted">
          {editing ? "Cancelar edição" : "Editar"}
        </button>
        {a.account_user_id ? (
          <button
            onClick={toggleComp}
            disabled={busy}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-40 ${
              a.account_comp
                ? "border border-border text-foreground hover:bg-muted"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {a.account_comp ? "Remover cortesia" : "Conceder cortesia"}
          </button>
        ) : (
          <button
            onClick={() => setLinking((v) => !v)}
            title="Vincular o afiliado a uma conta do app para poder conceder cortesia."
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {linking ? "Cancelar" : "Vincular conta"}
          </button>
        )}
        {a.pix_key && <span className="text-xs text-muted-foreground">Pix: <span className="text-foreground">{a.pix_key}</span></span>}
        {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
      </div>

      {linking && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="e-mail ou ID da conta no app"
            className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
          <button onClick={linkAccount} disabled={busy || !linkInput.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40">
            {busy ? "…" : "Vincular"}
          </button>
          <span className="text-xs text-muted-foreground">depois disso o botão de cortesia aparece.</span>
        </div>
      )}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}

      {editing && <EditForm a={a} onDone={() => { setEditing(false); onChanged(); }} />}
      {open && <AffiliateDetail id={a.id} />}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EditForm({ a, onDone }: { a: Affiliate; onDone: () => void }) {
  const [name, setName] = useState(a.name);
  const [email, setEmail] = useState(a.email ?? "");
  const [pix, setPix] = useState(a.pix_key ?? "");
  const [percent, setPercent] = useState(a.commission_percent.toString());
  const [status, setStatus] = useState(a.status);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("admin_update_affiliate", {
      p_id: a.id,
      p_name: name,
      p_email: email || null,
      p_pix_key: pix || null,
      p_commission_percent: parseFloat(percent || "0"),
      p_status: status,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else onDone();
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={labelCls}>Nome<input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
        <label className={labelCls}>Comissão (%)<input type="number" step="0.5" min="0" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={`num ${inputCls}`} /></label>
        <label className={labelCls}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "disabled")} className={inputCls}>
            <option value="active">Ativo</option>
            <option value="disabled">Desativado</option>
          </select>
        </label>
        <label className={labelCls}>E-mail<input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></label>
        <label className={`${labelCls} sm:col-span-2`}>Chave Pix<input value={pix} onChange={(e) => setPix(e.target.value)} className={inputCls} /></label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </div>
  );
}

const COMMISSION_LABEL: Record<string, { label: string; tone: "green" | "yellow" | "neutral" | "red" }> = {
  pending: { label: "pendente", tone: "yellow" },
  approved: { label: "aprovada", tone: "yellow" },
  paid: { label: "paga", tone: "green" },
  reversed: { label: "estornada", tone: "red" },
};

function AffiliateDetail({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("admin_affiliate_detail", { p_id: id }).then(({ data, error }) => {
      if (error) setErr(error.message);
      else setData(data as Detail);
    });
  }, [id]);

  if (err) return <div className="mt-4"><ErrorBox message={err} /></div>;
  if (!data) return <div className="mt-4"><Skeleton rows={3} /></div>;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indicados ({data.referrals.length})</div>
        {data.referrals.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Ninguém ainda.</div>
        ) : (
          <ul className="space-y-1.5">
            {data.referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground" title={r.email}>{r.full_name || r.email}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={r.plan_slug && r.plan_slug !== "free" ? "accent" : "neutral"}>{r.plan_slug ?? "—"}</Badge>
                  <span className="text-muted-foreground">{fmtDate(r.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comissões ({data.commissions.length})</div>
        {data.commissions.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Nenhuma comissão registrada.</div>
        ) : (
          <ul className="space-y-1.5">
            {data.commissions.map((c) => {
              const st = COMMISSION_LABEL[c.status] ?? { label: c.status, tone: "neutral" as const };
              return (
                <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground" title={c.customer_email ?? ""}>{fmtDate(c.created_at)} · {c.customer_email ?? "—"}</span>
                  <span className="flex items-center gap-2">
                    <span className="num font-semibold text-foreground">{fmtBRL(c.commission_amount_cents)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
