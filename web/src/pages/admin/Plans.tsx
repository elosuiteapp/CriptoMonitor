import { useEffect, useState } from "react";

import { IconPlans } from "../../components/admin/icons";
import { Badge, Card, Empty, ErrorBox, PageHeader } from "../../components/admin/ui";
import { supabase } from "../../lib/supabase";
import { fmtBRL, fmtUSD } from "../../lib/adminFormat";
import type { PlanRow } from "../../lib/adminTypes";

const ALL_ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI", "TON", "POL", "DOT", "LTC", "AAVE", "UNI", "LDO", "ARB", "ATOM", "PEPE"];
const ALL_CHANNELS = ["inapp", "email"];
const ALL_MODULES = [{ key: "crypto", label: "Cripto" }, { key: "b3", label: "B3" }, { key: "forex", label: "Forex" }];
// Planos mantidos SÓ para assinantes antigos (sql/078) — não são vendidos no checkout.
const LEGACY_SLUGS = ["pro", "expert"];

export default function Plans() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("plans").select("*").order("sort_order");
    if (error) setError(error.message);
    else setPlans(data as PlanRow[]);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<IconPlans />}
        title="Planos"
        subtitle="Limites e preços do produto — alterar um valor muda o gating na hora, sem deploy."
      />
      <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
        Cobrança por idioma: <b className="text-foreground">PT → Asaas (reais)</b> usa o preço em R$;{" "}
        <b className="text-foreground">EN → Paddle (dólar)</b> usa o preço em US$ e o <i>Paddle price id</i>. Clique num plano para editar.
      </div>
      {error && <ErrorBox message={error} />}
      {!plans && !error && <Empty>Carregando…</Empty>}
      {plans?.map((p) => (
        <PlanEditor key={p.id} plan={p} open={open === p.slug} onToggle={() => setOpen(open === p.slug ? null : p.slug)} onSaved={load} />
      ))}
    </div>
  );
}

function PlanEditor({ plan, open, onToggle, onSaved }: { plan: PlanRow; open: boolean; onToggle: () => void; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [priceReais, setPriceReais] = useState((plan.price_cents / 100).toString());
  const [priceUsd, setPriceUsd] = useState((plan.price_usd_cents / 100).toString());
  const [annualReais, setAnnualReais] = useState(((plan.price_annual_cents ?? 0) / 100).toString());
  const [annualUsd, setAnnualUsd] = useState(((plan.price_usd_annual_cents ?? 0) / 100).toString());
  const [modules, setModules] = useState<string[]>(plan.modules ?? []);
  const [paddleId, setPaddleId] = useState(plan.paddle_price_id ?? "");
  const [assets, setAssets] = useState<string[]>(plan.assets);
  const [snapMin, setSnapMin] = useState(plan.snapshot_interval_min.toString());
  const [advanced, setAdvanced] = useState(plan.advanced_metrics);
  const [chartLayers, setChartLayers] = useState(plan.chart_layers);
  const [smartMoney, setSmartMoney] = useState(plan.smart_money);
  const [aiLimit, setAiLimit] = useState(plan.ai_daily_limit == null ? "" : plan.ai_daily_limit.toString());
  const [aiModel, setAiModel] = useState(plan.ai_model);
  const [channels, setChannels] = useState<string[]>(plan.alert_channels);
  const [historyDays, setHistoryDays] = useState(plan.history_days == null ? "" : plan.history_days.toString());

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isLegacy = LEGACY_SLUGS.includes(plan.slug);
  const mensal = Math.round(parseFloat(priceReais || "0") * 100);
  const mensalUsd = Math.round(parseFloat(priceUsd || "0") * 100);
  const anual = Math.round(parseFloat(annualReais || "0") * 100);
  // Desconto implícito do anual vs 12× o mensal — ajuda a conferir se o preço anual faz sentido.
  const descAnual = mensal > 0 && anual > 0 ? Math.round((1 - anual / (mensal * 12)) * 100) : null;

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase.rpc("admin_update_plan", {
      p_slug: plan.slug,
      p_name: name,
      p_price_cents: mensal,
      p_price_usd_cents: mensalUsd,
      p_price_annual_cents: anual,
      p_price_usd_annual_cents: Math.round(parseFloat(annualUsd || "0") * 100),
      p_paddle_price_id: paddleId.trim() || null,
      p_modules: modules,
      p_preview_layers: plan.preview_layers ?? [],
      p_assets: assets,
      p_snapshot_interval_min: parseInt(snapMin || "30", 10),
      p_advanced: advanced,
      p_chart_layers: chartLayers,
      p_smart_money: smartMoney,
      p_ai_daily_limit: aiLimit === "" ? null : parseInt(aiLimit, 10),
      p_ai_model: aiModel,
      p_alert_channels: channels,
      p_history_days: historyDays === "" ? null : parseInt(historyDays, 10),
    });
    setBusy(false);
    if (error) setErr(error.message);
    else {
      setMsg("Plano salvo.");
      onSaved();
      setTimeout(() => setMsg(null), 2500);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary";
  const labelCls = "text-xs text-muted-foreground";
  const sectionCls = "rounded-lg border border-border/70 bg-background/40 p-4";
  const sectionTitleCls = "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <Card className="overflow-hidden" hover>
      {/* ── Resumo (sempre visível): clique abre o editor ── */}
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span className="text-sm font-semibold text-foreground">{plan.name}</span>
          <span className="num text-[10px] text-muted-foreground">{plan.slug}</span>
          {isLegacy && <Badge tone="yellow">legado · não vendável</Badge>}
          {(plan.modules ?? []).map((m) => (
            <Badge key={m} tone="accent">{ALL_MODULES.find((x) => x.key === m)?.label ?? m}</Badge>
          ))}
          {(plan.modules ?? []).length === 0 && <Badge>sem módulos (vitrine)</Badge>}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><span className="num font-semibold text-foreground">{fmtBRL(plan.price_cents)}</span>/mês{plan.price_annual_cents > 0 && <> · <span className="num">{fmtBRL(plan.price_annual_cents)}</span>/ano</>}</span>
          {plan.price_usd_cents > 0 && <span className="num">{fmtUSD(plan.price_usd_cents)}/mo</span>}
          <span>{plan.assets.length} ativos</span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-5 py-4">
          {/* 1 · Preços & cobrança */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}>1 · Preços & cobrança</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelCls}>
                Nome do plano
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </label>
              <label className={labelCls}>
                Mensal — R$ <span className="text-muted-foreground">(Asaas · PT)</span>
                <input type="number" step="0.01" min="0" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                Mensal — US$ <span className="text-muted-foreground">(Paddle · EN)</span>
                <input type="number" step="0.01" min="0" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                Paddle price id
                <input value={paddleId} onChange={(e) => setPaddleId(e.target.value)} placeholder="pri_01h…" className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                Anual — R$ <span className="text-muted-foreground">(0 = sem plano anual)</span>
                <input type="number" step="0.01" min="0" value={annualReais} onChange={(e) => setAnnualReais(e.target.value)} className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                Anual — US$
                <input type="number" step="0.01" min="0" value={annualUsd} onChange={(e) => setAnnualUsd(e.target.value)} className={`num ${inputCls}`} />
              </label>
              {descAnual !== null && (
                <div className="flex items-end pb-2 text-xs text-muted-foreground sm:col-span-2">
                  <span>Anual sai por <b className={`num ${descAnual > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>{descAnual}% {descAnual > 0 ? "de desconto" : "MAIS CARO"}</b> vs 12× o mensal.</span>
                </div>
              )}
            </div>
          </div>

          {/* 2 · Acesso (o que o plano libera) */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}>2 · Acesso — o que o assinante enxerga</div>
            <div className="mt-3 space-y-4">
              <div>
                <div className={labelCls}>Módulos <span className="text-muted-foreground">(a base do entitlement — libera Cripto, B3 e/ou Forex)</span></div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_MODULES.map((m) => (
                    <Chip key={m.key} active={modules.includes(m.key)} onClick={() => toggle(modules, setModules, m.key)}>{m.label}</Chip>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <div className={labelCls}>Ativos cripto liberados <span className="num text-muted-foreground">({assets.length}/{ALL_ASSETS.length})</span></div>
                  <button type="button" onClick={() => setAssets([...ALL_ASSETS])} className="text-[11px] text-primary hover:underline">todos</button>
                  <button type="button" onClick={() => setAssets([])} className="text-[11px] text-muted-foreground hover:underline">limpar</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ALL_ASSETS.map((a) => (
                    <Chip key={a} active={assets.includes(a)} onClick={() => toggle(assets, setAssets, a)}>{a}</Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className={labelCls}>Canais de alerta</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ALL_CHANNELS.map((c) => (
                      <Chip key={c} active={channels.includes(c)} onClick={() => toggle(channels, setChannels, c)}>
                        {c === "inapp" ? "In-app + push" : c === "email" ? "E-mail" : c}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 pb-1">
                  <Check label="Métricas avançadas" checked={advanced} onChange={setAdvanced} />
                  <Check label="Camadas no gráfico" checked={chartLayers} onChange={setChartLayers} />
                  <Check label="Smart Money (SMC)" checked={smartMoney} onChange={setSmartMoney} />
                </div>
              </div>
            </div>
          </div>

          {/* 3 · Limites & recursos */}
          <div className={sectionCls}>
            <div className={sectionTitleCls}>3 · Limites & recursos</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelCls}>
                Atualização dos dados (min)
                <input type="number" min="1" value={snapMin} onChange={(e) => setSnapMin(e.target.value)} className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                IA por dia <span className="text-muted-foreground">(vazio = ilimitado)</span>
                <input type="number" min="0" value={aiLimit} onChange={(e) => setAiLimit(e.target.value)} className={`num ${inputCls}`} />
              </label>
              <label className={labelCls}>
                Modelo de IA
                <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={inputCls} />
              </label>
              <label className={labelCls}>
                Histórico (dias) <span className="text-muted-foreground">(vazio = completo)</span>
                <input type="number" min="0" value={historyDays} onChange={(e) => setHistoryDays(e.target.value)} className={`num ${inputCls}`} />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50">
              {busy ? "Salvando…" : "Salvar plano"}
            </button>
            {msg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</span>}
          </div>
          {err && <ErrorBox message={err} />}
        </div>
      )}
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}
